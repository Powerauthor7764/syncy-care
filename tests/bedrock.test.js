import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rewordApproved, probeBedrock } from '../src/core/aws.js';
import { ask, runTool, store } from '../src/core/service.js';
import { isSafeRewording } from '../src/core/safety.js';

const prior = {
  BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID,
  AWS_PROFILE: process.env.AWS_PROFILE,
  AWS_REGION: process.env.AWS_REGION,
  SYNCY_BEDROCK_STUB: process.env.SYNCY_BEDROCK_STUB,
};

afterEach(() => {
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('bedrock reword helpers', () => {
  test('rewordApproved is a no-op without BEDROCK_MODEL_ID', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    delete process.env.SYNCY_BEDROCK_STUB;
    const text = 'Approved care-plan line with Source: CarePlan/demo-1.';
    assert.equal(await rewordApproved(text), text);
  });

  test('probeBedrock reports missing model id', async () => {
    delete process.env.BEDROCK_MODEL_ID;
    delete process.env.SYNCY_BEDROCK_STUB;
    const result = await probeBedrock();
    assert.equal(result.ok, false);
    assert.match(result.reason, /BEDROCK_MODEL_ID/);
  });

  test('stubbed success returns simpler text', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'ok';
    const out = await rewordApproved('Bloodwork at 9 AM.');
    assert.match(out, /^Simpler words:/);
  });

  test('stubbed failure makes probeBedrock fail closed', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.AWS_REGION = 'us-east-2';
    process.env.SYNCY_BEDROCK_STUB = 'fail';
    const result = await probeBedrock();
    assert.equal(result.ok, false);
    assert.match(result.reason, /stubbed bedrock failure/);
  });

  test('unsafe stubbed reword is rejected by isSafeRewording', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'unsafe';
    const original = 'Today you have bloodwork at 9 AM.';
    const proposed = await rewordApproved(original);
    assert.equal(isSafeRewording(original, proposed), false);
  });
});

describe('simplify_text with bedrock stubs', () => {
  test('fail-closed keeps approved text when bedrock errors', async () => {
    await store.reset();
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'fail';
    const approved = await ask('maria', "What's happening today?");
    assert.ok(approved.text);
    const simplified = await runTool('simplify_text', { patientId: 'maria' });
    assert.equal(simplified.reworded, false);
    assert.equal(simplified.text, approved.text);
  });

  test('safe stub rewords simplify_text output', async () => {
    await store.reset();
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'ok';
    const approved = await ask('jordan', "What's happening today?");
    const simplified = await runTool('simplify_text', { patientId: 'jordan' });
    assert.equal(simplified.reworded, true);
    assert.match(simplified.text, /^Simpler words:/);
    assert.ok(approved.text);
  });
});
