import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { answer, patients, type PatientId } from "./core/service.js";

const app = express();
app.use(express.json());
const root = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(root, "../public")));

app.get("/api/patients", (_req, res) => res.json(Object.values(patients)));
app.post("/api/ask", (req, res) => {
  const patientId = (req.body?.patientId ?? "maria") as PatientId;
  const question = String(req.body?.question ?? "");
  const tool = question.toLowerCase().includes("changed") ? "get_changes_since" : question.toLowerCase().includes("waiting") ? "get_pending_events" : question.toLowerCase().includes("today") ? "get_today_care_plan" : "general";
  res.json(answer(tool, patientId, question));
});
app.post("/mcp", (req, res) => {
  const method = req.body?.method;
  if (method === "initialize") return res.json({ jsonrpc: "2.0", id: req.body.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "syncy-care", version: "0.1.0" } } });
  if (method === "tools/list") return res.json({ jsonrpc: "2.0", id: req.body.id, result: { tools: ["get_today_care_plan", "get_changes_since", "get_pending_events", "get_discharge_requirements", "create_question_for_team"].map(name => ({ name, description: `Syncy Care ${name}` })) } });
  if (method === "tools/call") { const name = String(req.body?.params?.name ?? "general"); const args = req.body?.params?.arguments ?? {}; const result = answer(name, (args.patientId ?? "maria") as PatientId, String(args.question ?? "")); return res.json({ jsonrpc: "2.0", id: req.body.id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } }); }
  res.status(400).json({ jsonrpc: "2.0", id: req.body?.id ?? null, error: { code: -32601, message: "Unsupported MCP method" } });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Syncy Care listening on http://localhost:${port}`));
