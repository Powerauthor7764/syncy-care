import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
let server,root;
let sessionCookie='';
before(async()=>{
  server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  root=`http://127.0.0.1:${server.address().port}`;
});
after(()=>new Promise(resolve=>server.close(resolve)));
const rememberCookie=(headers)=>{
  const raw=headers.getSetCookie?.()||[];
  const list=raw.length?raw:[headers.get('set-cookie')].filter(Boolean);
  for(const c of list){
    const m=String(c).match(/syncy-demo-session=([^;]+)/);
    if(m) sessionCookie=`syncy-demo-session=${m[1]}`;
  }
};
const req=async(path,obj)=>{
  const headers={'content-type':'application/json'};
  if(sessionCookie) headers.cookie=sessionCookie;
  const r=await fetch(root+path,obj?{method:'POST',headers,body:JSON.stringify(obj)}:{headers:sessionCookie?{cookie:sessionCookie}:{}});
  rememberCookie(r.headers);
  return {status:r.status,data:await r.json(),headers:r.headers};
};
test('health endpoint declares synthetic and store',async()=>{const {data}=await req('/health');assert.equal(data.syntheticOnly,true);assert.equal(data.store,'memory');});
test('web app and static assets are served',async()=>{for(const p of ['/','/app.css','/app.js','/favicon.svg']){const r=await fetch(root+p);assert.equal(r.status,200);assert((await r.text()).length>100);}});
test('web server does not disclose project source',async()=>{const r=await fetch(root+'/src/core/data.js');assert.equal(r.status,404);});
test('patient list includes only synthetic summaries',async()=>{const {data}=await req('/api/patients');assert.equal(data.length,3);assert.equal(data[0].room,'302');assert(!('medications' in data[0]));});
test('api ask returns computed Maria changes and record provenance',async()=>{const {data}=await req('/api/ask',{patientId:'maria',question:'What changed since yesterday?'});assert.equal(data.count,5);assert(data.sourceRecords.includes('ServiceRequest/SR-02047'));});
test('api ask RED refuses and queues',async()=>{const {data}=await req('/api/ask',{patientId:'ahmed',question:'Should I stop my inhaler?'});assert.equal(data.policy,'RED');assert(data.queued);});
test('MCP initialize protocol/version',async()=>{const {data,headers}=await req('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'0.1'}}});assert.equal(data.result.protocolVersion,'2025-11-25');assert.equal(headers.get('mcp-protocol-version'),'2025-11-25');});
test('MCP tools/list exposes 13 schemas',async()=>{const {data}=await req('/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(data.result.tools.length,13);assert(data.result.tools.every(t=>t.inputSchema.type==='object'));});
test('MCP tools/call returns structured and content',async()=>{const {data}=await req('/mcp',{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_today_care_plan',arguments:{patientId:'jordan'}}});assert.equal(data.result.structuredContent.policy,'GREEN');assert.equal(data.result.content[0].type,'text');});
test('MCP tool errors safely returned',async()=>{const {data}=await req('/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'record_teach_back',arguments:{patientId:'jordan'}}});assert.equal(data.result.isError,true);});
test('MCP GET returns 405 and no spurious stream',async()=>{const r=await fetch(root+'/mcp');assert.equal(r.status,405);});
test('MCP blocks unapproved browser origins',async()=>{const r=await fetch(root+'/mcp',{method:'POST',headers:{'content-type':'application/json','origin':'https://evil.example'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(r.status,403);});
test('MCP initialized notification returns 202',async()=>{const r=await fetch(root+'/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});assert.equal(r.status,202);});
test('dashboard and review endpoint are connected',async()=>{
 const r=await req('/api/ask',{patientId:'maria',question:'Can I go home?'});
 const q=await req('/api/dashboard');assert(q.data.questions.some(x=>x.id===r.data.questionId));
 const done=await req(`/api/questions/${r.data.questionId}/review`,{});assert.equal(done.data.status,'reviewed');
});
test('reset blocked by default',async()=>{const r=await req('/api/reset-demo',{});assert.equal(r.status,403);});
test('invalid patient ID errors (no fallback)',async()=>{const r=await req('/api/ask',{patientId:'hacker',question:'What is happening?'});assert.equal(r.status,404);});
test('unsafe unauthenticated origins receive an error',async()=>{
 const r=await fetch(root+'/mcp',{method:'POST',headers:{origin:'null','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:5,method:'tools/list'})});assert.equal(r.status,403);
});
