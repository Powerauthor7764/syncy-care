const DEMO_AUTH = { email: 'demo@syncycare.test', password: 'Bedside#2026' };
const AUTH_KEY = 'syncy-care-auth';
const TOUR_KEY = 'syncy-tour-done';
const TEAM_TOUR_KEY = 'syncy-team-tour-done';

const PATIENT_TOUR = [
  { target: 'glance', title: 'Today at a glance', body: 'See what is done, what is next, and what you may want to ask — all from approved synthetic chart snapshots.' },
  { target: 'ask-syncy', title: 'Ask Syncy', body: 'Ask plain-language questions about today’s plan. Answers cite synthetic records; Syncy does not make medical decisions.' },
  { target: 'explain-modes', title: 'Explanation modes', body: 'Choose Short, Simple, or Step-by-step rewording when Bedrock is configured — always from approved text first.' },
  { target: 'timeline', title: 'Care timeline', body: 'Tap an event for time, status, source record, and notes. Status is labeled in words, not color alone.' },
  { target: 'demo-advance', title: 'Simulate chart update', body: 'Advance Maria’s demo day to show how answers and “since yesterday” update from new snapshots.' },
  { target: 'questions', title: 'My questions', body: 'Questions that need a clinician stay in a demo queue — no real nurse is notified.' },
  { target: 'teachback', title: 'Teach-back practice', body: 'Practice explaining a recorded instruction in your own words. This is not clinical certification.' },
];

const TEAM_TOUR = [
  { target: 'team-metrics', title: 'Team overview', body: 'Synthetic metrics show where patients may need another conversation — not clinical risk scores.' },
  { target: 'team-queue', title: 'Question queue', body: 'Patient questions from the demo appear here. Mark reviewed updates demo status only.' },
  { target: 'team-simulation', title: 'Simulation banner', body: 'Everything on this screen is invented data for demonstration. No real care delivery occurs.' },
];

const GUIDED_TIPS = [
  'Maria Thompson · Room 302 — read the bedside header and today-at-a-glance cards.',
  'Tap “Today’s plan” or ask: What’s happening today?',
  'Try a Short or Step-by-step explanation on your next answer.',
  'Use Simulate next update, then ask what changed since yesterday.',
  'Open My questions after asking something only the care team can decide.',
  'Finish with teach-back on acetaminophen instructions.',
];

const state = {
  view: 'patient',
  patientId: 'maria',
  patients: [],
  patient: null,
  dashboard: null,
  tools: [],
  config: null,
  health: null,
  chat: {},
  busy: false,
  teachback: null,
  safetyResult: null,
  speak: false,
  family: false,
  large: false,
  contrast: false,
  sidebar: false,
  booted: false,
  timelineOpen: null,
  tour: { active: false, step: 0, kind: 'patient' },
  guidedDemo: false,
  guidedTip: 0,
  mcpLog: null,
  mcpBusy: false,
  pendingExplainMode: null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const isAuthed = () => {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
};
const setAuthed = (on) => {
  try {
    on ? sessionStorage.setItem(AUTH_KEY, '1') : sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
};

const tourDone = (kind) => {
  try {
    return localStorage.getItem(kind === 'team' ? TEAM_TOUR_KEY : TOUR_KEY) === '1';
  } catch {
    return false;
  }
};
const markTourDone = (kind) => {
  try {
    localStorage.setItem(kind === 'team' ? TEAM_TOUR_KEY : TOUR_KEY, '1');
  } catch {
    /* ignore */
  }
};

function showGate(screen) {
  const landing = $('#landing');
  const login = $('#login');
  const app = $('#app');
  if (landing) landing.hidden = screen !== 'landing';
  if (login) login.hidden = screen !== 'login';
  if (app) app.hidden = screen !== 'app';
  document.body.classList.toggle('auth-open', screen !== 'app');
  if (screen === 'login') {
    const err = $('#loginError');
    if (err) err.hidden = true;
    $('#loginEmail')?.focus();
  }
}

function signOut() {
  setAuthed(false);
  state.booted = false;
  state.guidedDemo = false;
  state.tour.active = false;
  showGate('landing');
  toast('Signed out');
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = esc;

const statusText = {
  not_reviewed: 'Not reviewed',
  explained: 'Explained',
  understood: 'Understood',
  needs_clarification: 'Needs clarification',
};
const topicLabels = { plan: 'Daily plan', meds: 'Medicines', tests: 'Tests', dc: 'Discharge', fu: 'Follow-up' };
const topicIcons = { plan: '◷', meds: '✚', tests: '◇', dc: '⌂', fu: '↗' };

const timelineStatusLabel = (status) => {
  if (status === 'done') return 'Completed';
  if (status === 'pending' || status === 'waiting') return 'Pending';
  return 'Upcoming';
};

const time = (s) =>
  s ? new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

let toastHandle;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => el.classList.remove('show'), 3400);
}

async function api(route, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  const r = await fetch(route, { ...options, headers });
  let x;
  try {
    x = await r.json();
  } catch {
    x = { error: `Unexpected server response (${r.status})` };
  }
  if (!r.ok) throw Error(x.error || `Server error ${r.status}`);
  return x;
}

const post = (url, obj) => api(url, { method: 'POST', body: JSON.stringify(obj) });

const getUnderstanding = () =>
  state.patient?.understanding ||
  state.dashboard?.patients.find((x) => x.id === state.patientId)?.understanding ||
  {};

const getChat = () =>
  state.chat[state.patientId] ||
  (state.chat[state.patientId] = [
    {
      role: 'bot',
      text: 'Hi! I’m Syncy. I can explain the approved care plan, what changed, and what to ask your nurse. I won’t make medical decisions.',
      result: null,
    },
  ]);

const metaPatient = (id) => state.patients.find((x) => x.id === id) || state.patient;

const selectPatient = async (id) => {
  if (!state.patients.some((x) => x.id === id)) return;
  state.patientId = id;
  $('#patientSelector').value = id;
  state.teachback = null;
  state.safetyResult = null;
  state.timelineOpen = null;
  await refresh(true);
};

async function refresh(patientChanged = false) {
  try {
    const [patient, dashboard] = await Promise.all([
      api(`/api/patients/${state.patientId}`),
      api('/api/dashboard'),
    ]);
    state.patient = patient;
    state.dashboard = dashboard;
    render();
    if (patientChanged) toast(`${patient.name} · synthetic record selected`);
  } catch (e) {
    showError(e);
  }
}

function showError(e) {
  const indicator = $('#serverStatus');
  if (indicator) indicator.textContent = 'CONNECTION LOST';
  toast(e.message || 'Could not connect to the server');
  if (!state.patient) {
    $('#mainContent').innerHTML = `<div class="empty">Could not load Syncy Care. ${esc(e.message)}. Make sure the Node server is running.</div>`;
  }
}

function setView(view) {
  state.view = view;
  state.sidebar = false;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'team' && !tourDone('team') && !state.tour.active) {
    state.tour = { active: true, step: 0, kind: 'team' };
    queueTourPaint();
  }
}

