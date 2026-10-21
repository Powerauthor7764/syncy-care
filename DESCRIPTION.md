# Syncy Care — hackathon description

## Inspiration

Hospitals have systems for delivering care. Patients need one for **understanding** it. An inpatient sees changing medications, tests and discharge notes while feeling tired, worried, and overwhelmed. A chart may document what was explained, but not which part of the plan the patient understood.

## What it does

Syncy Care lets a patient ask what's happening today, what changed since yesterday, what they're waiting for and what to ask the clinical team. Every patient-specific answer comes from the synthetic approved chart with a source record. When a decision or interpretation is needed, Syncy refuses and queues the patient question for review. Teach-back compares a patient's own words with fixed criteria attached to the recorded medication instruction. A care-team dashboard shows outstanding clarifications and an audit trail.

It provides a responsive web simulator and a 13-tool Streamable-HTTP-style MCP JSON-RPC endpoint intended for integration with a voice client, including the Alexa+ hackathon use case. The browser and MCP endpoint call the same service layer. Chrome mic input and built-in browser speech synthesis are optional demo features.

## How it was built

Node 22+ with a zero-dependency HTTP and MCP JSON-RPC server; a responsive, vanilla HTML/CSS/JavaScript client; deterministic change diff and teach-back engines; a conservative rule-based GREEN/YELLOW/RED classifier; memory state plus optional DynamoDB storage and a Bedrock approved-text rewording adapter. All clinical-looking data is invented and FHIR-shaped, not from HealthLake or patient records. Tests verify the local API, tool boundary and important synthetic-data flows.

## Challenges

A helpful care explanation must not become a hidden medical recommendation. Syncy makes the permitted source of each answer explicit and routes clinical decisions to humans. Its keyword rules are an incomplete prototype, and its demo question queue does not notify real nurses.

## Next

Independently validate MCP interoperability, test any optional AWS integrations against a real account, add adverse-prompt evaluation independent of the development team, implement proper authentication and authorization, and carry out human-factors and clinical governance reviews before pursuing real-world pilots. None of these next steps are claimed as complete.

**Not a medical device. Synthetic-data demo only. The AI explains. The clinician interprets.**
