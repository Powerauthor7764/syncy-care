import { randomUUID } from 'node:crypto';
import {
  COMMON_ROUNDS,
  GLOSSARY,
  PATIENTS,
  getPatient,
  patientList,
  sourceOf,
  TOPICS,
  resolveActiveChart,
  getTimelineSteps,
  timeToMinutes,
} from './data.js';
import { classify, RED_REPLY, isSafeRewording } from './safety.js';
import { diffSnapshots } from './diff.js';
import { evaluateTeachBack } from './teachback.js';
import { modifyState, store, stateKey, blankState } from './store.js';
import { rewordApproved } from './aws.js';

export { classify, RED_REPLY, PATIENTS, patientList, store, stateKey };
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}

const DEMO_DISCLAIMER =
  'Simulation only — no real nurse or doctor is notified. This is a hackathon demonstration queue.';

const makeResult = (policy, source, text, records = [], extra = {}) => ({
  policy,
  source,
  text,
  record: records[0] || null,
  sourceRecords: records,
  ...extra,
});

const mustText = (value, field, limit = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new UserError(`${field} must be 1-${limit} characters`);
  return value.trim();
};

const checkPatient = (id) => {
  const p = getPatient(id);
  if (!p) throw new UserError('Unknown synthetic patient ID', 404);
  return p;
};

const sessionOrDefault = (sessionId) => (sessionId && String(sessionId).trim()) || 'default';

function queue(state, question) {
  const normalized = question.trim();
  const record = {
    id: randomUUID(),
    question: normalized,
    status: 'pending',
    priority: 'Patient-requested review',
    demo: true,
    patientLabel: 'Awaiting review',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    disclaimer: DEMO_DISCLAIMER,
  };
  state.questions.unshift(record);
  state.questions = state.questions.slice(0, 100);
  return record;
}

function markExplained(state, topic) {
  if (state.understanding[topic] === 'not_reviewed') state.understanding[topic] = 'explained';
}

function activePatient(base, state) {
  return resolveActiveChart(base, state.timelineStep || 0);
}

function suggestionsFor(tool, policy) {
  if (policy === 'RED')
    return ['What should I ask my nurse?', "What's happening today?", 'What am I waiting for?'];
  if (tool === 'get_today_care_plan')
    return ['What about after lunch?', 'Explain that in simpler words', 'Which record is that from?'];
  if (tool === 'get_changes_since')
    return ['What am I waiting for?', "What's happening today?", 'Explain that in simpler words'];
  if (tool === 'get_pending_events')
    return ["What's happening today?", 'What changed since yesterday?', 'What should I ask my nurse?'];
  if (tool === 'simplify_text')
    return ['What should I ask my nurse?', 'What am I waiting for?', 'What changed since yesterday?'];
  if (tool === 'afternoon_focus' || tool === 'source_focus')
    return ['Explain that in simpler words', 'What am I waiting for?', 'What should I ask my nurse?'];
  return ['What changed since yesterday?', 'What am I waiting for?', 'Explain that in simpler words'];
}

function recordTurn(state, question, result, tool) {
  state.turns = state.turns || [];
  state.turns.push({
    role: 'user',
    text: question,
    tool,
    records: result.sourceRecords || [],
    at: new Date().toISOString(),
  });
  state.turns.push({
    role: 'assistant',
    text: result.text,
    tool,
    records: result.sourceRecords || [],
    at: new Date().toISOString(),
  });
  state.turns = state.turns.slice(-12);
  if (result.sourceRecords?.length) state.lastSourceRecords = result.sourceRecords;
  if (result.items?.[0]?.id) state.lastFocusEventId = result.items[0].id;
}

const SIMPLIFY_PROMPTS = {
  short:
    'Rewrite ONLY the approved text as a very short summary (2-4 short sentences max). Keep every fact and uncertainty. Never add medical advice, diagnoses, dose changes, or recommendations. Return only the rewrite.',
  simple:
    'You simplify ONLY the exact approved text given using everyday words. Keep every fact and its uncertainty. Never add medical advice, clinical interpretations, dose instructions, diagnoses, timing changes, or recommendations. Do not change the meaning. Return only a simpler paraphrase.',
  steps:
    'Rewrite ONLY the approved text as a clear numbered or bulleted step-by-step list. Keep every fact and uncertainty. Never add medical advice, diagnoses, dose changes, or recommendations. Return only the rewrite.',
};

