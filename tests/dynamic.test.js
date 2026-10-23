import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ask,
  runTool,
  reviewQuestion,
  advanceTimeline,
  resetDemoPatient,
  getPatientView,
  store,
} from '../src/core/service.js';
import { createApp } from '../src/server.js';

beforeEach(async () => {
  await store.reset();
});

describe('context-aware ask', () => {
  test('after lunch follows today plan with afternoon events and sources', async () => {
    await ask('maria', "What's happening today?", 'sess-a');
    const follow = await ask('maria', 'What about after lunch?', 'sess-a');
    assert.equal(follow.policy, 'GREEN');
    assert.match(follow.text, /3:00 PM|Abdominal ultrasound/i);
    assert.ok(follow.sourceRecords?.length);
    assert.ok(follow.suggestions?.length);
  });

  test('explain previous more simply uses last approved text path', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'ok';
    await ask('maria', "What's happening today?", 'sess-b');
    const simplified = await ask('maria', 'Explain the previous answer more simply', 'sess-b');
    assert.equal(simplified.tool, 'simplify_text');
    assert.equal(simplified.reworded, true);
    delete process.env.SYNCY_BEDROCK_STUB;
    delete process.env.BEDROCK_MODEL_ID;
  });

  test('which record returns source focus from prior answer', async () => {
    await ask('maria', "What's happening today?", 'sess-c');
    const src = await ask('maria', 'Which record is that information from?', 'sess-c');
    assert.equal(src.tool, 'get_source_focus');
    assert.match(src.text, /source record/i);
  });

  test('cross-patient isolation of conversation context', async () => {
    await ask('maria', "What's happening today?", 'sess-iso');
    const jordan = await ask('jordan', 'Which record is that information from?', 'sess-iso');
    assert.match(jordan.text, /Ask a care-plan question first|no record/i);
  });

  test('RED clinical question queues and is not sent to Bedrock', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'ok';
    const red = await ask('maria', 'Should I stop taking my medication?', 'sess-red');
    assert.equal(red.policy, 'RED');
    assert.equal(red.queued, true);
    assert.equal(red.reworded, undefined);
    const view = await getPatientView('maria', 'sess-red');
    assert.equal(view.questions[0].status, 'pending');
    assert.match(view.questions[0].patientLabel, /Awaiting review/i);
    delete process.env.SYNCY_BEDROCK_STUB;
    delete process.env.BEDROCK_MODEL_ID;
  });
});

describe('timeline simulate', () => {
  test('advance updates today pending and changes together', async () => {
    const before = await getPatientView('maria', 'sess-tl');
    assert.equal(before.timelineStep, 0);
    const after = await advanceTimeline('maria', 'sess-tl');
    assert.equal(after.timelineStep, 1);
    assert.match(after.timelineLabel, /ultrasound completed/i);
    assert.ok(after.today.some((x) => x.id === 'SR-02047' && x.status === 'done'));
    assert.ok(after.pending.some((x) => /Ultrasound results/i.test(x.label)));
    assert.ok(after.changes.length >= before.changes.length);
  });

  test('reset returns to step 0 and clears questions', async () => {
    await ask('maria', 'Should I stop taking my medication?', 'sess-rs');
    await advanceTimeline('maria', 'sess-rs');
    const reset = await resetDemoPatient('maria', 'sess-rs');
    assert.equal(reset.timelineStep, 0);
    assert.equal(reset.questions.length, 0);
  });

  test('separate demo sessions do not share timeline step', async () => {
    await advanceTimeline('maria', 'sess-1');
    const a = await getPatientView('maria', 'sess-1');
    const b = await getPatientView('maria', 'sess-2');
    assert.equal(a.timelineStep, 1);
    assert.equal(b.timelineStep, 0);
  });
});

describe('question queue review loop', () => {
  test('care-team review updates patient-visible status', async () => {
    const red = await ask('maria', 'Can I go home today?', 'sess-q');
    assert.ok(red.questionId);
    const reviewed = await reviewQuestion(red.questionId, 'sess-q');
    assert.equal(reviewed.status, 'reviewed');
    const view = await getPatientView('maria', 'sess-q');
    assert.equal(view.questions[0].status, 'reviewed');
    assert.match(view.questions[0].patientLabel, /Reviewed/i);
  });

  test('review finds question even when session header differs (same process)', async () => {
    const red = await ask('maria', 'Should I stop taking my medication?', 'sess-create');
    assert.ok(red.questionId);
    const reviewed = await reviewQuestion(red.questionId, 'sess-other-header');
    assert.equal(reviewed.status, 'reviewed');
    assert.equal(reviewed.patientId, 'maria');
  });
});

describe('http session cookie isolation', () => {
  test('advance with distinct session headers stays isolated', async () => {
    await store.reset();
    const app = createApp();
    await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
    const { port } = app.address();
    const post = async (session, path, body) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-syncy-session': session },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 200);
      return res.json();
    };
    const get = async (session, path) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        headers: { 'x-syncy-session': session },
      });
      return res.json();
    };
    await post('http-session-a', '/api/demo/advance', { patientId: 'maria' });
    const a = await get('http-session-a', '/api/patients/maria');
    const b = await get('http-session-b', '/api/patients/maria');
    assert.equal(a.timelineStep, 1);
    assert.equal(b.timelineStep, 0);
    await new Promise((resolve) => app.close(resolve));
  });
});

describe('bedrock modes stub', () => {
  test('short mode stub rewords', async () => {
    process.env.BEDROCK_MODEL_ID = 'us.amazon.nova-micro-v1:0';
    process.env.SYNCY_BEDROCK_STUB = 'ok';
    await ask('jordan', "What's happening today?", 'sess-mode');
    const out = await runTool('simplify_text', { patientId: 'jordan', mode: 'short' }, 'sess-mode');
    assert.equal(out.reworded, true);
    assert.equal(out.explanationMode, 'short');
    assert.match(out.text, /^Short:/);
    delete process.env.SYNCY_BEDROCK_STUB;
    delete process.env.BEDROCK_MODEL_ID;
  });
});