function sidePanel() {
  return state.patients
    .map(
      (p) =>
        `<button class="sidebar-patient ${p.id === state.patientId ? 'selected' : ''}" data-patient="${p.id}"><span class="patient-initials ${esc(p.color)}">${esc(p.initials)}</span><span><strong>${esc(p.name)}</strong><small>Room ${esc(p.room)} · Synthetic</small></span></button>`,
    )
    .join('');
}

function cards(meds) {
  return (meds || [])
    .map(
      (m) =>
        `<div class="med-line"><strong>${h(m.name)}</strong><span>${h(m.instruction)}</span><code>${h(m.record)}</code></div>`,
    )
    .join('');
}

function messageMarkup(m) {
  const r = m.result;
  const suggestions = r?.suggestions || m.suggestions || [];
  const sources = (r?.sourceRecords || []).filter(Boolean);
  return `<div class="message ${m.role === 'user' ? 'user' : 'bot answer'}">${h(m.text)}${
    r
      ? `<div class="message-meta"><span class="policy ${r.policy}">${r.policy}</span><span>${h(r.source.replaceAll('_', ' '))}</span>${r.record ? `<span class="source-chip">${h(r.record)}</span>` : ''}${r.queued ? '<span class="source-chip">◉ Demo queue · awaiting review</span>' : ''}${r.reworded ? `<span class="source-chip">Reworded by Bedrock${r.explanationMode ? ' · ' + h(r.explanationMode) : ''}</span>` : ''}</div>${sources.length ? `<div class="message-meta">${sources.slice(0, 6).map((s) => `<span class="source-chip">${h(s)}</span>`).join('')}</div>` : ''}${suggestions.length ? `<div class="question-actions" style="margin-top:8px">${suggestions.map((s) => `<button type="button" class="quick-chip" data-question="${h(s)}">${h(s)}</button>`).join('')}</div>` : ''}`
      : ''
  }</div>`;
}

function explainModeChips() {
  return `<div class="explain-modes" data-tour="explain-modes" aria-label="Explanation modes">
    <span class="explain-label">Plain language:</span>
    <button type="button" class="quick-chip mode-chip" data-mode="short">Short</button>
    <button type="button" class="quick-chip mode-chip" data-mode="simple">Simple</button>
    <button type="button" class="quick-chip mode-chip" data-mode="steps">Step by step</button>
  </div>`;
}

function chatBox() {
  return `<section class="card chat-card chat-prominent" id="chat-card" data-tour="ask-syncy"><div class="section-header"><div class="panel-topline"><div class="icon-box">✦</div><div><h2>Ask Syncy</h2><div class="panel-note">Context-aware answers from approved synthetic records</div></div></div><label class="switch-row"><input type="checkbox" id="voiceReplies" ${state.speak ? 'checked' : ''}> Spoken replies</label></div><div class="message-list" id="chatMessages" aria-live="polite">${getChat().map(messageMarkup).join('')}</div><form id="askForm"><div class="composer"><label class="sr-only" for="questionText">Your care-plan question</label><textarea id="questionText" rows="1" maxlength="1000" placeholder="Ask about today’s plan, after lunch, or what changed…" ${state.busy ? 'disabled' : ''}></textarea><button class="mic-btn" id="micButton" type="button" title="Speak a question" aria-label="Speak a question">♩</button><button class="btn primary btn-ask" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Working…' : 'Ask Syncy ↗'}</button></div></form>${explainModeChips()}<div class="question-actions"><button class="quick-chip" data-question="What's happening today?">Today</button><button class="quick-chip" data-question="What about after lunch?">After lunch</button><button class="quick-chip" data-question="What changed since yesterday?">What changed?</button><button class="quick-chip" data-question="What am I waiting for?">Pending</button><button class="quick-chip" data-question="Explain that in simpler words">Simpler words</button></div></section>`;
}

function timelineRow(x, p) {
  const record = `${x.type}/${x.id}`;
  const open = state.timelineOpen === x.id;
  const statusLbl = timelineStatusLabel(x.status === 'done' ? 'done' : 'todo');
  return `<button type="button" class="timeline-event ${open ? 'open' : ''}" data-timeline-id="${h(x.id)}" aria-expanded="${open}">
    <div class="timeline-event-head">
      <span class="timeline-time">${h(x.time)}</span>
      <span class="timeline-status-text">${statusLbl}</span>
      <strong>${h(x.title)}</strong>
    </div>
    <div class="timeline-event-detail" ${open ? '' : 'hidden'}>
      <p><span class="detail-k">Time</span> ${h(x.time)}</p>
      <p><span class="detail-k">Status</span> ${statusLbl}</p>
      <p><span class="detail-k">Source record</span> <code>${h(record)}</code></p>
      <p><span class="detail-k">Note</span> ${h(x.note)}</p>
    </div>
  </button>`;
}

function timelineBox(p) {
  const step = (p.timelineStep ?? 0) + 1;
  const total = p.timelineStepCount || 1;
  const atEnd = step >= total;
  return `<section class="card panel-pad timeline-card" data-tour="timeline"><div class="section-header"><h2>Today's care timeline</h2><small>Snapshot ${step} of ${total}</small></div><p class="section-desc"><span class="table-pill">${h(p.timelineLabel || 'Initial synthetic chart')}</span> · Authored demo snapshots only — not AI-generated events.</p><div class="field-inline timeline-actions" data-tour="demo-advance"><button type="button" class="btn primary" data-action="demo-advance" ${atEnd || state.busy ? 'disabled' : ''}>Simulate next update ↗</button><button type="button" class="btn" data-action="demo-reset" ${state.busy ? 'disabled' : ''}>Reset demo</button></div><div class="timeline-list">${p.today.map((x) => timelineRow(x, p)).join('')}</div></section>`;
}