async function execute(name, p, state, args) {
  const chart = activePatient(p, state);

  if (name === 'get_today_care_plan') {
    const records = chart.today.map(sourceOf);
    markExplained(state, 'plan');
    return makeResult(
      'GREEN',
      'care_plan',
      chart.today.map((x) => `${x.time}: ${x.title} (${x.status === 'done' ? 'done' : 'to do'})`).join('\n'),
      records,
      { items: chart.today },
    );
  }
  if (name === 'get_afternoon_plan') {
    const afternoon = chart.today.filter((x) => {
      const mins = timeToMinutes(x.time);
      return mins !== null && mins >= 12 * 60;
    });
    if (!afternoon.length) {
      return makeResult(
        'GREEN',
        'care_plan',
        'This synthetic chart does not list events after lunch for the active snapshot. Ask about today\'s full plan or pending items.',
        [],
        { items: [] },
      );
    }
    markExplained(state, 'plan');
    const records = afternoon.map(sourceOf);
    state.lastFocusEventId = afternoon[0].id;
    return makeResult(
      'GREEN',
      'care_plan',
      `After lunch on this synthetic plan:\n${afternoon.map((x) => `${x.time}: ${x.title} (${x.status === 'done' ? 'done' : 'to do'})${x.note ? ` — ${x.note}` : ''}`).join('\n')}`,
      records,
      { items: afternoon },
    );
  }
  if (name === 'get_source_focus') {
    const records = state.lastSourceRecords?.length
      ? state.lastSourceRecords
      : state.lastApprovedText
        ? []
        : [];
    if (!state.lastApprovedText && !records.length) {
      return makeResult(
        'GREEN',
        'general_education',
        'Ask a care-plan question first so I can show which synthetic record the answer came from.',
        [],
      );
    }
    const list = records.length ? records.map((r) => `• ${r}`).join('\n') : '• (no record IDs on the last answer)';
    return makeResult(
      'GREEN',
      'care_plan',
      `That information came from these approved synthetic source record(s):\n${list}\n\nLast approved answer:\n${state.lastApprovedText || '(none)'}`,
      records,
    );
  }
  if (name === 'get_changes_since') {
    const changes = diffSnapshots(chart.yesterday, chart.snapshot);
    markExplained(state, 'plan');
    return makeResult(
      'GREEN',
      'care_plan',
      `${changes.length} change${changes.length === 1 ? '' : 's'} since yesterday:\n${changes.map((x) => `• ${x.description}`).join('\n')}`,
      changes.map((x) => x.record),
      { items: changes, count: changes.length },
    );
  }
  if (name === 'get_pending_events') {
    markExplained(state, 'tests');
    return makeResult(
      'GREEN',
      'care_plan',
      chart.pending.map((x) => `• ${x.label}`).join('\n'),
      chart.pending.map((x) => x.record),
      { items: chart.pending },
    );
  }
  if (name === 'get_approved_patient_explanation') {
    const topic = String(args.topic || 'test').toLowerCase();
    if (!['test', 'medication', 'other'].includes(topic)) throw new UserError('topic must be test, medication or other');
    if (topic !== 'other') markExplained(state, topic === 'test' ? 'tests' : 'meds');
    const info = topic === 'other' ? null : chart.rationales[topic];
    if (!info) {
      const record = queue(state, mustText(args.question || `Why was the ${topic} plan changed?`, 'question'));
      return makeResult(
        'YELLOW',
        'ask_care_team',
        `The synthetic chart does not include an approved explanation for this ${topic}. I've saved your question for the demo care-team queue. ${DEMO_DISCLAIMER}`,
        [],
        { queued: true, questionId: record.id, demo: true },
      );
    }
    let out = info.text;
    let questionId = null;
    if (info.followUp) {
      const record = queue(state, mustText(args.question || `Can you explain the reason for the ${topic} change?`, 'question'));
      questionId = record.id;
      out += ` Your question has also been sent to the demo care-team queue for clarification. ${DEMO_DISCLAIMER}`;
    }
    return makeResult('YELLOW', 'care_plan', out, [info.record], { queued: !!questionId, questionId, demo: true });
  }
  if (name === 'get_discharge_requirements') {
    const d = chart.discharge;
    markExplained(state, 'dc');
    markExplained(state, 'fu');
    const text = [
      d.label,
      'Recorded medication instructions (read back exactly; verify with your care team):',
      ...chart.medications.map((m) => `• ${m.name}: ${m.instruction}`),
      'Approved/recorded instructions:',
      ...d.instructions.map((x) => `• ${x}`),
      'Follow-up:',
      ...d.followUps.map((x) => `• ${x}`),
      'Hospital warning-sign information:',
      ...d.warningSigns.map((x) => `• ${x}`),
      `Contact: ${d.contact}`,
    ].join('\n');
    return makeResult('GREEN', 'care_plan', text, [d.record, ...chart.medications.map((m) => m.record)], {
      data: { ...d, medications: chart.medications.map(({ name, instruction, record }) => ({ name, instruction, record })) },
    });
  }
  if (name === 'get_rounds_questions') {
    return makeResult(
      'GREEN',
      'general_education',
      [...COMMON_ROUNDS, ...chart.specificQuestions].map((x, i) => `${i + 1}. ${x}`).join('\n'),
      [],
      { items: [...COMMON_ROUNDS, ...chart.specificQuestions] },
    );
  }
  if (name === 'create_question_for_team') {
    const question = mustText(args.question, 'question');
    const result = queue(state, question);
    return makeResult('RED', 'ask_care_team', RED_REPLY, [], {
      queued: true,
      questionId: result.id,
      demo: true,
      questionStatus: 'pending',
      disclaimer: DEMO_DISCLAIMER,
    });
  }
  if (name === 'get_patient_questions') {
    const items = state.questions.map((q) => ({
      ...q,
      patientLabel: q.status === 'reviewed' ? 'Reviewed (demo)' : 'Awaiting review',
    }));
    return makeResult(
      'GREEN',
      'ask_care_team',
      items.length
        ? `${items.length} saved demo question(s). ${DEMO_DISCLAIMER}`
        : 'No saved demo questions yet.',
      [],
      { items, disclaimer: DEMO_DISCLAIMER },
    );
  }
  if (name === 'get_understanding_state') {
    return makeResult(
      'GREEN',
      'care_plan',
      'These are self-reported or rule-checked understanding flags, not a clinical assessment.',
      [],
      {
        understanding: state.understanding,
        teachbacks: state.teachbacks.slice(0, 30),
        topicsNeedingClarification: TOPICS.filter((t) => state.understanding[t] === 'needs_clarification'),
      },
    );
  }
  if (name === 'set_understanding') {
    const topic = mustText(args.topic, 'topic', 40);
    const status = mustText(args.status, 'status', 40);
    if (!TOPICS.includes(topic) || !['understood', 'needs_clarification'].includes(status))
      throw new UserError('Choose a valid topic and understood or needs_clarification');
    state.understanding[topic] = status;
    return makeResult(
      'GREEN',
      'care_plan',
      status === 'understood' ? 'Your self-reported understanding was saved.' : 'This topic has been flagged for another explanation.',
      [],
      { understanding: state.understanding, topic, status },
    );
  }
  if (name === 'record_teach_back') {
    const medication = mustText(args.medication, 'medication', 100);
    const patientAnswer = mustText(args.patientAnswer, 'patientAnswer', 1000);
    const approved = chart.medications.find((m) => m.name.toLowerCase() === medication.toLowerCase());
    if (!approved) {
      const q = queue(state, `I need help reviewing the instructions for ${medication}.`);
      state.understanding.meds = 'needs_clarification';
      return makeResult(
        'YELLOW',
        'ask_care_team',
        'There is no approved instruction for that medication in this synthetic chart. Please review it with the nurse.',
        [],
        { queued: true, questionId: q.id, demo: true },
      );
    }
    const result = evaluateTeachBack(approved, patientAnswer);
    state.teachbacks.unshift({ ...result, id: randomUUID(), createdAt: new Date().toISOString(), answer: patientAnswer });
    state.teachbacks = state.teachbacks.slice(0, 50);
    state.understanding.meds = result.status;
    const matched = (result.criteria || []).filter((c) => c.met).map((c) => c.label);
    const missing = (result.criteria || []).filter((c) => !c.met).map((c) => c.label);
    const detail =
      result.status === 'understood'
        ? `Matched all checked parts: ${matched.join('; ') || 'none listed'}. This is not proof of medical understanding — confirm with your nurse.`
        : `Recognized: ${matched.join('; ') || 'none yet'}. Please review: ${missing.join('; ') || 'the full instruction'}. Recorded instruction: ${approved.instruction}`;
    return makeResult('GREEN', 'care_plan', detail, [approved.record], {
      teachback: result,
      understanding: state.understanding,
      matchedCriteria: matched,
      reviewCriteria: missing,
    });
  }
  if (name === 'explain_clinical_term') {
    const term = mustText(args.term, 'term', 100)
      .toLowerCase()
      .replace(/[?!.,]/g, '');
    const definition = GLOSSARY[term];
    if (!definition) {
      const q = queue(state, `What does "${term}" mean in my care plan?`);
      return makeResult(
        'YELLOW',
        'ask_care_team',
        `I don't have an approved definition for that term. I've added a question for the demo care-team queue. ${DEMO_DISCLAIMER}`,
        [],
        { queued: true, questionId: q.id, demo: true },
      );
    }
    return makeResult('GREEN', 'general_education', definition, [`Glossary/${term.replaceAll(' ', '-')}`]);
  }
  if (name === 'simplify_text') {
    const approved = state.lastApprovedText;
    if (!approved || (args.approvedText !== undefined && args.approvedText !== approved))
      return makeResult(
        'GREEN',
        'general_education',
        'Ask a care-plan question first so I have an approved answer to make simpler.',
      );
    const mode = ['short', 'simple', 'steps'].includes(args.mode) ? args.mode : 'simple';
    let text = approved;
    try {
      const proposed = await rewordApproved(approved, { mode, systemPrompt: SIMPLIFY_PROMPTS[mode] });
      if (isSafeRewording(approved, proposed)) text = proposed;
    } catch {
      /* Fail closed */
    }
    return makeResult('GREEN', 'care_plan', text, state.lastSourceRecords || [], {
      reworded: text !== approved,
      explanationMode: mode,
    });
  }
  throw new UserError(`Unknown tool: ${name}`, 404);
}

