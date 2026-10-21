// All clinical-sounding content below is fictional, synthetic demonstration data.
// Records are FHIR-shaped, not a FHIR server or genuine patient information.
export const TOPICS = ['plan', 'meds', 'tests', 'dc', 'fu'];
export const STATUSES = ['not_reviewed', 'explained', 'understood', 'needs_clarification'];
export const COMMON_ROUNDS = [
  'What is the main goal for my care today?',
  'What tests or results are we waiting for?',
  'Has anything in the plan changed?',
  'What needs to happen before discharge can be considered?',
  'What should I make sure I understand before going home?'
];
export const GLOSSARY = {
  ultrasound: 'An ultrasound is a test that uses sound waves to create images of structures inside the body.',
  bloodwork: 'Bloodwork means tests carried out on a blood sample in a laboratory.',
  'blood test': 'A blood test looks at a sample of blood to provide information to the care team.',
  xray: 'An X-ray is an imaging test that uses a small amount of radiation to make pictures inside the body.',
  'chest xray': 'A chest X-ray is an imaging test that makes pictures of structures in the chest.',
  'chest x-ray': 'A chest X-ray is an imaging test that makes pictures of structures in the chest.',
  iv: 'IV means intravenous: a way for fluid or medicine to enter a vein through a small tube.',
  discharge: 'Discharge is when a hospital team formally arranges for a patient to leave the hospital.',
  physiotherapy: 'Physiotherapy can help people practice movement and function after an illness or surgery.',
  inhaler: 'An inhaler is a device used to deliver medication into the airways.',
  acetaminophen: 'Acetaminophen is a medicine sometimes used for pain or fever. Your care team decides whether and how it is used for you.',
  amoxicillin: 'Amoxicillin is an antibiotic used for certain bacterial infections. Your care team decides whether and how it is used for you.'
};
const item = (id, type, title, status, extra = {}) => ({ id, type, title, status, ...extra });
export const PATIENTS = {
  maria: {
    id: 'maria', name: 'Maria Thompson', age: 68, room: '302', initials: 'MT', color: 'violet',
    situation: 'Understanding an updated abdominal pain care plan',
    summary: 'A test has been added and the medication plan has changed. The care team has noted that discharge may be considered later; it is not decided.',
    today: [
      item('OBS-02041', 'Observation', 'Morning blood sample collected', 'done', { time: '8:00 AM', note: 'Laboratory results are still pending.' }),
      item('CP-02042', 'CarePlan', 'Physician rounds', 'done', { time: '10:00 AM', note: 'The team reviewed the plan.' }),
      item('SR-02047', 'ServiceRequest', 'Abdominal ultrasound', 'todo', { time: '3:00 PM', note: 'Scheduled for this afternoon; confirm timing with the care team.' }),
      item('CP-02049', 'CarePlan', 'Care-plan review', 'todo', { time: '4:30 PM', note: 'An opportunity to clarify what has changed.' })
    ],
    yesterday: [
      item('MR-02040', 'MedicationRequest', 'IV pain medication', 'active'),
      item('SR-02044', 'ServiceRequest', 'Afternoon bloodwork', 'active'),
      item('CP-02042', 'CarePlan', 'Physician rounds', 'active')
    ],
    snapshot: [
      item('MR-02040', 'MedicationRequest', 'IV pain medication', 'discontinued'),
      item('MR-02045', 'MedicationRequest', 'Oral acetaminophen', 'active'),
      item('SR-02044', 'ServiceRequest', 'Afternoon bloodwork', 'cancelled'),
      item('SR-02047', 'ServiceRequest', 'Abdominal ultrasound', 'scheduled'),
      item('CP-02048', 'CarePlan', 'Possible discharge planning', 'preview'),
      item('CP-02042', 'CarePlan', 'Physician rounds', 'active')
    ],
    pending: [
      { label: 'Morning bloodwork results', record: 'Observation/OBS-02041' },
      { label: 'Abdominal ultrasound', record: 'ServiceRequest/SR-02047' },
      { label: 'Care-plan review', record: 'CarePlan/CP-02049' }
    ],
    rationales: {
      test: { text: 'The clinician-written plan says the abdominal ultrasound was ordered to gather more information about the abdominal pain.', record: 'ServiceRequest/SR-02047' },
      medication: { text: 'The recorded plan says the team transitioned from IV pain medication to an oral medication. The chart does not provide a more specific reason.', record: 'MedicationRequest/MR-02045', followUp: true }
    },
    medications: [
      { name: 'Acetaminophen', instruction: 'At least 6 hours apart, only if needed.', record: 'MedicationRequest/MR-02045', criteria: [
        { label: 'At least 6 hours apart', patterns: [/6\s*(hours?|hrs?)/i, /six\s+hours?/i] }
      ] }
    ],
    discharge: { status: 'preview', label: 'Discharge not confirmed', record: 'CarePlan/CP-02048', instructions: ['Review the updated care plan with the hospital team before leaving.'], followUps: ['Ask the care team whether follow-up visits will be needed.'], warningSigns: ['No hospital-approved discharge warning-sign list has been entered yet. Ask your nurse for the approved instructions.'], contact: 'Use the bedside call button to speak with your nurse.' },
    specificQuestions: ['What prompted the ultrasound order?', 'Can you explain why the IV medication was stopped?']
  },
  jordan: {
    id: 'jordan', name: 'Jordan Lee', age: 24, room: '214', initials: 'JL', color: 'blue',
    situation: 'Recovering after surgery; learning discharge instructions',
    summary: 'Discharge teaching is planned for today. Final discharge decisions belong to the clinical team.',
    today: [
      item('CP-03010', 'CarePlan', 'Wound check', 'done', { time: '9:00 AM', note: 'Completed by the care team.' }),
      item('CP-03011', 'CarePlan', 'Physiotherapy walk', 'done', { time: '11:00 AM', note: 'Mobility session completed.' }),
      item('CP-03012', 'CarePlan', 'Discharge teaching', 'todo', { time: '2:00 PM', note: 'Review medication and wound-care information.' }),
      item('CP-03013', 'CarePlan', 'Surgical team review', 'todo', { time: '4:00 PM', note: 'The team will determine next steps.' })
    ],
    yesterday: [item('MR-03007','MedicationRequest','IV antibiotic','active'),item('CP-03010','CarePlan','Wound check','active')],
    snapshot: [item('MR-03007','MedicationRequest','IV antibiotic','discontinued'),item('MR-03009','MedicationRequest','Oral Amoxicillin','active'),item('CP-03010','CarePlan','Wound check','active'),item('CP-03012','CarePlan','Discharge teaching','scheduled')],
    pending: [{ label: 'Surgical team review', record: 'CarePlan/CP-03013' }, { label: 'Discharge teaching', record: 'CarePlan/CP-03012' }],
    rationales: { test: null, medication: { text: 'The synthetic chart documents a change from an IV antibiotic to oral Amoxicillin, but it does not include a reason for the change.', record: 'MedicationRequest/MR-03009', followUp: true } },
    medications: [
      { name: 'Amoxicillin', instruction: 'One tablet twice daily, morning and evening, with food.', record: 'MedicationRequest/MR-03009', criteria: [
        { label: 'One tablet', patterns: [/\b(one|1)\s+(tablet|pill)\b/i] },
        { label: 'Twice daily', patterns: [/twice\s+(?:a\s+day|day|daily)/i, /two\s+times\s+(a\s+)?day/i, /morning.+evening/i] },
        { label: 'With food', patterns: [/with\s+(food|meal)/i] }
      ] },
      { name: 'Acetaminophen', instruction: 'At least 6 hours apart, only if needed.', record: 'MedicationRequest/MR-03015', criteria: [ { label: 'At least 6 hours apart', patterns: [/6\s*(hours?|hrs?)/i, /six\s+hours?/i] } ] }
    ],
    discharge: { status: 'preview', label: 'Awaiting care-team sign-off', record: 'CarePlan/CP-03013', instructions: ['Hospital-approved demo wound-care instruction: Keep the dressing clean and dry until your care team tells you to change it.', 'Review the approved medication list with the discharge nurse.'], followUps: ['The follow-up appointment has not been confirmed in this synthetic chart. Ask the care team.'], warningSigns: ['Hospital-approved demo warning sign: Contact the hospital team if the wound becomes increasingly red or starts draining.', 'Hospital-approved demo warning sign: Contact the hospital team if you develop a fever.'], contact: 'For concerns during the hospital stay, use your bedside call button. Ask the nurse for the post-discharge contact number.' },
    specificQuestions: ['Who will confirm discharge?', 'Can we review how to care for the wound at home?']
  },
  ahmed: {
    id: 'ahmed', name: 'Ahmed Rahman', age: 55, room: '418', initials: 'AR', color: 'orange',
    situation: 'Reviewing respiratory care and inhaler teaching',
    summary: 'Respiratory teaching and an imaging appointment are included in the approved plan. No imaging result is interpreted here.',
    today: [
      item('CP-04010', 'CarePlan', 'Respiratory therapy', 'done', { time: '8:30 AM', note: 'Routine session completed.' }),
      item('SR-04011', 'ServiceRequest', 'Chest X-ray', 'todo', { time: '11:30 AM', note: 'Awaiting imaging.' }),
      item('CP-04012', 'CarePlan', 'Physician rounds', 'todo', { time: '1:00 PM', note: 'Plan review.' }),
      item('CP-04013', 'CarePlan', 'Inhaler teaching', 'todo', { time: '3:00 PM', note: 'Review the care-team-approved instructions.' })
    ],
    yesterday: [item('CP-04009','CarePlan','Oxygen support','higher'),item('CP-04010','CarePlan','Respiratory therapy','active')],
    snapshot: [item('CP-04009','CarePlan','Oxygen support','reduced'),item('CP-04010','CarePlan','Respiratory therapy','active'),item('SR-04011','ServiceRequest','Chest X-ray','scheduled'),item('CP-04013','CarePlan','Inhaler teaching','scheduled')],
    pending: [{ label: 'Chest X-ray appointment', record: 'ServiceRequest/SR-04011' }, { label: 'Physician rounds', record: 'CarePlan/CP-04012' }, { label: 'Inhaler teaching', record: 'CarePlan/CP-04013' }],
    rationales: { test: { text: 'The clinician-authored reason for the chest X-ray is to collect imaging information for the care team.', record: 'ServiceRequest/SR-04011' }, medication: null },
    medications: [{ name: 'Inhaler', instruction: 'Two puffs twice daily, morning and evening.', record: 'MedicationRequest/MR-04014', criteria: [
      { label: 'Two puffs', patterns: [/\b(two|2)\s+puffs?\b/i] },
      { label: 'Twice daily', patterns: [/twice\s+(?:a\s+day|day|daily)/i, /two\s+times\s+(a\s+)?day/i, /morning.+evening/i] }
    ] }],
    discharge: { status: 'not_planned', label: 'No discharge plan entered', record: 'CarePlan/CP-04012', instructions: ['The care team has not approved discharge instructions in the synthetic chart.'], followUps: ['Ask the care team about follow-up needs when the plan is confirmed.'], warningSigns: ['No hospital-approved discharge warning signs have been entered. Ask your care team for the approved list.'], contact: 'Use the bedside call button to speak with your nurse.' },
    specificQuestions: ['What do we need to discuss after the X-ray?', 'Could we go through the inhaler instructions together?']
  }
};
export function getPatient(id) { return Object.hasOwn(PATIENTS, id) ? PATIENTS[id] : null; }
export function sourceOf(item) { return `${item.type}/${item.id}`; }
export function patientList() { return Object.values(PATIENTS).map(({id,name,initials,color,age,room,situation,summary})=>({id,name,initials,color,age,room,situation,summary})); }