function questionsBox(p) {
  const qs = p.questions || [];
  return `<section class="card panel-pad" data-tour="questions"><div class="section-header"><h2>My questions (demo)</h2><small>${qs.filter((q) => q.status === 'pending').length} awaiting review</small></div><p class="section-desc">Simulation only — no real nurse or doctor is notified.</p>${qs.length ? qs.slice(0, 12).map((q) => `<div class="queued-card"><div><strong>${h(q.patientLabel || (q.status === 'reviewed' ? 'Reviewed (demo)' : 'Awaiting review'))}</strong><p>${h(q.question)}</p><small>${time(q.createdAt)}${q.reviewedAt ? ' · reviewed ' + time(q.reviewedAt) : ''}</small></div><span class="table-pill ${q.status === 'pending' ? 'flag' : ''}">${h(q.status)}</span></div>`).join('') : '<div class="empty">No demo questions yet. Ask something that needs a clinical decision (for example, medication changes).</div>'}</section>`;
}

function changesBox(p) {
  return `<section class="card panel-pad"><div class="section-header"><h2>Since yesterday</h2><span class="mini-count">${p.changes.length} changes</span></div><p class="section-desc">Computed from yesterday's and today's synthetic chart snapshots, not generated from memory.</p>${p.changes.map((c) => `<div class="change-row"><div class="change-icon">${c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : '↻'}</div><div><h4>${h(c.title)}</h4><p>${h(c.description)}</p><code>${h(c.record)}</code></div></div>`).join('')}</section>`;
}

function pendingBox(p) {
  return `<section class="card panel-pad"><div class="section-header"><h2>What we're waiting for</h2><small>${p.pending.length} items</small></div>${p.pending.map((x) => `<div class="pending-line"><span class="pending-circle">◷</span><div><h4>${h(x.label)}</h4><small>${h(x.record)}</small></div></div>`).join('')}</section>`;
}

function understandingBox() {
  const u = getUnderstanding();
  return `<section class="card panel-pad"><div class="section-header"><h2>My understanding</h2><small>Self-reported, not a clinical score</small></div><p class="section-desc">Track the topics you've reviewed. Select a topic to mark whether you understand or need another explanation.</p><div class="topic-grid">${Object.entries(topicLabels)
    .map(
      ([key, label]) =>
        `<div class="topic-card"><span class="topic-glyph">${topicIcons[key]}</span><strong>${label}</strong><small><i class="status-dot ${u[key] || 'not_reviewed'}"></i>${statusText[u[key] || 'not_reviewed']}</small><button type="button" data-understand="${key}" data-status="${u[key] === 'understood' ? 'needs_clarification' : 'understood'}">${u[key] === 'understood' ? 'Explain again' : 'I understand'}</button></div>`,
    )
    .join('')}</div></section>`;
}

function teachbackHeadline(tb) {
  if (!tb) return '';
  const met = (tb.criteria || []).filter((c) => c.met).length;
  const total = (tb.criteria || []).length;
  if (tb.status === 'understood' || met === total) return 'Information recognized';
  if (met > 0) return 'Review this instruction';
  return 'Practice again';
}

function teachbackBox(p) {
  const u = getUnderstanding();
  const topicProgress = Object.entries(topicLabels)
    .map(([key, label]) => `<span class="source-chip">${h(label)}: ${h(statusText[u[key] || 'not_reviewed'])}</span>`)
    .join(' ');
  const headline = state.teachback ? teachbackHeadline(state.teachback) : '';
  return `<section class="card panel-pad" data-tour="teachback"><div class="section-header"><h2>Teach-back practice</h2><span class="status-pill">Practice only</span></div><p class="section-desc">Explain a <strong>recorded instruction</strong> in your own words. Keyword matching is <b>not</b> proof of medical understanding — confirm with your nurse.</p><div class="message-meta" style="margin-bottom:10px">${topicProgress}</div><form id="teachbackForm"><div class="form-field"><label for="medSelect">Recorded medication</label><select id="medSelect">${p.medications.map((m) => `<option value="${h(m.name)}" ${state.teachback?.medication === m.name ? 'selected' : ''}>${h(m.name)}</option>`).join('')}</select></div><div class="form-field"><label for="teachbackAnswer">How would you explain the written instruction?</label><textarea id="teachbackAnswer" placeholder="For example: I would take…" maxlength="1000" required></textarea></div><button class="btn primary" type="submit">Check my understanding ↗</button></form>${
    state.teachback
      ? `<div class="note-panel margin-top teachback-result"><b>${h(headline)}</b><p class="small-description">Recognized: ${(state.teachback.criteria || []).filter((c) => c.met).map((c) => h(c.label)).join('; ') || 'none yet'}</p><p class="small-description">Review: ${(state.teachback.criteria || []).filter((c) => !c.met).map((c) => h(c.label)).join('; ') || 'none'}</p><ul class="check-criteria">${(state.teachback.criteria || []).map((c) => `<li class="${c.met ? 'pass' : 'fail'}">${c.met ? '✓' : '○'} ${h(c.label)}</li>`).join('')}</ul><div class="small-description">Recorded instruction: ${h(state.teachback.approvedInstruction)}</div></div>`
      : ''
  }</section>`;
}

function dischargeBox(p) {
  const d = p.discharge;
  return `<section class="card panel-pad"><div class="section-header"><h2>Going home: recorded information</h2><span class="table-pill flag">${h(d.label)}</span></div><p class="section-desc">A read-back of this synthetic chart, <b>not</b> a discharge decision. Review every item with the hospital team.</p><div class="small-label">MEDICATION RECORDS</div>${cards(p.medications)}<div class="small-label">RECORDED INSTRUCTIONS</div><div class="detail-list">${d.instructions.map((x, i) => `<div class="detail-item"><span class="number">${i + 1}</span><div><p>${h(x)}</p></div></div>`).join('')}</div><div class="small-label">FOLLOW-UP</div>${d.followUps.map((x) => `<div class="content-block">• ${h(x)}</div>`).join('')}<div class="small-label">HOSPITAL-DEFINED WARNING SIGNS</div>${d.warningSigns.map((x) => `<div class="content-block">• ${h(x)}</div>`).join('')}<div class="note-panel warn margin-top">${h(d.contact)}<div style="margin-top:6px"><code>${h(d.record)}</code></div></div></section>`;
}

function glanceSection(p) {
  const u = getUnderstanding();
  const done = p.today.filter((x) => x.status === 'done').length;
  const next = p.today.find((x) => x.status !== 'done');
  const pendingN = p.pending.length;
  const changesN = p.changes.length;
  const questionsN = (p.questions || []).filter((q) => q.status === 'pending').length;
  const understoodN = Object.values(u).filter((s) => s === 'understood').length;
  return `<section class="card glance-card panel-pad" data-tour="glance"><div class="section-header"><h2>Today at a glance</h2><small>Bedside summary · synthetic chart</small></div><div class="glance-grid"><div class="glance-tile"><span class="glance-k">Done</span><strong>${done}</strong><small>timeline items</small></div><div class="glance-tile accent"><span class="glance-k">Next</span><strong>${next ? h(next.time) : '—'}</strong><small>${next ? h(next.title) : 'Nothing scheduled'}</small></div><div class="glance-tile"><span class="glance-k">Pending</span><strong>${pendingN}</strong><small>waiting on results or team</small></div><div class="glance-tile"><span class="glance-k">Changes</span><strong>${changesN}</strong><small>since yesterday</small></div><div class="glance-tile"><span class="glance-k">Questions</span><strong>${questionsN}</strong><small>awaiting demo review</small></div><div class="glance-tile"><span class="glance-k">Understanding</span><strong>${understoodN}<span class="glance-denom">/5</span></strong><small>topics self-reported</small></div></div></section>`;
}