export const TOOL_DEFS = [
  ['get_today_care_plan', "List today's care-plan events with times and record IDs."],
  ['get_changes_since', "Compute changes between yesterday and today's synthetic chart snapshots."],
  ['get_pending_events', 'List pending events and results without interpreting them.'],
  ['get_approved_patient_explanation', 'Chart-attributed explanation ONLY; unknown rationale gets sent to the care team.'],
  ['get_discharge_requirements', 'Read back only the approved recorded discharge information, never decide discharge readiness.'],
  ['get_rounds_questions', 'Offer safe questions to ask the hospital care team.'],
  ['create_question_for_team', 'MANDATORY for any diagnosis, prognosis, dosing, medicine changes, result interpretation or discharge decisions.'],
  ['get_patient_questions', 'Read the saved question queue.'],
  ['get_understanding_state', 'Read self-reported understanding and criteria-based teach-back state.'],
  ['set_understanding', 'Save patient self-reported understanding or need for clarification.'],
  ['record_teach_back', 'Compare patient explanation against fixed approved instruction criteria; NOT a medical evaluation.'],
  ['explain_clinical_term', 'Use approved general-education glossary definitions only.'],
  ['simplify_text', 'Reword the exact previously approved response; never add medical facts.'],
].map(([name, description]) => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties: {
      patientId: { type: 'string', enum: ['maria', 'jordan', 'ahmed'] },
      ...(name === 'get_approved_patient_explanation'
        ? { topic: { type: 'string', enum: ['test', 'medication', 'other'] }, question: { type: 'string' } }
        : {}),
      ...(name === 'create_question_for_team' ? { question: { type: 'string' } } : {}),
      ...(name === 'set_understanding'
        ? { topic: { type: 'string', enum: TOPICS }, status: { type: 'string', enum: ['understood', 'needs_clarification'] } }
        : {}),
      ...(name === 'record_teach_back' ? { medication: { type: 'string' }, patientAnswer: { type: 'string' } } : {}),
      ...(name === 'explain_clinical_term' ? { term: { type: 'string' } } : {}),
      ...(name === 'simplify_text'
        ? { approvedText: { type: 'string' }, mode: { type: 'string', enum: ['short', 'simple', 'steps'] } }
        : {}),
    },
    required: [
      'patientId',
      ...(['create_question_for_team'].includes(name) ? ['question'] : []),
      ...(name === 'set_understanding' ? ['topic', 'status'] : []),
      ...(name === 'record_teach_back' ? ['medication', 'patientAnswer'] : []),
      ...(name === 'explain_clinical_term' ? ['term'] : []),
    ],
    additionalProperties: false,
  },
}));

