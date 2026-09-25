# Syncy Care

Patient understanding infrastructure for the hospital room.

Syncy Care is a self-hosted MCP server and browser simulator that helps hospitalized patients understand what is happening, what changed, what comes next, and what to ask—without making clinical decisions.

> **Synthetic data only. Not a medical device or a substitute for professional care.**

## Run it

```bash
npm install
npm test
npm run dev
```

Open http://localhost:3000. The MCP endpoint is available at `POST /mcp`.

Demo accounts in the simulator: `patient@syncy.demo / care2026`, `nurse@syncy.demo / rounds2026`, and `judge@syncy.demo / amazon2026`.

## Safety model

- **GREEN**: schedule, care-plan facts, general term definitions.
- **YELLOW**: chart-attributed explanations only; otherwise queue the question.
- **RED**: no clinical decisions, diagnosis, prognosis, dosing, medication changes, discharge decisions, or result interpretation; escalate to the care team.

The rule-based safety classifier runs before tool execution. Patient-specific answers include provenance, and teach-back is checked against structured, clinician-approved criteria.

## MCP tools

`get_today_care_plan`, `get_changes_since`, `get_pending_events`, `get_approved_patient_explanation`, `get_discharge_requirements`, `get_rounds_questions`, `create_question_for_team`, `get_patient_questions`, `get_understanding_state`, `set_understanding`, `record_teach_back`, and `explain_clinical_term`.

## AWS integrations

The default implementation uses in-memory synthetic data. Optional adapters can use DynamoDB for state and Bedrock for rewording already-approved text; configure those integrations only in a controlled environment and never send real patient data to this prototype.

## License

MIT
