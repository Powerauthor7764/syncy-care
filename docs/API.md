# API + MCP reference

All endpoints are **synthetic demo only**. There is no authentication. Do not expose this server to real medical data or to an untrusted network.

## REST

| Method | Route | Function |
|---|---|---|
| GET | `/` | Browser application |
| GET | `/health` | Status, storage kind, AWS flags, synthetic-only flag |
| GET | `/api/config` | Public demo runtime configuration |
| GET | `/api/patients` | Public metadata for the three synthetic patients |
| GET | `/api/patients/:id` | Synthetic chart/timeline, snapshots diff, discharge content |
| GET | `/api/tools` | Tool descriptions and parameter schemas |
| POST | `/api/ask` | Run server-side classifier + route a question to a service tool |
| POST | `/api/tools` | Call a named tool with structured arguments |
| GET | `/api/dashboard?patientId=maria` | Understanding, queue, audit (optional synthetic patient filter) |
| POST | `/api/questions/:id/review` | Mark a demo patient question reviewed; send JSON `{}` |
| POST | `/api/reset-demo` | Reset state only with `ENABLE_DEMO_RESET=true` |

Example:

```bash
curl -s http://127.0.0.1:3000/api/ask \
  -H 'Content-Type: application/json' \
  -d '{"patientId":"maria","question":"Why was the ultrasound ordered?"}'
```

Response contains `policy` (`GREEN|YELLOW|RED`), `source` (`care_plan|general_education|ask_care_team`), `record` (single first provenance ID), `sourceRecords` (potentially multiple IDs), `text`, `tool`, and when applicable `items`, `queued`, `questionId`, `teachback`, or `understanding`.

## MCP protocol

- `POST /mcp`, stateless JSON-RPC 2.0 request and JSON response; protocol version **2025-11-25**.
- Supported methods: `initialize`, `ping`, `tools/list`, `tools/call`; initialized notifications return `202`.
- `GET /mcp` and `DELETE /mcp` return `405`.
- Every tool schema requires `patientId` exactly `maria|jordan|ahmed`. See `GET /api/tools` for the full schema.
- Browser-origin requests with origins other than localhost and `ALLOWED_ORIGIN` are rejected. This is not a substitute for authentication.
- Validation errors inside tool execution use MCP `isError: true`. Unknown protocol methods return JSON-RPC errors.

Sample tool call:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"record_teach_back","arguments":{"patientId":"jordan","medication":"Amoxicillin","patientAnswer":"One tablet twice a day with food"}}}
```

No SSE event stream, session persistence, resumption or server-initiated messages are implemented. JSON response mode is the only supported mode. Formal official-SDK interoperability validation remains a follow-up item.