export async function runTool(name, args = {}, sessionId = 'default') {
  if (!TOOL_DEFS.some((t) => t.name === name) && !['get_afternoon_plan', 'get_source_focus'].includes(name))
    throw new UserError(`Unknown tool: ${name}`, 404);
  if (typeof args !== 'object' || !args || Array.isArray(args)) throw new UserError('Tool arguments must be an object');
  const id = mustText(args.patientId, 'patientId', 30);
  const patient = checkPatient(id);
  const sid = sessionOrDefault(sessionId);
  const candidate =
    typeof args.question === 'string' ? args.question : typeof args.patientAnswer === 'string' ? args.patientAnswer : null;
  if (name !== 'create_question_for_team' && candidate && classify(candidate) === 'RED') {
    return runTool('create_question_for_team', { patientId: id, question: candidate }, sid);
  }
  return modifyState(sid, id, async (state) => {
    const result = await execute(name, patient, state, args);
    if (['GREEN', 'YELLOW'].includes(result.policy) && result.source === 'care_plan' && name !== 'simplify_text' && result.text) {
      state.lastApprovedText = result.text;
      if (result.sourceRecords?.length) state.lastSourceRecords = result.sourceRecords;
    }
    state.audit.unshift({
      id: randomUUID(),
      at: new Date().toISOString(),
      patientId: id,
      tool: name,
      policy: result.policy,
      source: result.source,
      record: result.record || null,
      summary: result.text.slice(0, 180),
      queued: !!result.queued,
    });
    state.audit = state.audit.slice(0, 200);
    return result;
  });
}

