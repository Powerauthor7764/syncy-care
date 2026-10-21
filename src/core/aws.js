import { createHash, createHmac } from 'node:crypto';
const sha256 = (str) => createHash('sha256').update(str).digest('hex');
const hmac = (key, str) => createHmac('sha256', key).update(str).digest();
// A small AWS Signature V4 HTTPS client. Optional adapters require IAM-scoped AWS credentials.
export async function awsJson({service,host,path='/',body,headers={},region=process.env.AWS_REGION || 'us-east-1'}) {
  const access = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!access || !secret) throw new Error(`${service} configured but AWS credentials not provided`);
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
  const date = datetime.slice(0,8);
  const url = new URL(`https://${host}${path}`);
  const payload = JSON.stringify(body);
  const all = { 'content-type':'application/json', host, 'x-amz-date':datetime, ...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v])) };
  if (process.env.AWS_SESSION_TOKEN) all['x-amz-security-token']=process.env.AWS_SESSION_TOKEN;
  const names = Object.keys(all).sort();
  const signed = names.join(';');
  const canonical = names.map(n=>`${n}:${String(all[n]).trim().replace(/\s+/g,' ')}\n`).join('');
  const q = Array.from(url.searchParams).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const request = ['POST',url.pathname,q,canonical,signed,sha256(payload)].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256(request)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`,date),region),service),'aws4_request');
  const sig = createHmac('sha256',signingKey).update(stringToSign).digest('hex');
  all.authorization = `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 10000);
  try {
    const response = await fetch(url,{method:'POST',headers:all,body:payload,signal:controller.signal});
    const text = await response.text();
    if (!response.ok) throw new Error(`${service} HTTP ${response.status}: ${text.slice(0,240)}`);
    return JSON.parse(text);
  } finally { clearTimeout(timeout); }
}
export async function rewordApproved(original) {
  const model = process.env.BEDROCK_MODEL_ID;
  if (!model) return original;
  // This request shape supports Anthropic Claude Bedrock model IDs.
  const region = process.env.AWS_REGION || 'us-east-1';
  const headers = {};
  if (process.env.BEDROCK_GUARDRAIL_ID && process.env.BEDROCK_GUARDRAIL_VERSION) {
    headers['x-amzn-bedrock-guardrailidentifier'] = process.env.BEDROCK_GUARDRAIL_ID;
    headers['x-amzn-bedrock-guardrailversion'] = process.env.BEDROCK_GUARDRAIL_VERSION;
  }
  const res = await awsJson({service:'bedrock',region,host:`bedrock-runtime.${region}.amazonaws.com`,path:`/model/${encodeURIComponent(model)}/invoke`,headers,body:{
    anthropic_version:'bedrock-2023-05-31',max_tokens:280,temperature:0,
    system:'You simplify ONLY the exact approved text given. Keep every fact and its uncertainty. Never add medical advice, clinical interpretations, dose instructions, diagnoses, timing changes, or recommendations. Do not change the meaning. Return only a simpler paraphrase.',
    messages:[{role:'user',content:[{type:'text',text:original}]}]
  }});
  return res?.content?.filter(x=>x.type==='text').map(x=>x.text).join(' ').trim() || original;
}
