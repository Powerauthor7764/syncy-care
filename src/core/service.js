import { randomUUID } from 'node:crypto';
import { COMMON_ROUNDS, GLOSSARY, PATIENTS, getPatient, patientList, sourceOf, STATUSES, TOPICS } from './data.js';
import { classify, RED_REPLY, isSafeRewording } from './safety.js';
import { diffSnapshots } from './diff.js';
import { evaluateTeachBack } from './teachback.js';
import { modifyState, store } from './store.js';
import { rewordApproved } from './aws.js';
export { classify, RED_REPLY, PATIENTS, patientList, store };
export class UserError extends Error { constructor(message, status=400) { super(message); this.name='UserError'; this.status=status; } }
const makeResult = (policy, source, text, records=[], extra={}) => ({policy,source,text,record:records[0]||null,sourceRecords:records,...extra});
const mustText = (value, field, limit=1000) => {
  if(typeof value!=='string'||!value.trim()||value.length>limit) throw new UserError(`${field} must be 1-${limit} characters`);
  return value.trim();
};
const checkPatient = (id) => { const p=getPatient(id); if(!p) throw new UserError('Unknown synthetic patient ID',404); return p; };
function queue(state, question) {
  const normalized=question.trim();
  const record={id:randomUUID(),question:normalized,status:'pending',priority:'Patient-requested review',createdAt:new Date().toISOString(),reviewedAt:null};
  state.questions.unshift(record);
  state.questions=state.questions.slice(0,100);
  return record;
}
function markExplained(state,topic) { if(state.understanding[topic]==='not_reviewed') state.understanding[topic]='explained'; }
const codeToTopic = {get_today_care_plan:'plan',get_changes_since:'plan',get_pending_events:'tests',get_approved_patient_explanation:'tests',get_discharge_requirements:'dc',get_rounds_questions:'plan'};
async function execute(name,p,state,args) {
  if (name === 'get_today_care_plan') {
    const records=p.today.map(sourceOf);
    markExplained(state,'plan');
    return makeResult('GREEN','care_plan',p.today.map(x=>`${x.time}: ${x.title} (${x.status==='done'?'done':'to do'})`).join('\n'),records,{items:p.today});
  }
  if (name === 'get_changes_since') {
    const changes=diffSnapshots(p.yesterday,p.snapshot);
    markExplained(state,'plan');
    return makeResult('GREEN','care_plan',`${changes.length} change${changes.length===1?'':'s'} since yesterday:\n${changes.map(x=>`• ${x.description}`).join('\n')}`,changes.map(x=>x.record),{items:changes,count:changes.length});
  }
  if (name === 'get_pending_events') {
    markExplained(state,'tests');
    return makeResult('GREEN','care_plan',p.pending.map(x=>`• ${x.label}`).join('\n'),p.pending.map(x=>x.record),{items:p.pending});
  }
  if (name === 'get_approved_patient_explanation') {
    const topic=String(args.topic||'test').toLowerCase();
    if(!['test','medication','other'].includes(topic)) throw new UserError('topic must be test, medication or other');
    if(topic!=='other') markExplained(state,topic==='test'?'tests':'meds');
    const info=topic==='other'?null:p.rationales[topic];
    if(!info) { const record=queue(state, mustText(args.question||`Why was the ${topic} plan changed?`,'question')); return makeResult('YELLOW','ask_care_team',`The synthetic chart does not include an approved explanation for this ${topic}. I've saved your question for the team.`,[],{queued:true,questionId:record.id}); }
    let out=info.text, questionId=null;
    if(info.followUp) { const record=queue(state, mustText(args.question||`Can you explain the reason for the ${topic} change?`,'question')); questionId=record.id; out+=' Your question has also been sent to the care team for clarification.'; }
    return makeResult('YELLOW','care_plan',out,[info.record],{queued:!!questionId,questionId});
  }
  if (name === 'get_discharge_requirements') {
    const d=p.discharge;
    markExplained(state,'dc');
    markExplained(state,'fu');
    const text=[d.label, 'Recorded medication instructions (read back exactly; verify with your care team):', ...p.medications.map(m=>`• ${m.name}: ${m.instruction}`), 'Approved/recorded instructions:',...d.instructions.map(x=>`• ${x}`),'Follow-up:',...d.followUps.map(x=>`• ${x}`),'Hospital warning-sign information:',...d.warningSigns.map(x=>`• ${x}`),`Contact: ${d.contact}`].join('\n');
    return makeResult('GREEN','care_plan',text,[d.record,...p.medications.map(m=>m.record)],{data:{...d,medications:p.medications.map(({name,instruction,record})=>({name,instruction,record}))}});
  }
  if (name === 'get_rounds_questions') {
    return makeResult('GREEN','general_education',[...COMMON_ROUNDS,...p.specificQuestions].map((x,i)=>`${i+1}. ${x}`).join('\n'),[],{items:[...COMMON_ROUNDS,...p.specificQuestions]});
  }
  if (name === 'create_question_for_team') {
    const question=mustText(args.question,'question'); const result=queue(state,question);
    return makeResult('RED','ask_care_team',RED_REPLY,[],{queued:true,questionId:result.id});
  }
  if (name === 'get_patient_questions') {
    return makeResult('GREEN','ask_care_team',state.questions.length?`${state.questions.length} saved question(s) for the care team.`:'No saved questions yet.',[],{items:state.questions});
  }
  if (name === 'get_understanding_state') {
    return makeResult('GREEN','care_plan','These are self-reported or rule-checked understanding flags, not a clinical assessment.',[],{understanding:state.understanding,teachbacks:state.teachbacks.slice(0,30),topicsNeedingClarification:TOPICS.filter(t=>state.understanding[t]==='needs_clarification')});
  }
  if (name === 'set_understanding') {
    const topic=mustText(args.topic,'topic',40), status=mustText(args.status,'status',40);
    if(!TOPICS.includes(topic)||!['understood','needs_clarification'].includes(status)) throw new UserError('Choose a valid topic and understood or needs_clarification');
    state.understanding[topic]=status;
    return makeResult('GREEN','care_plan',status==='understood'?'Your self-reported understanding was saved.':'This topic has been flagged for another explanation.',[],{understanding:state.understanding,topic,status});
  }
  if (name === 'record_teach_back') {
    const medication=mustText(args.medication,'medication',100);
    const patientAnswer=mustText(args.patientAnswer,'patientAnswer',1000);
    const approved=p.medications.find(m=>m.name.toLowerCase()===medication.toLowerCase());
    if(!approved) { const q=queue(state,`I need help reviewing the instructions for ${medication}.`); state.understanding.meds='needs_clarification'; return makeResult('YELLOW','ask_care_team','There is no approved instruction for that medication in this synthetic chart. Please review it with the nurse.',[],{queued:true,questionId:q.id}); }
    const result=evaluateTeachBack(approved,patientAnswer);
    state.teachbacks.unshift({...result,id:randomUUID(),createdAt:new Date().toISOString(),answer:patientAnswer});
    state.teachbacks=state.teachbacks.slice(0,50);
    state.understanding.meds=result.status;
    return makeResult('GREEN','care_plan',result.status==='understood'?'Your explanation matched all the checked parts of the recorded instruction. Please confirm with your nurse.':`Some parts need clarification. The recorded instruction says: ${approved.instruction} Please review it with your nurse.`,[approved.record],{teachback:result,understanding:state.understanding});
  }
  if (name === 'explain_clinical_term') {
    const term=mustText(args.term,'term',100).toLowerCase().replace(/[?!.,]/g,'');
    const definition=GLOSSARY[term];
    if (!definition) { const q=queue(state,`What does "${term}" mean in my care plan?`); return makeResult('YELLOW','ask_care_team',"I don't have an approved definition for that term. I've added a question for your care team.",[],{queued:true,questionId:q.id}); }
    return makeResult('GREEN','general_education',definition,[`Glossary/${term.replaceAll(' ','-')}`]);
  }
  if (name === 'simplify_text') {
    // Only use the exact previous approved response, not arbitrary user-supplied prompt text.
    const approved=state.lastApprovedText;
    if(!approved || (args.approvedText!==undefined && args.approvedText!==approved))
      return makeResult('GREEN','general_education','Ask a care-plan question first so I have an approved answer to make simpler.');
    let text=approved;
    try { const proposed=await rewordApproved(approved); if(isSafeRewording(approved,proposed)) text=proposed; }
    catch { /* Fail closed to original approved text */ }
    return makeResult('GREEN','care_plan',text,[],{reworded:text!==approved});
  }
  throw new UserError(`Unknown tool: ${name}`,404);
}
export const TOOL_DEFS = [
  ['get_today_care_plan','List today’s care-plan events with times and record IDs.'],
  ['get_changes_since','Compute changes between yesterday and today’s synthetic chart snapshots.'],
  ['get_pending_events','List pending events and results without interpreting them.'],
  ['get_approved_patient_explanation','Chart-attributed explanation ONLY; unknown rationale gets sent to the care team.'],
  ['get_discharge_requirements','Read back only the approved recorded discharge information, never decide discharge readiness.'],
  ['get_rounds_questions','Offer safe questions to ask the hospital care team.'],
  ['create_question_for_team','MANDATORY for any diagnosis, prognosis, dosing, medicine changes, result interpretation or discharge decisions.'],
  ['get_patient_questions','Read the saved question queue.'],
  ['get_understanding_state','Read self-reported understanding and criteria-based teach-back state.'],
  ['set_understanding','Save patient self-reported understanding or need for clarification.'],
  ['record_teach_back','Compare patient explanation against fixed approved instruction criteria; NOT a medical evaluation.'],
  ['explain_clinical_term','Use approved general-education glossary definitions only.'],
  ['simplify_text','Reword the exact previously approved response; never add medical facts.']
].map(([name,description])=>({name,description,inputSchema:{type:'object',properties:{patientId:{type:'string',enum:['maria','jordan','ahmed']},...(name==='get_approved_patient_explanation'?{topic:{type:'string',enum:['test','medication','other']},question:{type:'string'}}:{}),...(name==='create_question_for_team'?{question:{type:'string'}}:{}),...(name==='set_understanding'?{topic:{type:'string',enum:TOPICS},status:{type:'string',enum:['understood','needs_clarification']}}:{}),...(name==='record_teach_back'?{medication:{type:'string'},patientAnswer:{type:'string'}}:{}),...(name==='explain_clinical_term'?{term:{type:'string'}}:{}),...(name==='simplify_text'?{approvedText:{type:'string'}}:{})},required:['patientId',...(['create_question_for_team'].includes(name)?['question']:[]),...(name==='set_understanding'?['topic','status']:[]),...(name==='record_teach_back'?['medication','patientAnswer']:[]),...(name==='explain_clinical_term'?['term']:[])],additionalProperties:false}}));
export async function runTool(name,args={}) {
  if (!TOOL_DEFS.some(t=>t.name===name)) throw new UserError(`Unknown tool: ${name}`,404);
  if(typeof args!=='object'||!args||Array.isArray(args)) throw new UserError('Tool arguments must be an object');
  const id=mustText(args.patientId,'patientId',30); const patient=checkPatient(id);
  // An MCP caller cannot bypass a RED decision by selecting a different tool name.
  const candidate = typeof args.question==='string'?args.question:typeof args.patientAnswer==='string'?args.patientAnswer:null;
  if(name!=='create_question_for_team' && candidate && classify(candidate)==='RED') {
    return runTool('create_question_for_team',{patientId:id,question:candidate});
  }
  return modifyState(id,async(state)=>{
    const result=await execute(name,patient,state,args);
    if(['GREEN','YELLOW'].includes(result.policy) && result.source==='care_plan' && name!=='simplify_text' && result.text) state.lastApprovedText=result.text;
    state.audit.unshift({id:randomUUID(),at:new Date().toISOString(),patientId:id,tool:name,policy:result.policy,source:result.source,record:result.record||null,summary:result.text.slice(0,180),queued:!!result.queued});
    state.audit=state.audit.slice(0,200);
    return result;
  });
}
export function routeQuestion(question) {
  const q=question.toLowerCase();
  if(classify(question)==='RED') return ['create_question_for_team',{question}];
  if(classify(question)==='YELLOW') return ['get_approved_patient_explanation',{topic:/medic|pain med|antibiotic|inhaler|acetaminophen|amoxicillin|iv\b/i.test(q)?'medication':/test|ultrasound|x[ -]?ray|bloodwork|scan|imag/i.test(q)?'test':'other',question}];
  if(/simpl(er|ify)|easier words|plain language|explain again|less complicated/.test(q)) return ['simplify_text',{}];
  if(/change|different|yesterday|since then/.test(q)) return ['get_changes_since',{}];
  if(/wait|pending|results? pending/.test(q)) return ['get_pending_events',{}];
  if(/discharge|go home|home instructions|before i leave|follow.up|warning signs|medication list|my medicines|my medication instructions/.test(q)) return ['get_discharge_requirements',{}];
  if(/rounds|ask.*(doctor|nurse|team)|questions.*(doctor|nurse|team)/.test(q)) return ['get_rounds_questions',{}];
  if(/what (?:is|does|are) (?:an? |the )?(?:ultrasound|bloodwork|blood test|chest x.ray|x.ray|iv|physiotherapy|inhaler|acetaminophen|amoxicillin)/.test(q)) {
    const match=q.match(/(?:ultrasound|bloodwork|blood test|chest x.ray|x.ray|iv|physiotherapy|inhaler|acetaminophen|amoxicillin)/)?.[0]||'';
    return ['explain_clinical_term',{term:match.replace('x-ray','xray').replace('x ray','xray')}];
  }
  if(/today|schedule|happening|plan|next|timeline|appointment|when/.test(q)) return ['get_today_care_plan',{}];
  return [null,{}];
}
export async function ask(patientId,question) {
  checkPatient(patientId);
  question=mustText(question,'question',1000);
  const [name,extra]=routeQuestion(question);
  if(!name) return {policy:'GREEN',source:'general_education',record:null,sourceRecords:[],text:'I can show today’s plan, changes, pending events, discharge information, care-team questions, or define an approved medical term. For personal clinical decisions, I will send the question to your nurse.',tool:'help'};
  const result=await runTool(name,{patientId,...extra});
  return {...result,tool:name};
}
export async function dashboard(patientId=null) {
  if(patientId!==null) checkPatient(patientId);
  const ids=patientId?[patientId]:Object.keys(PATIENTS);
  const details=await Promise.all(ids.map(async(id)=>({patient:patientList().find(p=>p.id===id),state:await store.get(id)})));
  return {
    summary:{patients:details.length,pendingQuestions:details.reduce((n,x)=>n+x.state.questions.filter(q=>q.status==='pending').length,0),needsClarification:details.reduce((n,x)=>n+Object.values(x.state.understanding).filter(s=>s==='needs_clarification').length,0),teachbacks:details.reduce((n,x)=>n+x.state.teachbacks.length,0)},
    patients:details.map(({patient,state})=>({ ...patient,understanding:state.understanding,pending:state.questions.filter(q=>q.status==='pending').length,teachbacks:state.teachbacks.slice(0,10)})),
    questions:details.flatMap(({patient,state})=>state.questions.map(q=>({...q,patientId:patient.id,patientName:patient.name,room:patient.room}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),
    audit:details.flatMap(({state})=>state.audit).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,200)
  };
}
export async function reviewQuestion(id) {
  const questionId=mustText(id,'question ID',100);
  for(const patientId of Object.keys(PATIENTS)) {
    const state=await store.get(patientId);
    if(state.questions.some(q=>q.id===questionId)) return modifyState(patientId,async(s)=>{
      const item=s.questions.find(q=>q.id===questionId);
      if(!item) throw new UserError('Question not found',404);
      item.status='reviewed'; item.reviewedAt=new Date().toISOString();
      s.audit.unshift({id:randomUUID(),at:new Date().toISOString(),patientId,tool:'review_question',policy:'GREEN',source:'ask_care_team',record:null,summary:`Question marked reviewed by demo care-team screen: ${item.question.slice(0,100)}`,queued:false});
      return item;
    });
  }
  throw new UserError('Question not found',404);
}