export function routeQuestion(question, state = {}) {
  const q = question.toLowerCase();
  if (classify(question) === 'RED') return ['create_question_for_team', { question }];
  if (classify(question) === 'YELLOW')
    return [
      'get_approved_patient_explanation',
      {
        topic: /medic|pain med|antibiotic|inhaler|acetaminophen|amoxicillin|iv\b/i.test(q)
          ? 'medication'
          : /test|ultrasound|x[ -]?ray|bloodwork|scan|imag/i.test(q)
            ? 'test'
            : 'other',
        question,
      },
    ];
  if (/simpl(er|ify)|easier words|plain language|explain again|less complicated|previous answer more simply|explain (the )?previous/.test(q))
    return ['simplify_text', { mode: /step/.test(q) ? 'steps' : /short|brief/.test(q) ? 'short' : 'simple' }];
  if (/which record|what record|source (record|reference)|where (did|does) that (come|info)/.test(q) || (/what does that mean/.test(q) && state.lastApprovedText))
    return ['get_source_focus', {}];
  if (/after lunch|this afternoon|later today|after noon|afternoon/.test(q)) return ['get_afternoon_plan', {}];
  if (/change|different|yesterday|since then/.test(q)) return ['get_changes_since', {}];
  if (/wait|pending|results? pending/.test(q)) return ['get_pending_events', {}];
  if (/discharge|go home|home instructions|before i leave|follow.up|warning signs|medication list|my medicines|my medication instructions/.test(q))
    return ['get_discharge_requirements', {}];
  if (/rounds|ask.*(doctor|nurse|team)|questions.*(doctor|nurse|team)|what should i ask/.test(q))
    return ['get_rounds_questions', {}];
  if (/what (?:is|does|are) (?:an? |the )?(?:ultrasound|bloodwork|blood test|chest x.ray|x.ray|iv|physiotherapy|inhaler|acetaminophen|amoxicillin)/.test(q)) {
    const match = q.match(/(?:ultrasound|bloodwork|blood test|chest x.ray|x.ray|iv|physiotherapy|inhaler|acetaminophen|amoxicillin)/)?.[0] || '';
    return ['explain_clinical_term', { term: match.replace('x-ray', 'xray').replace('x ray', 'xray') }];
  }
  if (/today|schedule|happening|plan|next|timeline|appointment|when/.test(q)) return ['get_today_care_plan', {}];
  return [null, {}];
}

