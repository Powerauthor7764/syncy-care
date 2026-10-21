export const RED_REPLY = "That's a decision for your clinical team. I can't tell you to start, stop or change anything, or interpret what it means for you. I've added your question for your nurse so they can review it with you.";
// Deliberately conservative rule-based boundary. NOT a clinically validated classifier.
const RED = [
  /\b(should|could|can|may|must|would|do)\s+i\s+(?:ever\s+)?(?:stop|start|skip|increase|decrease|reduce|change|switch|double|take|quit|miss|combine|restart|adjust)\b/i,
  /\b(?:what|which|how much|how many)\s+(?:is\s+my\s+|should\s+i\s+take\s+)?(?:dose|dosage|milligrams?|mg|tablets?|puffs?)\b/i,
  /\b(?:increase|decrease|change|stop|start|skip|double|adjust|reduce|switch)\s+(?:my|the|a|this)?\s*(?:dose|medication|medicine|pill|drug|inhaler|antibiotic|oxygen)\b/i,
  /\b(?:diagnos(?:e|is|ed|ing)?|prognos(?:is|e)|survival|life expectancy|how long (?:will|do) i live)\b/i,
  /\b(?:do i have|have i got|am i suffering from|what(?:'s| is) wrong with me)\b/i,
  /\b(?:can|should|may|am)\s+i\s+(?:go home|leave|be discharged|ready to leave|safe to go)\b/i,
  /\b(?:am i|is it|are they|is my|was my)\s+(?:safe|healthy|sick|getting worse|healed|better|dying|critical)\b/i,
  /\b(?:is|are|was|were|do|does|did|what(?:'s| is))\b.{0,70}\b(?:test results?|scan|ultrasound|x[ -]?rays?|bloodwork|blood test|lab results?|images?)\b.{0,50}\b(?:bad|normal|okay|ok|serious|mean|show|cancer|dangerous|good)\b/i,
  /\b(?:what (?:do|does)|tell me what)\s+(?:my|the)\s+(?:results?|scans?|x[ -]?rays?|ultrasound|bloodwork|labs?)\s+(?:mean|show|say|indicate)\b/i,
  /\b(?:interpret|evaluate|assess|analy[sz]e)\s+(?:my|the|these)\s+(?:results?|scans?|images?|labs?|bloodwork)\b/i,
  /\b(?:what treatment|which treatment|best treatment|what medicine should|do i need surgery|should i get surgery)\b/i,
  /\b(?:ignore (?:your|the|all) (?:rules|instructions|safety)|pretend (?:you(?:'re| are)|to be) (?:my )?(?:doctor|nurse)|act as (?:my )?doctor|override.*(?:policy|safety))\b/i,
  /\b(?:should i be worried|is this an emergency|is it an emergency|am i going to die|will i die)\b/i,
  /\b(?:is it safe (?:for me )?to|is it okay (?:for me )?to)\s+(?:take|stop|skip|leave|go home|exercise|eat)\b/i,
  /\b(?:tell me (?:how|whether) to (?:take|adjust|stop|start)|recommend (?:a|my) dose)\b/i,
  /\b(?:should|can)\s+(?:my|the)\s+(?:medication|medicine|dose|oxygen|inhaler)\s+(?:be|stay|get)\s+(?:changed|stopped|increased|reduced|doubled)\b/i
];
const YELLOW = [
  /\bwhy\b/i,
  /\b(?:what(?:'s| is| was) the|tell me the) reason\b/i,
  /\b(?:what prompted|what led to)\b/i
];
export function classify(text) {
  if (typeof text !== 'string' || !text.trim()) return 'GREEN';
  if (RED.some(p => p.test(text))) return 'RED';
  if (YELLOW.some(p => p.test(text))) return 'YELLOW';
  return 'GREEN';
}
// A reworder must never make up diagnoses, new dosing, or clinical recommendations.
const UNSAFE_OUTPUT = [
  /\b(?:you (?:probably|likely|definitely) have|your diagnosis is|you have cancer)\b/i,
  /\b(?:you should|i recommend you|please)\s+(?:start|stop|skip|double|increase|decrease|adjust|change|take)\b/i,
  /\b(?:take|use|inject|swallow)\s+\d+(?:\.\d+)?\s*(?:mg|ml|tablets?|puffs?)\b/i,
  /\b(?:safe to (?:go home|leave)|ready for discharge)\b/i
];
export function isSafeRewording(original, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return false;
  if (candidate.length > Math.max(original.length * 1.75, original.length + 180)) return false;
  return !UNSAFE_OUTPUT.some(p => p.test(candidate));
}
