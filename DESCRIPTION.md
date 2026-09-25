## Inspiration

A hospital stay produces a flood of information: different nurses and doctors, tests, changing plans, medication swaps, and a discharge sheet. Syncy Care is the missing communication layer between **patient, family, and care team**, without building another “AI doctor.”

## What it does

Syncy Care is a self-hosted MCP server for a voice-first hospital companion. Patients can ask what is happening today, what changed, what they are waiting for, what to ask during rounds, and what they need to know before going home. Every patient-specific result includes a source and record reference.

Its explicit boundary is:

- **GREEN** — answer directly from the care plan or general education.
- **YELLOW** — answer only from charted rationale with attribution; otherwise queue the question.
- **RED** — never answer clinically; queue the question for the care team.

Syncy also tracks per-topic understanding, provides structured teach-back, a question queue, an audit trail, consent-based family summaries, and a web simulator. All data is synthetic.

## How we built it

- TypeScript and Node with the official MCP SDK and Streamable HTTP.
- Deterministic care-plan snapshot diffs rather than LLM memory.
- Rule-based safety classification before approved tool execution.
- Optional Bedrock/DynamoDB integration points.
- Automated tests for classification, isolation, provenance, diffing, and teach-back.

## Challenges and lessons

The key challenge was remaining useful without giving medical advice. Explicit policy tiers, tool boundaries, provenance, and deterministic teach-back made the prototype easier to reason about than a prompt-only approach. The current safety tests are a baseline, not proof of clinical safety; independent adversarial testing is required.

## What's next

Wire the simulator to the live MCP server, load synthetic FHIR R4 fixtures through HealthLake, add the production agent runtime, and test with nurses, physicians, patients, and caregivers.

## Disclaimer

Prototype using synthetic data only. Not a medical device and not a substitute for professional medical care.
