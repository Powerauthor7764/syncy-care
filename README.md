# Syncy Care

**Care delivered. Care understood.** A complete, self-hosted **synthetic-data demo** for explaining hospital care plans without an AI making clinical decisions. It includes a patient workspace, care-team dashboard, rule-based safety sandbox, audit trail, teach-back practice, and a 13-tool MCP endpoint.

> **Important:** This is a hackathon/prototype demonstration using invented patients and manually authored, FHIR-shaped records. It is **not a medical device, hospital system, clinician substitute, emergency monitoring system, or HIPAA/PIPEDA-ready application.** Never upload real patient data. It intentionally has no real authentication and is not cleared for clinical use.

## Run in 30 seconds

Requires **Node.js 22 or newer**. No npm install or AWS account required for the local demo.

```bash
npm start
```

Open **http://127.0.0.1:3000**.

To run the automated tests:

```bash
npm run check   # syntax check + 79 automated tests at packaging time
npm run dev     # optional automatic restart on source changes
```

From an extracted ZIP folder, open a terminal in the directory containing `package.json`. The browser reads from the same server as the MCP endpoint. No fake login is needed: select one of the three synthetic patients in the top-right corner or sidebar.

### Tour of the working product

1. **Patient workspace** — ask "What's happening today?" and see the timeline, source records, computed changes, pending events, safe rounds questions, discharge read-back, and understanding flags. Pick Maria, Jordan, or Ahmed.
2. **Safety demonstration** — ask "Should I stop taking my medication?" and see the RED refusal and saved question. Ask "Why was my ultrasound ordered?" to see the YELLOW chart-only response.
3. **Teach-back** — with Jordan selected, enter "One tablet twice a day with food" for Amoxicillin. See which fixed criteria matched. Try "One in the morning" to flag clarification.
4. **Care-team dashboard** — see all three patients, pending questions, teach-back attempts and audited tool calls. Mark a synthetic question "reviewed" or export the audit JSON.
5. **Accessibility** — increase font size, choose high contrast, enable spoken replies (where supported), or use Chrome microphone dictation (permission required). The family toggle is only a demonstration of alternate copy, not access control.
6. **Architecture** — inspect the policy boundary, tool list, store and optional AWS flags. **Safety lab** — exercise the real request classifier and read about its limitations.

## System flow

```text
Browser patient + care team                Compatible MCP clients (e.g. Alexa+ integration)
             |                                         |
       POST /api/ask                              POST /mcp
             |                                         |
     server-side classifier                  13 policy-bounded tools
             \__________________ ______________________/
                                |
                       Shared service layer
                  Approved synthetic facts + record IDs
                /                |                  \
         Snapshot diff     Teach-back criteria     Question / understanding state
                \________________|__________________/ 
                                |
                    Memory (default) / optional DynamoDB
                                |
             Bedrock rewording ONLY if configured
                   (optional Guardrail; fail closed)
```

The MCP transport uses stateless **HTTP JSON-RPC** with MCP protocol version `2025-11-25`: `POST /mcp` supports `initialize`, `ping`, `tools/list`, `tools/call` and notifications; `GET`/`DELETE` return 405. The transport was implemented directly with Node's built-in HTTP APIs to keep this deliverable dependency-free; **it is not built on the official MCP SDK** and has **not been independently interoperability-certified**. The actual request/response paths are covered by integration tests. Connect it to a suitable MCP client and run an interoperability check before a contest submission.

### The 13 tools

`get_today_care_plan`, `get_changes_since`, `get_pending_events`, `get_approved_patient_explanation`, `get_discharge_requirements`, `get_rounds_questions`, `create_question_for_team`, `get_patient_questions`, `get_understanding_state`, `set_understanding`, `record_teach_back`, `explain_clinical_term`, `simplify_text`.