function bedsideHeader(p) {
  const meta = metaPatient(p.id) || p;
  const team = (meta.careTeam || p.careTeam || [])
    .map((m) => `<li><span class="team-role">${h(m.role)}</span> ${h(m.name)}</li>`)
    .join('');
  return `<header class="bedside-header card" data-tour="patient-header"><div class="bedside-main"><div class="bedside-name-row"><h1 class="bedside-name">${h(p.name)}</h1><span class="demo-badge">Synthetic Demo</span></div><div class="bedside-meta"><span><b>MRN</b> ${h(meta.mrn || p.mrn || '—')}</span><span><b>Room / Bed</b> ${h(p.room)} · ${h(meta.bed || p.bed || '—')}</span><span><b>Unit</b> ${h(meta.unit || p.unit || '—')}</span><span><b>Service</b> ${h(meta.service || p.service || '—')}</span></div><p class="bedside-journey">${h(meta.journeyStage || p.journeyStage || '')}</p></div><div class="bedside-team"><div class="small-label">CARE TEAM (FICTIONAL)</div><ul class="care-team-list">${team || '<li>Not listed in demo chart</li>'}</ul></div></header>`;
}

function guidedBanner() {
  if (!state.guidedDemo) return '';
  const tip = GUIDED_TIPS[state.guidedTip] || GUIDED_TIPS[GUIDED_TIPS.length - 1];
  return `<div class="guided-banner" role="region" aria-label="Hospital Day guide"><div><strong>Hospital Day guide</strong><p>${h(tip)}</p></div><div class="guided-actions"><button type="button" class="btn small soft" data-action="guided-prev" ${state.guidedTip <= 0 ? 'disabled' : ''}>Back</button><button type="button" class="btn small primary" data-action="guided-next">${state.guidedTip >= GUIDED_TIPS.length - 1 ? 'Finish guide' : 'Next tip ↗'}</button><button type="button" class="btn small" data-action="guided-dismiss" aria-label="Dismiss guide">✕</button></div></div>`;
}

function patientView() {
  const p = state.patient;
  return `${guidedBanner()}${bedsideHeader(p)}${glanceSection(p)}
<div class="grid two bedside-primary">${chatBox()}${timelineBox(p)}</div>
<div class="grid equal margin-top">${changesBox(p)}${pendingBox(p)}${questionsBox(p)}</div>
<div class="grid two margin-top">${understandingBox()}${teachbackBox(p)}</div>
<div class="grid equal margin-top">${dischargeBox(p)}<section class="card panel-pad"><div class="section-header"><h2>Questions to bring to rounds</h2><button class="text-button" data-question="What should I ask my doctor?">Ask Syncy ↗</button></div><p class="section-desc">Your care team makes the decisions. These prompts can help you make the most of a conversation.</p><div class="detail-list">${p.specificQuestions.map((q, i) => `<div class="detail-item"><span class="number">${i + 1}</span><div><strong>${h(q)}</strong><p>A question for your clinical team</p></div></div>`).join('')}</div><div class="note-panel margin-top">Family view (demonstration only): <label class="switch-row" style="margin-top:8px"><input id="familyMode" type="checkbox" ${state.family ? 'checked' : ''}> ${state.family ? 'Showing information as a family member' : 'Enable family-oriented explanations'}</label><div class="small-description">This is a visual demo switch, <b>not</b> an authorization or consent mechanism.</div></div></section></div>`;
}

function metric(label, value, note, symbol) {
  return `<section class="card metric"><div class="metric-emblem">${symbol}</div><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></section>`;
}

function teamView() {
  const d = state.dashboard;
  if (!d) return '';
  const careTeamSnippet = state.patients
    .map((p) => {
      const roles = (p.careTeam || []).map((m) => `${m.role}: ${m.name}`).join(' · ');
      return `<div class="team-roster-line"><strong>${h(p.name)}</strong> <span>Room ${h(p.room)}</span><p>${h(roles)}</p></div>`;
    })
    .join('');
  return `<div class="simulation-banner strong" data-tour="team-simulation"><strong>Simulation only</strong> — fictional patients, fictional roles, demo queue actions. No clinician is notified and no care is delivered.</div>
<div class="grid four" data-tour="team-metrics">${metric('Synthetic patients', d.summary.patients, 'On the demo care list', '☻')}${metric('Pending questions', d.summary.pendingQuestions, 'Patient-requested review', '♧')}${metric('Topics needing clarity', d.summary.needsClarification, 'Across all patient topics', '!')}${metric('Teach-back attempts', d.summary.teachbacks, 'Criteria-based checks', '✓')}</div>
<section class="card panel-pad margin-top"><div class="section-header"><h2>Fictional care teams</h2><small>Labels from synthetic chart metadata</small></div>${careTeamSnippet}</section>
<section class="card panel-pad margin-top"><div class="section-header"><h2>Patient understanding</h2><small>Flags are not clinical risk scores</small></div><div class="table-wrap"><table class="data-table"><thead><tr><th>PATIENT</th><th>ROOM</th><th>DAILY PLAN</th><th>MEDS</th><th>TESTS</th><th>DISCHARGE</th><th>FOLLOW-UP</th><th>QUESTIONS</th></tr></thead><tbody>${d.patients.map((p) => `<tr><td><div class="table-patient"><span class="patient-initials ${h(p.color)}">${h(p.initials)}</span><strong>${h(p.name)}</strong></div></td><td>${h(p.room)}</td>${['plan', 'meds', 'tests', 'dc', 'fu'].map((k) => `<td><span class="table-pill ${p.understanding[k] === 'needs_clarification' ? 'flag' : ''}">${h(statusText[p.understanding[k]])}</span></td>`).join('')}<td><b>${p.pending}</b></td></tr>`).join('')}</tbody></table></div></section>
<div class="grid two margin-top"><section class="card panel-pad" data-tour="team-queue"><div class="section-header"><h2>Question queue (simulation)</h2><small>${d.questions.filter((x) => x.status === 'pending').length} pending</small></div><p class="section-desc"><strong>Simulation — no real nurse or doctor is notified.</strong> These are patient requests from the demo, not automated urgency classifications.</p>${d.questions.length ? d.questions.slice(0, 18).map((q) => `<div class="queued-card"><div><strong>${h(q.patientName)} · Room ${h(q.room)}</strong><p>${h(q.question)}</p><small>${time(q.createdAt)} · ${h(q.priority)} · ${q.status}</small></div><div class="actions">${q.status === 'pending' ? `<button class="btn small soft" data-review="${h(q.id)}">Mark reviewed</button>` : '<span class="table-pill">Reviewed (demo)</span>'}</div></div>`).join('') : '<div class="empty">No questions recorded yet. Try a RED question in the patient workspace.</div>'}</section>
<section class="card panel-pad"><div class="section-header"><h2>Recent audit trail</h2><small>${d.audit.length} visible events</small></div><p class="section-desc">Every service tool execution is recorded, including policy, source and record ID.</p>${d.audit.length ? d.audit.slice(0, 18).map((a) => `<div class="audit-entry"><time>${time(a.at)}</time><div><b>${h(a.tool.replaceAll('_', ' '))} · ${h(a.patientId)}</b><p>${h(a.record || a.source)} · ${h(a.summary.slice(0, 75))}</p></div><span class="policy ${h(a.policy)}">${h(a.policy)}</span></div>`).join('') : '<div class="empty">No actions yet. Ask a question or submit a teach-back.</div>'}</section></div>`;
}

