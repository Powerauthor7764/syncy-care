import { z } from "zod";

export type Policy = "GREEN" | "YELLOW" | "RED";
export type PatientId = "maria" | "jordan" | "ahmed";

export const patients = {
  maria: { id: "maria", name: "Maria Thompson", room: "302", today: ["Bloodwork", "Physician rounds", "Abdominal ultrasound", "Care plan review"], waiting: ["Blood work results", "Ultrasound this afternoon"], changes: ["IV pain medication discontinued", "Oral acetaminophen added", "Abdominal ultrasound added"], meds: [{ name: "Acetaminophen", instruction: "Take only as needed, at least 6 hours apart." }] },
  jordan: { id: "jordan", name: "Jordan Lee", room: "214", today: ["Wound check", "Physiotherapy walk", "Discharge teaching", "Possible discharge"], waiting: ["Surgeon sign-off", "Discharge teaching session"], changes: ["IV antibiotic changed to oral Amoxicillin", "Discharge teaching added"], meds: [{ name: "Amoxicillin", instruction: "One tablet twice daily, morning and evening, with food." }] },
  ahmed: { id: "ahmed", name: "Ahmed Rahman", room: "418", today: ["Respiratory therapy", "Chest X-ray", "Physician rounds", "Inhaler teaching"], waiting: ["Chest X-ray", "Physician review"], changes: ["Oxygen support reduced", "Chest X-ray added", "Inhaler teaching added"], meds: [{ name: "Inhaler", instruction: "Two puffs twice daily, morning and evening." }] }
} as const;

export const toolInput = z.object({ patientId: z.enum(["maria", "jordan", "ahmed"]).default("maria") });
export type ToolResult = { policy: Policy; source: string; record?: string; text: string; queued?: boolean };

const red = [/\b(should|can|may|could) i (stop|start|skip|increase|reduce|change|double|take)\b/i, /\b(diagnos|prognosis|dose|dosage)\b/i, /\b(is|are) .*\b(results?|scan|ultrasound|x-?ray|bloodwork)\b.*\b(bad|normal|ok|serious)\b/i, /\b(can|should) i (go home|leave|be discharged)\b/i];
const yellow = [/\bwhy\b/i, /\breason\b/i];
export function classify(text: string): Policy { if (red.some((r) => r.test(text))) return "RED"; if (yellow.some((r) => r.test(text))) return "YELLOW"; return "GREEN"; }

export function answer(tool: string, patientId: PatientId, question = ""): ToolResult {
  const p = patients[patientId];
  if (classify(question) === "RED" || tool === "create_question_for_team") return { policy: "RED", source: "ask_care_team", text: "That is a decision for your clinical team. I cannot answer it clinically, so I queued your question for the care team.", queued: true };
  if (tool === "get_today_care_plan") return { policy: "GREEN", source: "care_plan", record: "CarePlan synthetic snapshot", text: `Today: ${p.today.join(", ")}.` };
  if (tool === "get_changes_since") return { policy: "GREEN", source: "care_plan", record: "CarePlan snapshot diff", text: `Since yesterday: ${p.changes.join("; ")}.` };
  if (tool === "get_pending_events") return { policy: "GREEN", source: "care_plan", record: "CarePlan pending events", text: `You are waiting for: ${p.waiting.join(" and ")}.` };
  if (tool === "get_approved_patient_explanation") return { policy: "YELLOW", source: "care_plan", record: "Clinician-authored rationale", text: "The chart does not contain enough rationale to explain that safely. I queued the question for your care team.", queued: true };
  if (tool === "get_discharge_requirements") return { policy: "GREEN", source: "care_plan", record: "Discharge instructions", text: `Review your medication list, follow-up appointments, and hospital-approved warning signs with your care team.` };
  return { policy: "GREEN", source: "general_education", text: "I can explain the care plan, what changed, what is pending, discharge requirements, or help prepare questions for rounds." };
}
