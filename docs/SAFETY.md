# Safety case and known limitations

**Scope: hackathon / fictional-data demonstration.** This is not approved for real hospital workflows and is not a medical device. Human review of a real user's situation is outside the capabilities of this software. The question queue does **not** alert a real nurse.

## GREEN / YELLOW / RED

- **GREEN:** read the invented care schedule, pending events, snapshot differences or general definitions.
- **YELLOW:** answer a stated reason only when the invented clinician-authored rationale exists; keep the record ID. Missing rationale goes to a saved question.
- **RED:** any medication start/stop/change or dosage request, diagnosis, prognosis, interpretation of results, judgement of discharge safety or instruction to act as a doctor. Fixed refusal + saved patient-requested review.

`src/core/safety.js` checks RED patterns before YELLOW. This check is applied to `/api/ask`; an MCP tool containing an explicit `question` argument gets a second RED check even if an inappropriate tool was selected. The exposed tools themselves only provide source-limited answers. Tool names and policy metadata are not sufficient to guarantee an untrusted remote model will always choose correctly.

## Other controls

- Medical facts are invented and stored only in local `data.js`; no general-purpose LLM gets chart access.
- Model rewording only occurs in `simplify_text` and accepts the exact prior server-approved text, not an arbitrary text supplied by a caller.
- Any Bedrock network or guardrail failure returns the original text.
- Some advice-like outputs are rejected, but a lexical output filter is not a semantic validator.
- Per-patient question queues and understanding are isolated in the default memory store. All executed tools are audited with a time, patient, tool, policy and source.
- Teach-back matches literal patterns, not clinical knowledge. Correct-looking wording may still be matched in misleading, contradictory or complexly negated sentences; it cannot assess the person's understanding or safe medication use.
- Source strings are **FHIR-shaped identifiers**, not actual FHIR R4 resources or a FHIR server.

## Dangerous gaps before any real deployment

- Independent red-team prompts, multilingual safety testing, clinical risk analysis and domain expert review.
- Hospital SSO, role-based access, patient and family consent/authorization, secure storage, key rotation, encryption controls, logging redaction and retention controls.
- Emergency language handling, escalation operations, real nurse communication, safety incident response and human-factors testing.
- Reliable patient-record integration, reviewed content governance and approved chart revisions.
- Cross-instance concurrency and DynamoDB conditional writes. Memory state currently disappears on restart.
- Threat model, penetration testing and compliance review for applicable jurisdiction.
- Third-party voice recognition processing can occur outside this app; do not dictate real medical information into this prototype.

## Claims not to make

Do not claim the app diagnoses or treats, proves patient comprehension, improves clinical outcomes, reduces readmissions, is medical-device certified, uses real FHIR patient records, has functioning Alexa+ integration, or that optional AWS integration works in a real account without running those validations.