function safetyView() {
  const options = [
    ['GREEN', "What's happening today?"],
    ['GREEN', 'What is an ultrasound?'],
    ['YELLOW', 'Why was my ultrasound ordered?'],
    ['YELLOW', 'Why did my medication change?'],
    ['RED', 'Should I stop taking my medication?'],
    ['RED', 'Can I go home?'],
    ['RED', 'What do my test results mean?'],
  ];
  return `<div class="page-heading"><div><div class="eyebrow">SAFETY & GOVERNANCE</div><h1>Safety before generation</h1><p>Approved records and deterministic boundaries come before optional language rewording.</p></div><div class="heading-actions"><span class="status-pill"><i></i> SYNTHETIC DEMO</span></div></div>
<div class="rules-grid"><article class="rule-card GREEN"><div class="rule-letter">G</div><h3>GREEN · Approved facts</h3><p>Display scheduled care, pending events and general definitions from the synthetic chart or glossary. Cite the source every time.</p><span class="policy GREEN">No clinical judgment</span></article><article class="rule-card YELLOW"><div class="rule-letter">Y</div><h3>YELLOW · Chart only</h3><p>Answer “why” questions only when the clinician-authored reason is recorded. If missing, add a question to the team queue.</p><span class="policy YELLOW">Attribution required</span></article><article class="rule-card RED"><div class="rule-letter">R</div><h3>RED · Human decision</h3><p>Do not decide medication changes, doses, diagnoses, prognosis, result meanings or discharge safety. Refuse and queue.</p><span class="policy RED">Escalate to care team</span></article></div>
<section class="card panel-pad margin-top"><div class="section-header"><h2>Live safety sandbox</h2><small>Connected to the same /api/ask service as the patient workspace</small></div><p class="section-desc">Try an example below or write your own prompt. RED tests create real <em>demo</em> queue entries; use the dashboard to see them.</p><div class="example-row">${options.map(([policy, q]) => `<button type="button" data-safety-question="${h(q)}"><span class="policy ${policy}" style="margin-right:5px">${policy}</span>${h(q)}</button>`).join('')}</div><form id="safetyForm" class="form-field margin-top"><label for="safetyText">Test a patient question</label><textarea id="safetyText" placeholder="For example: Should I increase my medication?" required maxlength="1000"></textarea><div><button class="btn primary" type="submit">Run safety check ↗</button></div></form>${state.safetyResult ? `<div class="safe-out ${h(state.safetyResult.policy)} margin-top"><b>${h(state.safetyResult.policy)} · ${h(state.safetyResult.source)}</b>\n${h(state.safetyResult.text)}\n${state.safetyResult.record ? `\nSource: ${h(state.safetyResult.record)}` : ''}${state.safetyResult.queued ? '\nQuestion added to demo queue.' : ''}</div>` : ''}</section>`;
}

