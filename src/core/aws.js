import { createHash, createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpsRequest } from 'node:https';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const sha256 = (str) => createHash('sha256').update(str).digest('hex');
const hmac = (key, str) => createHmac('sha256', key).update(str).digest();

let cachedCreds = null;

/** Resolve short-lived credentials from env or AWS CLI login profile (no long-lived keys). */
async function resolveCredentials() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    };
  }
  const profile = process.env.AWS_PROFILE;
  if (!profile) return null;
  const now = Date.now();
  if (cachedCreds && cachedCreds.expiresAt > now + 60_000) return cachedCreds;
  try {
    const { stdout } = await execFileAsync(
      'aws',
      ['configure', 'export-credentials', '--profile', profile, '--format', 'process'],
      { windowsHide: true, timeout: 15_000, maxBuffer: 64_000 },
    );
    const parsed = JSON.parse(stdout);
    if (!parsed.AccessKeyId || !parsed.SecretAccessKey) return null;
    cachedCreds = {
      accessKeyId: parsed.AccessKeyId,
      secretAccessKey: parsed.SecretAccessKey,
      sessionToken: parsed.SessionToken || undefined,
      expiresAt: parsed.Expiration ? Date.parse(parsed.Expiration) : now + 12 * 60 * 60 * 1000,
    };
    return cachedCreds;
  } catch {
    cachedCreds = null;
    return null;
  }
}

function httpsJson({ host, path: reqPath, headers, body, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      { hostname: host, path: reqPath, method: 'POST', headers },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 240)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('AWS request timed out'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// SigV4 JSON client for optional DynamoDB (and similar) adapters.
export async function awsJson({
  service,
  host,
  path: reqPath = '/',
  body,
  headers = {},
  region = process.env.AWS_REGION || 'us-east-1',
}) {
  const creds = await resolveCredentials();
  if (!creds?.accessKeyId || !creds?.secretAccessKey) {
    throw new Error(
      `${service} configured but AWS credentials not provided (set AWS_PROFILE from aws login, or temporary env credentials)`,
    );
  }
  const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = datetime.slice(0, 8);
  const canonicalPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;
  const payload = JSON.stringify(body);
  const payloadHash = sha256(payload);
  const all = {
    'content-type': 'application/json',
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': datetime,
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
  };
  if (creds.sessionToken) all['x-amz-security-token'] = creds.sessionToken;
  const names = Object.keys(all).sort();
  const signed = names.join(';');
  const canonical = names.map((n) => `${n}:${String(all[n]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const request = ['POST', canonicalPath, '', canonical, signed, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', datetime, scope, sha256(request)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, date), region), service), 'aws4_request');
  const sig = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  all.authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${sig}`;
  try {
    return await httpsJson({ host, path: canonicalPath, headers: all, body: payload });
  } catch (err) {
    throw new Error(`${service} ${err.message}`);
  }
}

/**
 * Reword approved synthetic text via Bedrock Converse using the AWS CLI signer
 * (browser login profile or temporary env credentials — no long-lived access keys).
 */
export async function rewordApproved(original) {
  const model = process.env.BEDROCK_MODEL_ID;
  if (!model) return original;
  // Test-only stubs (never set in production). Keep CI free of live AWS calls.
  if (process.env.SYNCY_BEDROCK_STUB === 'fail') throw new Error('stubbed bedrock failure');
  if (process.env.SYNCY_BEDROCK_STUB === 'ok') return `Simpler words: ${original}`;
  if (process.env.SYNCY_BEDROCK_STUB === 'unsafe') {
    return 'You should stop your medication and double the dose based on this paraphrase.';
  }
  const region = process.env.AWS_REGION || 'us-east-1';
  const input = {
    modelId: model,
    system: [
      {
        text: 'You simplify ONLY the exact approved text given. Keep every fact and its uncertainty. Never add medical advice, clinical interpretations, dose instructions, diagnoses, timing changes, or recommendations. Do not change the meaning. Return only a simpler paraphrase.',
      },
    ],
    messages: [{ role: 'user', content: [{ text: original }] }],
    inferenceConfig: { maxTokens: 280, temperature: 0 },
  };
  if (process.env.BEDROCK_GUARDRAIL_ID && process.env.BEDROCK_GUARDRAIL_VERSION) {
    input.guardrailConfig = {
      guardrailIdentifier: process.env.BEDROCK_GUARDRAIL_ID,
      guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION,
    };
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'syncy-bedrock-'));
  const file = path.join(dir, 'converse.json');
  try {
    await writeFile(file, JSON.stringify(input), 'utf8');
    const args = ['bedrock-runtime', 'converse', '--region', region, '--cli-input-json', `file://${file.replace(/\\/g, '/')}`];
    if (process.env.AWS_PROFILE) args.push('--profile', process.env.AWS_PROFILE);
    const { stdout } = await execFileAsync('aws', args, {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 512_000,
      env: process.env,
    });
    const res = JSON.parse(stdout);
    const text = res?.output?.message?.content
      ?.filter((block) => typeof block.text === 'string')
      .map((block) => block.text)
      .join(' ')
      .trim();
    return text || original;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Probe Bedrock with a tiny synthetic reword (no real patient data). */
export async function probeBedrock() {
  const model = process.env.BEDROCK_MODEL_ID;
  if (!model) return { ok: false, reason: 'BEDROCK_MODEL_ID not set' };
  const sample =
    'Today you have bloodwork at 9 AM and physiotherapy at 2 PM. Source: CarePlan/demo-1.';
  try {
    const out = await rewordApproved(sample);
    return {
      ok: true,
      model,
      region: process.env.AWS_REGION || 'us-east-1',
      profile: process.env.AWS_PROFILE || null,
      sampleOut: out.slice(0, 160),
    };
  } catch (err) {
    return {
      ok: false,
      model,
      region: process.env.AWS_REGION || 'us-east-1',
      profile: process.env.AWS_PROFILE || null,
      reason: String(err?.message || err).slice(0, 320),
    };
  }
}
