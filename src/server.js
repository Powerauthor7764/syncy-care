import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, dashboard, patientList, reviewQuestion, runTool, TOOL_DEFS, UserError, store, PATIENTS } from './core/service.js';
import { diffSnapshots } from './core/diff.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.json':'application/json'};
const json = (res, status, value, extra={}) => { res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra});res.end(JSON.stringify(value)); };
const fail = (res,err) => json(res,err instanceof UserError?err.status:500,{error:err instanceof UserError?err.message:'Internal server error'});
async function body(req) {
  if (!req.headers['content-type']?.includes('application/json')) throw new UserError('Content-Type must be application/json',415);
  let chunks='',size=0;
  for await(const data of req){ size+=data.length; if(size>16000) throw new UserError('Request body exceeds 16 KB',413); chunks+=data.toString('utf8'); }
  try { const parsed=JSON.parse(chunks); if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error('Expected JSON object');return parsed; }
  catch { throw new UserError('Expected a JSON object in request body'); }
}
async function mcp(req,res) {
  if(req.method!=='POST') { res.writeHead(405,{'allow':'POST','content-type':'application/json'});res.end(JSON.stringify({error:'Only stateless POST requests are supported'}));return; }
  // MCP transport security: reject unapproved browser origins when Origin is supplied.
  const origin=req.headers.origin;
  if(origin){
    const allowed=(process.env.ALLOWED_ORIGIN||'').split(',').map(s=>s.trim()).filter(Boolean);
    const local=/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
    if(!allowed.includes(origin)&&!local) throw new UserError('MCP Origin not allowed',403);
  }
  const x=await body(req);
  const rpc=(result)=>json(res,200,{jsonrpc:'2.0',id:x.id??null,result},{'mcp-protocol-version':'2025-11-25'});
  const error=(code,message)=>json(res,200,{jsonrpc:'2.0',id:x.id??null,error:{code,message}},{'mcp-protocol-version':'2025-11-25'});
  if(x.jsonrpc!=='2.0'||typeof x.method!=='string') return error(-32600,'Invalid JSON-RPC request');
  if(x.method==='notifications/initialized'||x.method.startsWith('notifications/')) {res.writeHead(202);res.end();return;}
  if(x.id===undefined||x.id===null) return error(-32600,'Request ID required');
  if(x.method==='initialize') return rpc({protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false}},serverInfo:{name:'syncy-care',version:'1.0.0'},instructions:'Synthetic-data-only patient understanding demo. Never make clinical decisions. For medical decisions call create_question_for_team. Every response contains source labels and provenance.'});
  if(x.method==='ping') return rpc({});
  if(x.method==='tools/list') return rpc({tools:TOOL_DEFS});
  if(x.method==='tools/call') {
    const name=x.params?.name;
    if(typeof name!=='string') return error(-32602,'Tool name required');
    try {
      const result=await runTool(name,x.params?.arguments);
      return rpc({content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false});
    } catch(e) { if(e instanceof UserError) return rpc({content:[{type:'text',text:e.message}],isError:true}); throw e; }
  }
  return error(-32601,'Unsupported JSON-RPC method');
}
async function api(req,res,pathname,url) {
  if(req.method==='GET'&&pathname==='/health') return json(res,200,{status:'ok',store:store.kind,bedrockConfigured:!!process.env.BEDROCK_MODEL_ID,guardrailConfigured:!!(process.env.BEDROCK_GUARDRAIL_ID&&process.env.BEDROCK_GUARDRAIL_VERSION),syntheticOnly:true,version:'1.0.0'});
  if(req.method==='GET'&&pathname==='/api/patients') return json(res,200,patientList());
  if(req.method==='GET'&&pathname==='/api/config') return json(res,200,{syntheticOnly:true,store:store.kind,bedrockConfigured:!!process.env.BEDROCK_MODEL_ID,guardrailConfigured:!!(process.env.BEDROCK_GUARDRAIL_ID&&process.env.BEDROCK_GUARDRAIL_VERSION),mode:'unauthenticated local demo'});
  if(req.method==='GET'&&pathname.startsWith('/api/patients/')) {
    const id=pathname.split('/')[3]; const p=PATIENTS[id]; if(!p) throw new UserError('Unknown patient',404);
    const { yesterday,snapshot,rationales,medications,...exposed }=p;
    return json(res,200,{...exposed,changes:diffSnapshots(yesterday,snapshot),medications:medications.map(({name,instruction,record})=>({name,instruction,record})),rationales});
  }
  if(req.method==='GET'&&pathname==='/api/dashboard') return json(res,200,await dashboard(url.searchParams.get('patientId')));
  if(req.method==='POST'&&pathname==='/api/ask') {
    const x=await body(req); return json(res,200,await ask(x.patientId,x.question));
  }
  if(req.method==='POST'&&pathname==='/api/tools') {
    const x=await body(req); return json(res,200,await runTool(x.name,x.arguments||{}));
  }
  if(req.method==='POST'&&/^\/api\/questions\/[^/]+\/review$/.test(pathname)) {
    await body(req); return json(res,200,await reviewQuestion(decodeURIComponent(pathname.split('/')[3])));
  }
  if(req.method==='POST'&&pathname==='/api/reset-demo') {
    if(process.env.ENABLE_DEMO_RESET!=='true') throw new UserError('Reset is disabled. Set ENABLE_DEMO_RESET=true for a local demo.',403);
    await body(req); await store.reset(); return json(res,200,{reset:true});
  }
  if(req.method==='GET'&&pathname==='/api/tools') return json(res,200,TOOL_DEFS);
  throw new UserError('Endpoint not found',404);
}
async function serveStatic(req,res,pathname) {
  if(req.method!=='GET'&&req.method!=='HEAD') throw new UserError('Method not allowed',405);
  const target=pathname==='/'?'/index.html':pathname;
  // Only the three public static files are served (no traversal, no config/source files).
  if(!['/index.html','/app.css','/app.js','/favicon.svg'].includes(target)) throw new UserError('Page not found',404);
  const filename=path.join(root,target.slice(1));
  const data=await readFile(filename);
  res.writeHead(200,{'content-type':TYPES[path.extname(filename)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'referrer-policy':'no-referrer'});
  res.end(req.method==='HEAD'?undefined:data);
}
export function createApp() {
  return http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
      const pathname=url.pathname;
      if(pathname==='/mcp') return await mcp(req,res);
      if(pathname==='/health'||pathname.startsWith('/api/')) return await api(req,res,pathname,url);
      return await serveStatic(req,res,pathname);
    } catch(e) { if(!res.headersSent) { if(!(e instanceof UserError)) console.error('[syncy]',e);fail(res,e); } else res.end(); }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||3000);const host=process.env.HOST||'127.0.0.1';
  createApp().listen(port,host,()=>console.log(`Syncy Care · http://${host}:${port} · synthetic demo · ${store.kind}`));
}