function architectureView() {
  const tools = state.tools;
  const mcpBlock = state.mcpLog
    ? `<pre class="mcp-log" aria-live="polite">${h(JSON.stringify(state.mcpLog, null, 2))}</pre>`
    : '<p class="section-desc">Live JSON-RPC responses from POST /mcp will appear here.</p>';
  return `<div class="page-heading"><div><div class="eyebrow">SYSTEM DESIGN</div><h1>Built around trust, not guesses</h1><p>One self-hosted service shares the same approved data and tool logic across the browser and MCP.</p></div><div class="heading-actions"><button type="button" class="btn primary" data-action="mcp-demo" ${state.mcpBusy ? 'disabled' : ''}>${state.mcpBusy ? 'Running MCP demo…' : 'Run MCP demo ↗'}</button><span class="status-pill"><i></i> SYNTHETIC DEMO</span></div></div>
<section class="card panel-pad margin-top mcp-demo-panel"><div class="section-header"><h2>MCP live demo</h2><small>initialize · tools/list · tools/call get_today_care_plan</small></div><p class="section-desc">Real POST /mcp calls for patient <code>maria</code>. Errors are shown as returned — nothing is mocked in the browser.</p>${mcpBlock}</section>
<div class="architecture"><div class="arch-node primary"><strong>Patient + care-team demo</strong><span>Browser, optional mic, optional browser text-to-speech</span></div><div class="arch-arrow">↓</div><div class="arch-row"><div class="arch-node"><strong>POST /mcp</strong><span>Stateless MCP JSON-RPC · 13 tools</span></div><div class="arch-node"><strong>POST /api/ask</strong><span>Natural-language demo routing</span></div></div><div class="arch-arrow">↓</div><div class="arch-node amber"><strong>Deterministic safety classifier</strong><span>RED first → YELLOW → GREEN; no model makes a clinical decision</span></div><div class="arch-arrow">↓</div><div class="arch-node teal"><strong>Shared service layer · 13 policy-bounded tools</strong><span>Provenance and approved source text attached to every relevant response</span></div><div class="arch-arrow">↓</div><div class="arch-bottom"><div class="arch-node"><strong>Change engine</strong><span>Yesterday ↔ today chart diff</span></div><div class="arch-node"><strong>Teach-back engine</strong><span>Fixed, clinician-approved patterns</span></div><div class="arch-node"><strong>Understanding + audit</strong><span>Question queue and event log</span></div></div><div class="arch-arrow">↓</div><div class="arch-row"><div class="arch-node"><strong>FHIR-shaped synthetic records</strong><span>Maria · Jordan · Ahmed</span></div><div class="arch-node"><strong>State store</strong><span>Memory by default · optional DynamoDB</span></div></div><div class="arch-node" style="border-style:dashed"><strong>Amazon Bedrock (optional)</strong><span>Approved-text rewording only; optional Guardrail · fail-closed fallback</span></div></div>
<div class="grid equal arch-summary margin-top"><section class="card panel-pad"><div class="section-header"><h2>Running service</h2></div><div class="detail-list">${[['Health', state.health?.status || 'unknown'], ['State store', state.config?.store || 'unknown'], ['Bedrock configured', state.config?.bedrockConfigured ? 'Yes (not live-verified)' : 'No'], ['Guardrail configured', state.config?.guardrailConfigured ? 'Yes (not live-verified)' : 'No'], ['MCP endpoint', '/mcp · protocol 2025-11-25'], ['Data', '3 synthetic patient scenarios']].map(([k, v]) => `<div class="pending-line"><div style="flex:1"><h4>${h(k)}</h4></div><strong style="font-size:11px">${h(v)}</strong></div>`).join('')}</div></section><section class="card panel-pad"><div class="section-header"><h2>Integration status</h2></div><p class="content-block">✓ Patient simulator wired to live API<br>✓ 13 MCP tool handlers and JSON-RPC transport<br>✓ Computed change snapshots and record citations<br>✓ Teach-back, understanding state and audit<br>✓ Care-team review queue<br>△ Optional AWS adapters included; need real-account tests<br>△ Independent red-team and accessibility testing required<br>△ Hospital SSO and authorization not implemented</p><div class="note-panel warn">Deployment and integration testing remain separate steps. A successful local demo is not evidence of clinical safety.</div></section></div>
<section class="card panel-pad margin-top"><div class="section-header"><h2>Available MCP tools</h2><small>${tools.length} exposed tools</small></div><div class="tool-list">${tools.map((t) => `<div class="tool-cell"><b>${h(t.name)}</b><p>${h(t.description)}</p></div>`).join('')}</div></section>`;
}

function tourSteps() {
  return state.tour.kind === 'team' ? TEAM_TOUR : PATIENT_TOUR;
}

