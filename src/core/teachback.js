export function evaluateTeachBack(medication, patientAnswer) {
  // A basic conservative negation check prevents literal keyword matching from
  // turning an explicit refusal into a false 'understood' result. Not semantic validation.
  const negated = /\b(?:don['’]?t|do not|won['’]?t|will not|never|shouldn['’]?t|should not|not supposed to|refuse to|instead of)\b/i.test(patientAnswer);
  const criteria = medication.criteria.map(c => ({ label:c.label, met:!negated && c.patterns.some(p => p.test(patientAnswer)) }));
  const allMet = criteria.length > 0 && criteria.every(c=>c.met);
  return { medication: medication.name, status: allMet ? 'understood' : 'needs_clarification', criteria, approvedInstruction: medication.instruction, record: medication.record };
}
