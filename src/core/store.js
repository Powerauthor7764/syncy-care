import { PATIENTS, TOPICS } from './data.js';
import { awsJson } from './aws.js';
function blankState(id) { return {
  patientId:id, understanding:Object.fromEntries(TOPICS.map(t=>[t,'not_reviewed'])),
  questions:[], teachbacks:[], audit:[], lastApprovedText:null, updatedAt:new Date().toISOString()
}; }
export class MemoryStore {
  constructor() { this.data = new Map(); this.kind = 'memory'; }
  async get(id) { if (!this.data.has(id)) this.data.set(id,blankState(id)); return structuredClone(this.data.get(id)); }
  async put(id,state) { state.updatedAt=new Date().toISOString(); this.data.set(id,structuredClone(state)); }
  async reset() { this.data.clear(); }
}
export class DynamoStore {
  constructor(table) { this.table=table; this.kind='dynamodb'; }
  async call(target, data) {
    const region=process.env.AWS_REGION || 'us-east-1';
    return awsJson({service:'dynamodb',region,host:`dynamodb.${region}.amazonaws.com`,path:'/',headers:{'x-amz-target':`DynamoDB_20120810.${target}`},body:{TableName:this.table,...data}});
  }
  async get(id) {
    const res=await this.call('GetItem',{Key:{patientId:{S:id}},ConsistentRead:true});
    return res.Item?.state?.S ? JSON.parse(res.Item.state.S) : blankState(id);
  }
  async put(id,state) {
    state.updatedAt=new Date().toISOString();
    await this.call('PutItem',{Item:{patientId:{S:id},state:{S:JSON.stringify(state)}}});
  }
  async reset() { for (const id of Object.keys(PATIENTS)) await this.put(id,blankState(id)); }
}
export const store = process.env.SYNCY_TABLE ? new DynamoStore(process.env.SYNCY_TABLE) : new MemoryStore();
// Lock serializes state mutations per synthetic patient on this one Node process.
// DynamoDB remains a demo adapter; multiple-process writes are not transaction-safe.
const inflight = new Map();
export async function modifyState(patientId, action) {
  const previous = inflight.get(patientId) || Promise.resolve();
  const next = previous.catch(()=>{}).then(async()=>{
    const state=await store.get(patientId);
    const result=await action(state);
    await store.put(patientId,state);
    return result;
  });
  inflight.set(patientId,next);
  try { return await next; } finally { if (inflight.get(patientId)===next) inflight.delete(patientId); }
}