function renderTour() {
  let root = $('#tourRoot');
  if (!state.tour.active) {
    if (root) root.remove();
    document.body.classList.remove('tour-open');
    $$('[data-tour-active]').forEach((el) => el.removeAttribute('data-tour-active'));
    return;
  }
  const steps = tourSteps();
  const step = steps[state.tour.step];
  if (!step) {
    state.tour.active = false;
    markTourDone(state.tour.kind);
    renderTour();
    return;
  }
  if (!root) {
    root = document.createElement('div');
    root.id = 'tourRoot';
    root.className = 'tour-root';
    root.innerHTML = `<div class="tour-overlay" data-action="tour-skip"></div><div class="tour-spotlight" aria-hidden="true"></div><div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle"><div class="tour-progress" id="tourProgress"></div><h3 id="tourTitle"></h3><p id="tourBody"></p><div class="tour-actions"><button type="button" class="btn" data-action="tour-back">Back</button><button type="button" class="btn" data-action="tour-skip">Skip</button><button type="button" class="btn primary" data-action="tour-next"></button></div></div>`;
    document.body.append(root);
  }
  document.body.classList.add('tour-open');
  const target = document.querySelector(`[data-tour="${step.target}"]`);
  $$('[data-tour-active]').forEach((el) => el.removeAttribute('data-tour-active'));
  if (target) {
    target.setAttribute('data-tour-active', 'true');
    target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  $('#tourTitle').textContent = step.title;
  $('#tourBody').textContent = step.body;
  $('#tourProgress').textContent = `Step ${state.tour.step + 1} of ${steps.length}`;
  const nextBtn = root.querySelector('[data-action="tour-next"]');
  nextBtn.textContent = state.tour.step >= steps.length - 1 ? 'Finish' : 'Next';
  root.querySelector('[data-action="tour-back"]').disabled = state.tour.step <= 0;
  queueTourPaint();
}

function queueTourPaint() {
  requestAnimationFrame(() => {
    if (!state.tour.active) return;
    const steps = tourSteps();
    const step = steps[state.tour.step];
    const target = step ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    const spot = $('#tourRoot .tour-spotlight');
    const card = $('#tourRoot .tour-card');
    if (!spot || !card) return;
    if (!target) {
      spot.style.cssText = 'opacity:0';
      card.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%);';
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = 8;
    spot.style.cssText = `top:${rect.top - pad}px;left:${rect.left - pad}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px;opacity:1`;
    const cardRect = card.getBoundingClientRect();
    let top = rect.bottom + 12;
    if (top + cardRect.height > window.innerHeight - 12) top = Math.max(12, rect.top - cardRect.height - 12);
    let left = Math.min(Math.max(12, rect.left), window.innerWidth - cardRect.width - 12);
    card.style.cssText = `top:${top}px;left:${left}px;transform:none;`;
  });
}

function startPatientTour(force = false) {
  if (!force && tourDone('patient')) return;
  state.view = 'patient';
  state.tour = { active: true, step: 0, kind: 'patient' };
  render();
}

function startTeamTour(force = false) {
  if (!force && tourDone('team')) return;
  state.view = 'team';
  state.tour = { active: true, step: 0, kind: 'team' };
  render();
}

function render() {
  if (!state.patient) return;
  $('#serverStatus').innerHTML =
    state.health?.status === 'ok' ? '<i></i> SERVER CONNECTED' : 'CONNECTION UNKNOWN';
  $('#sidebarPatients').innerHTML = sidePanel();
  $('#patientSelector').value = state.patientId;
  $('#breadcrumb').textContent =
    { patient: 'Patient bedside', team: 'Care-team dashboard', safety: 'Safety lab', architecture: 'Architecture' }[
      state.view
    ];
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  $('.sidebar')?.classList.toggle('open', state.sidebar);
  let backdrop = $('#mobileBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'mobileBackdrop';
    backdrop.className = 'mobile-backdrop';
    document.body.append(backdrop);
  }
  backdrop.classList.toggle('on', state.sidebar);
  $('#mainContent').innerHTML =
    ({ patient: patientView, team: teamView, safety: safetyView, architecture: architectureView }[state.view] ||
      patientView)();
  if (state.view === 'patient') {
    const list = $('#chatMessages');
    if (list) list.scrollTop = list.scrollHeight;
  }
  renderTour();
  if (state.tour.active && state.view === 'patient' && state.tour.kind === 'patient') queueTourPaint();
  if (state.tour.active && state.view === 'team' && state.tour.kind === 'team') queueTourPaint();
}

async function askQuestion(question, target = 'patient', extra = {}) {
  if (state.busy) return;
  state.busy = true;
  question = String(question || '').trim();
  if (!question) {
    state.busy = false;
    return;
  }
  if (target === 'patient') {
    getChat().push({ role: 'user', text: question });
    render();
  } else {
    $('#safetyText')?.setAttribute('placeholder', 'Checking…');
  }
  try {
    const mode = extra.mode ?? state.pendingExplainMode ?? undefined;
    const payload = { patientId: state.patientId, question, ...extra };
    if (mode) payload.mode = mode;
    state.pendingExplainMode = null;
    const result = await post('/api/ask', payload);
    if (target === 'patient') {
      getChat().push({ role: 'bot', text: result.text, result });
      if (state.speak && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
        const spoken = new SpeechSynthesisUtterance(
          result.text.replace(/\b(?:MedicationRequest|ServiceRequest|CarePlan|DiagnosticReport|Observation)\/[A-Z0-9-]+/g, ''),
        );
        spoken.rate = 0.93;
        spoken.lang = 'en-US';
        speechSynthesis.speak(spoken);
      }
    } else {
      state.safetyResult = result;
    }
    await refresh();
  } catch (e) {
    if (target === 'patient') getChat().push({ role: 'bot', text: `Connection error: ${e.message}`, result: null });
    showError(e);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

async function runNamedTool(name, args) {
  try {
    const result = await post('/api/tools', { name, arguments: { patientId: state.patientId, ...args } });
    await refresh();
    return result;
  } catch (e) {
    showError(e);
    return null;
  }
}

async function demoAdvance() {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const view = await post('/api/demo/advance', { patientId: state.patientId });
    state.patient = view;
    getChat().push({
      role: 'bot',
      text: `Your synthetic chart was updated (demo).\nSnapshot ${(view.timelineStep || 0) + 1} of ${view.timelineStepCount}: ${view.timelineLabel}\nAsk “What changed since yesterday?” to see the recalculated differences.`,
      result: {
        policy: 'GREEN',
        source: 'care_plan',
        record: null,
        suggestions: ['What changed since yesterday?', 'What am I waiting for?', "What's happening today?"],
      },
    });
    await refresh();
    toast('Demo timeline advanced');
  } catch (e) {
    showError(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function demoReset() {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const view = await post('/api/demo/reset', { patientId: state.patientId });
    state.patient = view;
    state.chat[state.patientId] = [
      {
        role: 'bot',
        text: 'Demo reset. I’m Syncy — ask about today’s synthetic care plan. I won’t make medical decisions.',
        result: null,
      },
    ];
    state.timelineOpen = null;
    await refresh();
    toast('Demo reset for this patient');
  } catch (e) {
    showError(e);
  } finally {
    state.busy = false;
    render();
  }
}

async function mcpRpc(id, method, params) {
  const body = { jsonrpc: '2.0', id, method };
  if (params !== undefined) body.params = params;
  const r = await fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || `MCP HTTP ${r.status}`);
  if (data.error) throw Error(data.error.message || 'MCP error');
  return data;
}

async function runMcpDemo() {
  if (state.mcpBusy) return;
  state.mcpBusy = true;
  state.mcpLog = { status: 'running', steps: [] };
  render();
  try {
    const steps = [];
    const init = await mcpRpc(1, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'syncy-browser', version: '1.0' },
    });
    steps.push({ method: 'initialize', result: init.result });
    await fetch('/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    const list = await mcpRpc(2, 'tools/list');
    steps.push({ method: 'tools/list', toolCount: list.result?.tools?.length });
    const call = await mcpRpc(3, 'tools/call', {
      name: 'get_today_care_plan',
      arguments: { patientId: 'maria' },
    });
    steps.push({ method: 'tools/call', name: 'get_today_care_plan', result: call.result });
    state.mcpLog = { ok: true, patientId: 'maria', steps };
    toast('MCP demo completed');
  } catch (e) {
    state.mcpLog = { ok: false, error: e.message };
    toast(e.message || 'MCP demo failed');
  } finally {
    state.mcpBusy = false;
    render();
  }
}

function exportAudit() {
  if (!state.dashboard) return;
  const data = JSON.stringify(
    { exportedAt: new Date().toISOString(), syntheticOnly: true, events: state.dashboard.audit },
    null,
    2,
  );
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'syncy-care-demo-audit.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Synthetic audit trail exported');
}

function startMic() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast('Mic dictation requires browser speech recognition (for example, Chrome).');
    return;
  }
  const r = new Recognition();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const field = $('#questionText');
    if (field) {
      field.value = e.results[0][0].transcript;
      field.focus();
    }
  };
  r.onerror = (e) => toast(`Microphone: ${e.error}`);
  r.onend = () => $('#micButton')?.classList.remove('recording');
  r.start();
  $('#micButton')?.classList.add('recording');
}

function tourNext() {
  const steps = tourSteps();
  if (state.tour.step >= steps.length - 1) {
    state.tour.active = false;
    markTourDone(state.tour.kind);
    toast('Tour complete');
    render();
    return;
  }
  state.tour.step += 1;
  renderTour();
}

function tourBack() {
  if (state.tour.step > 0) {
    state.tour.step -= 1;
    renderTour();
  }
}

function tourSkip() {
  state.tour.active = false;
  markTourDone(state.tour.kind);
  toast('Tour skipped');
  render();
}

async function exploreHospitalDay() {
  setAuthed(true);
  state.patientId = 'maria';
  state.guidedDemo = true;
  state.guidedTip = 0;
  if (!tourDone('patient')) {
    state.tour = { active: true, step: 0, kind: 'patient' };
  }
  toast('Hospital Day demo · Maria Thompson');
  await bootApp(true);
}

