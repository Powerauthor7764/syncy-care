# AWS Builder — Syncy Care Bedrock integration

I built Syncy Care as a synthetic-data hackathon demonstration. This document describes how I integrated Amazon Bedrock for plain-language rewording without letting a model make clinical decisions.

## Architecture

```text
Patient asks (browser / MCP)
        |
        v
Deterministic safety classifier (GREEN / YELLOW / RED)
        |
        v
Approved care-plan tools (13 MCP tools, in-memory synthetic FHIR-shaped records)
        |
        v  (only after an approved answer exists)
simplify_text / "Make it simpler"
        |
        v
Amazon Bedrock Converse (optional)
  model: us.amazon.nova-micro-v1:0
  region: us-east-2
        |
        v
Output safety check (isSafeRewording) → show reworded text or fall back to approved original
```

Bedrock never reads the chart directly. It only receives text that Syncy Care already approved from synthetic fixtures.

## AWS services used

| Service | How I used it |
|---|---|
| Amazon Bedrock Runtime | `converse` for plain-language rewording of approved synthetic text |
| Amazon Nova Micro | Model / inference profile `us.amazon.nova-micro-v1:0` in `us-east-2` |
| AWS IAM | Least-privilege IAM user `syncy-care-dev` for development (not root) |
| AWS CLI `aws login` | Temporary browser session credentials (no long-lived access keys in the repo) |

I did **not** deploy DynamoDB, Cognito, Guardrails, or other paid infrastructure for this hackathon demo. State remains in-memory synthetic data.

## Application wiring

- `src/core/aws.js` — `rewordApproved()` calls `aws bedrock-runtime converse` with a strict system prompt; `probeBedrock()` is a synthetic smoke test.
- `src/core/service.js` — `simplify_text` uses the last approved response only, then `isSafeRewording`.
- `src/server.js` — `GET /api/bedrock/probe` exposes the smoke test; health/config report Bedrock flags without secrets.
- Environment (local `.env`, never committed): `AWS_PROFILE`, `AWS_REGION=us-east-2`, `BEDROCK_MODEL_ID=us.amazon.nova-micro-v1:0`.

## Setup (reproducible, no secrets)

Requires Node.js 22+ and AWS CLI v2.

```bash
git clone https://github.com/Powerauthor7764/syncy-care.git
cd syncy-care
npm run check

# One-time: sign in as a non-root IAM user with Bedrock Converse permission
aws login --region us-east-2 --profile syncy-care-dev

cp .env.example .env
# Edit .env:
#   AWS_PROFILE=syncy-care-dev
#   AWS_REGION=us-east-2
#   BEDROCK_MODEL_ID=us.amazon.nova-micro-v1:0

node --env-file=.env src/server.js
# Open http://127.0.0.1:3000
# Ask Maria "What's happening today?" then "Make it simpler"
# Or: node --env-file=.env scripts/test-bedrock-e2e.js
```

Verify identity is not root before calling Bedrock:

```bash
aws sts get-caller-identity --profile syncy-care-dev
```

## Safety boundaries I preserved

- RED questions still refuse diagnosis, dosing, prognosis, result interpretation, and discharge decisions.
- Bedrock only rewords previously approved GREEN/YELLOW care-plan text.
- Unsafe paraphrases (advice-like patterns) are rejected; the UI keeps the approved wording.
- If Bedrock errors or credentials are missing, Syncy Care fails closed to the approved text.
- Synthetic patients only (Maria, Jordan, Ahmed). No real patient data.

## Live test evidence (non-root IAM user)

I re-ran a live Amazon Bedrock Converse call on 2026-10-22 after switching the CLI profile to the non-root IAM user `syncy-care-dev`.

| Field | Value |
|---|---|
| Caller ARN | `arn:aws:iam::978610650372:user/syncy-care-dev` (not root) |
| Model / inference profile | `us.amazon.nova-micro-v1:0` |
| Region | `us-east-2` |
| Profile | `syncy-care-dev` |
| Script | `node --env-file=.env scripts/test-bedrock-e2e.js` |
| Result | `probe.ok=true`, `simplify_text` `reworded=true` |

**Probe (synthetic sample, not a real patient):**

- Input: `Today you have bloodwork at 9 AM and physiotherapy at 2 PM. Source: CarePlan/demo-1.`
- Output: `You have bloodwork at 9 AM and physiotherapy at 2 PM today. Source: CarePlan/demo-1.`

**Maria Thompson synthetic daily plan → Make it simpler:**

- Approved source text (excerpt):  
  `8:00 AM: Morning blood sample collected (done)` / `10:00 AM: Physician rounds (done)` / `3:00 PM: Abdominal ultrasound (to do)` / `4:30 PM: Care-plan review...`
- Reworded text:  
  `8:00 AM: Blood sample taken (completed)` / `10:00 AM: Doctor's rounds (completed)` / `3:00 PM: Abdominal ultrasound (scheduled)` / `4:30 PM: Care-plan review (scheduled)`

Automated suite: `npm run check` — **86/86** passing (includes Bedrock stub/fail-closed tests; CI does not require live AWS).

**Credential hygiene for this verification:** I used a short-lived IAM user access key only long enough to prove non-root Converse access, then deleted all access keys on `syncy-care-dev`. Ongoing local demos should use browser `aws login` as the IAM user (not root) or another temporary session—never commit keys.

## Limitations (honest)

- This is a hackathon prototype, not a medical device or HIPAA/PIPEDA-ready system.
- Keyword safety checks are not a guarantee against every paraphrase.
- Cross-region inference profiles may require additional IAM resource ARNs if you change models.
- Anthropic Claude models on Bedrock may require a separate use-case form; I used Amazon Nova Micro to avoid that dependency for this submission.
- The care-team dashboard is unauthenticated; do not host with real patient data.

## Cost posture

I kept costs minimal: on-demand Nova Micro Converse for short synthetic prompts only, no provisioned throughput, no extra AWS databases or hosting required for the local demo.