export async function ask(patientId, question, sessionId = 'default', options = {}) {
  checkPatient(patientId);
  question = mustText(question, 'question', 1000);
  const sid = sessionOrDefault(sessionId);
  const state = await store.get(stateKey(sid, patientId));
  let [name, extra] = routeQuestion(question, state);
  if (options.mode && name === 'simplify_text') extra = { ...extra, mode: options.mode };

  if (!name) {
    return {
      policy: 'GREEN',
      source: 'general_education',
      record: null,
      sourceRecords: [],
      text: 'That detail is not available in this synthetic chart. I can show today’s plan, afternoon events, changes, pending items, discharge information, care-team questions, or define an approved medical term. For personal clinical decisions, I will send the question to the demo care-team queue.',
      tool: 'help',
      suggestions: suggestionsFor('help', 'GREEN'),
      notInChart: true,
    };
  }

  const result = await runTool(name, { patientId, ...extra }, sid);
  await modifyState(sid, patientId, async (s) => {
    recordTurn(s, question, result, name);
  });
  const toolKey = name === 'get_afternoon_plan' ? 'afternoon_focus' : name === 'get_source_focus' ? 'source_focus' : name;
  return {
    ...result,
    tool: name,
    suggestions: suggestionsFor(toolKey, result.policy),
    demoDisclaimer: result.queued ? DEMO_DISCLAIMER : undefined,
  };
}

export async function getPatientView(patientId, sessionId = 'default') {
  const base = checkPatient(patientId);
  const sid = sessionOrDefault(sessionId);
  const state = await store.get(stateKey(sid, patientId));
  const chart = activePatient(base, state);
  const { yesterday, snapshot, rationales, medications, timelineSteps, ...exposed } = chart;
  const questions = (state.questions || []).map((q) => ({
    ...q,
    patientLabel: q.status === 'reviewed' ? 'Reviewed (demo)' : 'Awaiting review',
    disclaimer: DEMO_DISCLAIMER,
  }));
  return {
    ...exposed,
    changes: diffSnapshots(chart.yesterday, chart.snapshot),
    medications: medications.map(({ name, instruction, record }) => ({ name, instruction, record })),
    rationales,
    timelineStep: chart.timelineStep,
    timelineStepCount: chart.timelineStepCount,
    timelineLabel: chart.timelineLabel,
    questions,
    understanding: state.understanding,
    demoDisclaimer: DEMO_DISCLAIMER,
  };
}

export async function advanceTimeline(patientId, sessionId = 'default') {
  const base = checkPatient(patientId);
  const sid = sessionOrDefault(sessionId);
  const steps = getTimelineSteps(base);
  await modifyState(sid, patientId, async (state) => {
    const next = Math.min((state.timelineStep || 0) + 1, steps.length - 1);
    const changed = next !== (state.timelineStep || 0);
    state.timelineStep = next;
    state.audit.unshift({
      id: randomUUID(),
      at: new Date().toISOString(),
      patientId,
      tool: 'demo_advance',
      policy: 'GREEN',
      source: 'care_plan',
      record: null,
      summary: changed
        ? `Demo timeline advanced to step ${next + 1}/${steps.length}: ${steps[next].label}`
        : `Demo timeline already at final step ${steps.length}`,
      queued: false,
    });
  });
  return getPatientView(patientId, sid);
}