function clickHandler(e) {
  const button = e.target.closest('button');
  const timelineBtn = e.target.closest('[data-timeline-id]');
  if (timelineBtn) {
    const id = timelineBtn.dataset.timelineId;
    state.timelineOpen = state.timelineOpen === id ? null : id;
    render();
    return;
  }
  if (!button) return;
  if (button.dataset.view) {
    setView(button.dataset.view);
    return;
  }
  if (button.dataset.patient) {
    selectPatient(button.dataset.patient);
    return;
  }
  if (button.dataset.mode) {
    state.view = 'patient';
    state.pendingExplainMode = button.dataset.mode;
    render();
    askQuestion('Explain that in simpler words', 'patient', { mode: button.dataset.mode });
    return;
  }
  if (button.dataset.question) {
    state.view = 'patient';
    render();
    askQuestion(button.dataset.question);
    return;
  }
  if (button.dataset.safetyQuestion) {
    const t = $('#safetyText');
    if (t) t.value = button.dataset.safetyQuestion;
    askQuestion(button.dataset.safetyQuestion, 'safety');
    return;
  }
  if (button.dataset.understand) {
    runNamedTool('set_understanding', { topic: button.dataset.understand, status: button.dataset.status }).then((x) => {
      if (x) toast(x.text);
    });
    return;
  }
  if (button.dataset.review) {
    post(`/api/questions/${encodeURIComponent(button.dataset.review)}/review`, {})
      .then(() => refresh())
      .then(() => toast('Demo question marked reviewed — patient status updated'))
      .catch(showError);
    return;
  }
  if (button.dataset.action === 'export-audit') {
    exportAudit();
    return;
  }
  if (button.dataset.action === 'demo-advance') {
    demoAdvance();
    return;
  }
  if (button.dataset.action === 'demo-reset') {
    demoReset();
    return;
  }
  if (button.dataset.action === 'mcp-demo') {
    runMcpDemo();
    return;
  }
  if (button.dataset.action === 'guided-next') {
    if (state.guidedTip >= GUIDED_TIPS.length - 1) {
      state.guidedDemo = false;
      toast('Hospital Day guide finished');
    } else state.guidedTip += 1;
    render();
    return;
  }
  if (button.dataset.action === 'guided-prev') {
    state.guidedTip = Math.max(0, state.guidedTip - 1);
    render();
    return;
  }
  if (button.dataset.action === 'guided-dismiss') {
    state.guidedDemo = false;
    render();
    return;
  }
  if (button.dataset.action === 'replay-tour') {
    startPatientTour(true);
    return;
  }
  if (button.dataset.action === 'replay-team-tour') {
    startTeamTour(true);
    return;
  }
  if (button.dataset.action === 'tour-next') {
    tourNext();
    return;
  }
  if (button.dataset.action === 'tour-back') {
    tourBack();
    return;
  }
  if (button.dataset.action === 'tour-skip') {
    tourSkip();
    return;
  }
  if (button.id === 'micButton') {
    startMic();
    return;
  }
}

function submitHandler(e) {
  if (e.target.id === 'askForm') {
    e.preventDefault();
    const f = $('#questionText');
    const q = f?.value?.trim();
    if (q) askQuestion(q);
  }
  if (e.target.id === 'safetyForm') {
    e.preventDefault();
    const q = $('#safetyText')?.value?.trim();
    if (q) askQuestion(q, 'safety');
  }
  if (e.target.id === 'teachbackForm') {
    e.preventDefault();
    const medication = $('#medSelect').value;
    const patientAnswer = $('#teachbackAnswer').value.trim();
    if (!patientAnswer) return;
    runNamedTool('record_teach_back', { medication, patientAnswer }).then((result) => {
      if (result) {
        state.teachback = { ...result.teachback, medication };
        render();
        toast(result.text);
      }
    });
  }
}

function changeHandler(e) {
  if (e.target.id === 'patientSelector') selectPatient(e.target.value);
  if (e.target.id === 'voiceReplies') state.speak = e.target.checked;
  if (e.target.id === 'familyMode') {
    state.family = e.target.checked;
    render();
    toast('Display mode updated (no real access permissions)');
  }
}

async function bootApp(fromExplore = false) {
  if (state.booted && !fromExplore) {
    showGate('app');
    return;
  }
  showGate('app');
  try {
    const [patients, tools, config, health] = await Promise.all([
      api('/api/patients'),
      api('/api/tools'),
      api('/api/config'),
      api('/health'),
    ]);
    state.patients = patients;
    state.tools = tools;
    state.config = config;
    state.health = health;
    state.booted = true;
    await refresh();
    if (state.tour.active && state.tour.kind === 'patient' && state.view !== 'patient') {
      state.view = 'patient';
      render();
    } else if (!tourDone('patient') && !state.tour.active && state.view === 'patient') {
      state.tour = { active: true, step: 0, kind: 'patient' };
      render();
    }
  } catch (e) {
    showError(e);
  }
}

function wireAuth() {
  $('#goToLogin')?.addEventListener('click', () => showGate('login'));
  $('#landingCta')?.addEventListener('click', () => showGate('login'));
  $('#exploreHospitalDay')?.addEventListener('click', () => exploreHospitalDay());
  $('#backToLanding')?.addEventListener('click', () => showGate('landing'));
  $('#signOutBtn')?.addEventListener('click', signOut);
  $('#replayTourBtn')?.addEventListener('click', () => startPatientTour(true));
  $('#loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = ($('#loginEmail')?.value || '').trim().toLowerCase();
    const password = $('#loginPassword')?.value || '';
    const err = $('#loginError');
    if (email === DEMO_AUTH.email && password === DEMO_AUTH.password) {
      if (err) err.hidden = true;
      setAuthed(true);
      toast('Signed in');
      bootApp();
    } else {
      if (err) {
        err.hidden = false;
        err.textContent = 'Invalid email or password.';
      }
    }
  });
}

async function init() {
  wireAuth();
  document.addEventListener('click', clickHandler);
  document.addEventListener('submit', submitHandler);
  document.addEventListener('change', changeHandler);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.tour.active) {
      e.preventDefault();
      tourSkip();
    }
    if (e.target.id === 'questionText' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#askForm')?.requestSubmit();
    }
  });
  window.addEventListener('resize', () => {
    if (state.tour.active) queueTourPaint();
  });
  $('#a11yToggle')?.addEventListener('click', () => {
    state.large = !state.large;
    document.body.classList.toggle('large-text', state.large);
    toast(state.large ? 'Larger text enabled' : 'Default text size');
  });
  $('#contrastToggle')?.addEventListener('click', () => {
    state.contrast = !state.contrast;
    document.body.classList.toggle('high-contrast', state.contrast);
    toast(state.contrast ? 'High contrast enabled' : 'Standard contrast enabled');
  });
  $('#menuToggle')?.addEventListener('click', () => {
    state.sidebar = !state.sidebar;
    render();
  });
  document.addEventListener('click', (e) => {
    if (e.target.id === 'mobileBackdrop') {
      state.sidebar = false;
      render();
    }
  });
  if (isAuthed()) await bootApp();
  else showGate('landing');
}

init();