Every tool requires a synthetic `patientId` (`maria`, `jordan` or `ahmed`). Approved patient-specific responses contain FHIR-shaped **source record references**. The LLM cannot independently inspect chart records. RED requests received through the simulator or in a `question` argument to a tool are routed to the question queue.

### Example: call the MCP endpoint

```bash
curl -s http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"demo-client","version":"1.0"}}}'

curl -s http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_changes_since","arguments":{"patientId":"maria"}}}'
```

Or send plain-language questions to `POST /api/ask` with `{"patientId":"maria","question":"What changed since yesterday?"}`. See [docs/API.md](docs/API.md) for all routes.

## What each part does

| File | Responsibility |
|---|---|
| `src/server.js` | Node HTTP server; REST routes; MCP JSON-RPC; static app |
| `src/core/data.js` | Three fictional patients, approved chart text, glossary, FHIR-shaped records |
| `src/core/safety.js` | Conservative GREEN / YELLOW / RED keyword classifier and output filter |
| `src/core/diff.js` | Snapshot comparison for the care-plan changes |
| `src/core/teachback.js` | Fixed teach-back criteria (never model-graded) |
| `src/core/store.js` | Serialized demo-state mutations; memory and optional DynamoDB storage |
| `src/core/aws.js` | Optional AWS SigV4 Bedrock and DynamoDB requests |
| `src/core/service.js` | 13 tools, source attribution, routing, question and audit operations |
| `public/` | Responsive browser patient app, care-team app, safety lab, architecture view |
| `tests/` | Safety, provenance, teach-back, REST and MCP integration tests |

**Runtime requirements:** Node 22+, no external npm packages. The source is JavaScript with native ECMAScript modules; the `build` task validates JavaScript syntax because no bundling is necessary. This is a deliberate implementation change from the original TypeScript/Express starter to make the complete project runnable without a package registry.

## Optional AWS integrations — NOT verified against an AWS account

The demo works fully in memory without AWS. To opt in, set environment variables (example: `.env.example`):

- `SYNCY_TABLE`: DynamoDB table name; partition key must be `patientId` (String); AWS credentials with appropriate IAM permissions are required.
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and optional `AWS_SESSION_TOKEN`.
- `BEDROCK_MODEL_ID`: optional Anthropic Claude model ID available in your Bedrock region, used **only for rewording approved prior answers**.
- `BEDROCK_GUARDRAIL_ID` and `BEDROCK_GUARDRAIL_VERSION`: optional guardrail headers.
- `PORT`, `HOST`, `ALLOWED_ORIGIN`, `ENABLE_DEMO_RESET`.

The optional AWS adapter code has **not** been exercised with actual AWS credentials, so do not claim Bedrock/DynamoDB/Guardrails are operational until you verify them in your account. The Bedrock request shape is for Claude models and is not automatically compatible with other model families. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Safety and honest status

- **GREEN** — direct read-back of chart/schedule data or glossary definitions.
- **YELLOW** — only clinician-authored recorded rationale, otherwise queue for the care team.
- **RED** — refuse personal decisions on medication, dosing, diagnosis, prognosis, interpreting results or discharge; add a patient-requested review question.
- **No AI medical opinion** — optional model calls only reword previously approved text. Rewording that matches selected advice-like patterns is rejected, but keyword/output checks are not guarantees.
- **Understand vs. clinically correct** — the teach-back engine can only match a few prewritten patterns. Patient status is not a medical or risk score.
- **No production security** — do not make this instance public with real patient data. The dashboard is unauthenticated. Voice browsers may use their own speech processing.

See [docs/SAFETY.md](docs/SAFETY.md), [docs/TEST_REPORT.md](docs/TEST_REPORT.md), and [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md). The original user-provided product brief is preserved in `docs/ORIGINAL_PRODUCT_GUIDE.txt` for traceability.

## License

MIT. See [LICENSE](LICENSE).

The submitted architecture screenshot is preserved in `docs/ORIGINAL_ARCHITECTURE.png` for comparison with the running Architecture view.