export async function resetDemoPatient(patientId, sessionId = 'default') {
  checkPatient(patientId);
  const sid = sessionOrDefault(sessionId);
  const key = stateKey(sid, patientId);
  await store.put(key, blankState(patientId));
  return getPatientView(patientId, sid);
}

export async function dashboard(patientId = null, sessionId = 'default') {
  if (patientId !== null) checkPatient(patientId);
  const sid = sessionOrDefault(sessionId);
  const ids = patientId ? [patientId] : Object.keys(PATIENTS);
  const details = await Promise.all(
    ids.map(async (id) => ({
      patient: patientList().find((p) => p.id === id),
      state: await store.get(stateKey(sid, id)),
    })),
  );
  return {
    summary: {
      patients: details.length,
      pendingQuestions: details.reduce((n, x) => n + x.state.questions.filter((q) => q.status === 'pending').length, 0),
      needsClarification: details.reduce(
        (n, x) => n + Object.values(x.state.understanding).filter((s) => s === 'needs_clarification').length,
        0,
      ),
      teachbacks: details.reduce((n, x) => n + x.state.teachbacks.length, 0),
    },
    patients: details.map(({ patient, state }) => ({
      ...patient,
      understanding: state.understanding,
      pending: state.questions.filter((q) => q.status === 'pending').length,
      teachbacks: state.teachbacks.slice(0, 10),
    })),
    questions: details
      .flatMap(({ patient, state }) =>
        state.questions.map((q) => ({
          ...q,
          patientId: patient.id,
          patientName: patient.name,
          room: patient.room,
          disclaimer: DEMO_DISCLAIMER,
        })),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    audit: details
      .flatMap(({ state }) => state.audit)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 200),
    demoDisclaimer: DEMO_DISCLAIMER,
  };
}

async function locateQuestion(questionId, preferredSession) {
  const sid = sessionOrDefault(preferredSession);
  for (const patientId of Object.keys(PATIENTS)) {
    const key = stateKey(sid, patientId);
    const state = await store.get(key);
    if (state.questions.some((q) => q.id === questionId)) return { sessionId: sid, patientId };
  }
  // Same Node process only (local npm start / warm instance): scan every session key.
  if (typeof store.keys === 'function') {
    for (const key of store.keys()) {
      const state = await store.get(key);
      if (!state.questions?.some((q) => q.id === questionId)) continue;
      const colon = key.lastIndexOf(':');
      const sessionId = colon > 0 ? key.slice(0, colon) : 'default';
      const patientId = colon > 0 ? key.slice(colon + 1) : key;
      if (Object.hasOwn(PATIENTS, patientId)) return { sessionId, patientId };
    }
  }
  return null;
}

export async function reviewQuestion(id, sessionId = 'default') {
  const questionId = mustText(id, 'question ID', 100);
  const located = await locateQuestion(questionId, sessionId);
  if (!located) throw new UserError('Question not found', 404);
  const { sessionId: sid, patientId } = located;
  return modifyState(sid, patientId, async (s) => {
    const item = s.questions.find((q) => q.id === questionId);
    if (!item) throw new UserError('Question not found', 404);
    item.status = 'reviewed';
    item.reviewedAt = new Date().toISOString();
    item.patientLabel = 'Reviewed (demo)';
    item.disclaimer = DEMO_DISCLAIMER;
    s.audit.unshift({
      id: randomUUID(),
      at: new Date().toISOString(),
      patientId,
      tool: 'review_question',
      policy: 'GREEN',
      source: 'ask_care_team',
      record: null,
      summary: `Demo care-team marked reviewed: ${item.question.slice(0, 100)}`,
      queued: false,
    });
    return { ...item, demoDisclaimer: DEMO_DISCLAIMER, patientId };
  });
}
