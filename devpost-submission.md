# Syncy Care — Devpost draft

## Inspiration
Hospitals are good at recording care. Patients need help understanding what was recorded: today's tests, what changed, what is pending and what questions to bring to their nurse. We built Syncy Care for the gap between "information delivered" and "information understood."

## What it does
Syncy Care is a synthetic-data bedside companion with a patient interface and 13-tool self-hosted MCP server. It can read back approved recorded facts with citations, compare care-plan snapshots, save questions and help a patient practice explaining written discharge instructions. A care-team dashboard displays self-reported understanding, teach-back criteria and review requests. No diagnosis or care decision is produced.

## How we built it
Node 22, zero-dependency native HTTP server, HTML/CSS/JavaScript simulator, MCP JSON-RPC transport, deterministic snapshot comparison, pattern-matching teach-back, memory state and optional (untested) AWS DynamoDB/Bedrock adapters. Local tests cover GREEN/YELLOW/RED policy and tool routes.

## Challenges
Keeping the product useful without turning it into automated medical advice; making every answer traceable; showing that a patient can flag confusion rather than pretending the machine has assessed comprehension.

## What's next
Official MCP/Alexa+ interoperability testing, real-account optional AWS verification, independent red-teaming, professional clinical governance review and production-grade authorization before any real pilot.

**Demo only; all patient data invented.** Edit this draft to reflect only services and tests genuinely used by the submission date.
