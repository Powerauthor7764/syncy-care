import { PATIENTS, TOPICS } from './data.js';
import { awsJson } from './aws.js';

export function blankState(id) {
  return {
    patientId: id,
    understanding: Object.fromEntries(TOPICS.map((t) => [t, 'not_reviewed'])),
    questions: [],
    teachbacks: [],
    audit: [],
    lastApprovedText: null,
    lastSourceRecords: [],
    lastFocusEventId: null,
    turns: [],
    timelineStep: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function stateKey(sessionId, patientId) {
  return `${sessionId || 'default'}:${patientId}`;
}

export class MemoryStore {
  constructor() {
    this.data = new Map();
    this.kind = 'memory';
  }
  async get(id) {
    if (!this.data.has(id)) this.data.set(id, blankState(id.includes(':') ? id.split(':').pop() : id));
    return structuredClone(this.data.get(id));
  }
  async put(id, state) {
    state.updatedAt = new Date().toISOString();
    this.data.set(id, structuredClone(state));
  }
  async reset() {
    this.data.clear();
  }
  async resetSession(sessionId) {
    const prefix = `${sessionId || 'default'}:`;
    for (const key of [...this.data.keys()]) if (key.startsWith(prefix)) this.data.delete(key);
  }
}

export class DynamoStore {
  constructor(table) {
    this.table = table;
    this.kind = 'dynamodb';
  }
  async call(target, data) {
    const region = process.env.AWS_REGION || 'us-east-1';
    return awsJson({
      service: 'dynamodb',
      region,
      host: `dynamodb.${region}.amazonaws.com`,
      path: '/',
      headers: { 'x-amz-target': `DynamoDB_20120810.${target}` },
      body: { TableName: this.table, ...data },
    });
  }
  async get(id) {
    const res = await this.call('GetItem', { Key: { patientId: { S: id } }, ConsistentRead: true });
    return res.Item?.state?.S ? JSON.parse(res.Item.state.S) : blankState(id.includes(':') ? id.split(':').pop() : id);
  }
  async put(id, state) {
    state.updatedAt = new Date().toISOString();
    await this.call('PutItem', { Item: { patientId: { S: id }, state: { S: JSON.stringify(state) } } });
  }
  async reset() {
    for (const id of Object.keys(PATIENTS)) await this.put(id, blankState(id));
  }
  async resetSession(sessionId) {
    for (const id of Object.keys(PATIENTS)) await this.put(stateKey(sessionId, id), blankState(id));
  }
}

export const store = process.env.SYNCY_TABLE ? new DynamoStore(process.env.SYNCY_TABLE) : new MemoryStore();

const inflight = new Map();
export async function modifyState(sessionId, patientId, action) {
  const key = stateKey(sessionId, patientId);
  const previous = inflight.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const state = await store.get(key);
    const result = await action(state);
    await store.put(key, state);
    return result;
  });
  inflight.set(key, next);
  try {
    return await next;
  } finally {
    if (inflight.get(key) === next) inflight.delete(key);
  }
}
