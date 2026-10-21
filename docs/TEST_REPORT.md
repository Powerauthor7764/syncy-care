# Verification report — October 20, 2026

## Automated tests

Command: `npm run check` using Node.js 22.16.0.

**Result: 79 tests passed, 0 failed (after correcting a teach-back regex uncovered by the tests).** Coverage includes:

- 40 baseline GREEN/YELLOW/RED classification prompts, written by the development team
- Computed snapshot changes, including Maria's five differences and record citations
- Teach-back with incomplete and complete approved pattern criteria, plus negated wording
- Every synthetic patient having sourced plan entries
- RED requests refused, queued and audited
- Injection of a RED prompt through a YELLOW named tool
- Charted YELLOW explanation and unknown reason escalation
- Patient state isolation and unknown patient rejection
- Care-team question review and understanding state preservation
- Simplification limited to previously approved answers; advice-like output rejection
- REST smoke checks and 13-tool MCP JSON-RPC initialize/list/call
- MCP 405 behavior, notifications, origin checks and predictable tool errors

## Browser render check

A Chromium/Playwright pass rendered the **actual HTML, CSS and JavaScript** using fetched synthetic fixture snapshots supplied through a stubbed browser `fetch`, because this environment's browser network navigation to loopback URLs was blocked. The patient, team, architecture and safety views rendered with **no browser JavaScript exceptions**. Screenshots in `docs/screenshots` capture the patient, care-team, and mobile views. This verifies the view rendering, **not** a full network-connected end-to-end browser session.

## Remaining verification

- Official MCP SDK/client interoperability check, Alexa+ host connection, real deployment and external access
- Optional AWS Bedrock/Guardrail/DynamoDB calls with actual authorized credentials
- Independent adversarial safety testing and accessibility audit
- Production authentication, authorization, concurrency and security tests
- Real clinician usability testing (intentionally not done)

No claim is made that clinical outcomes or patient comprehension improved.
