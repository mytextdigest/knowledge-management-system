const WORKFLOW_INTENT_PATTERNS = [
  /\bwalk me through\b/i,
  /\bguide me through\b/i,
  /\bstep[- ]by[- ]step\b/i,
  /\bwhat are the steps\b/i,
  /\bhow (?:do|should|can) i\b/i,
  /\bprocedure\b/i,
  /\bprocess\b/i,
  /\bworkflow\b/i,
];

const NEXT_PATTERNS = [/^next\b/i, /\bnext step\b/i, /\bcontinue\b/i, /\bgo on\b/i];
const PREVIOUS_PATTERNS = [/^previous\b/i, /^back\b/i, /\blast step\b/i];
const RESTART_PATTERNS = [/\brestart\b/i, /\bstart over\b/i, /\bfrom the beginning\b/i];
const STOP_PATTERNS = [/\bstop\b/i, /\bend (?:the )?workflow\b/i, /\bcancel\b/i, /\bexit\b/i];

export function parseStructuredSummary(rawSummary) {
  if (!rawSummary) return null;
  if (typeof rawSummary === "object") return rawSummary;
  try {
    return JSON.parse(rawSummary);
  } catch {
    return null;
  }
}

export function getWorkflowSteps(rawSummary) {
  const parsed = parseStructuredSummary(rawSummary);
  const steps = Array.isArray(parsed?.workflowSteps) ? parsed.workflowSteps : [];
  return steps
    .map((step) => String(step || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function classifyWorkflowRequest(question, hasActiveWorkflow = false) {
  const text = String(question || "").trim();
  if (!text) return { action: "none" };

  if (hasActiveWorkflow) {
    if (STOP_PATTERNS.some((pattern) => pattern.test(text))) return { action: "stop" };
    if (RESTART_PATTERNS.some((pattern) => pattern.test(text))) return { action: "restart" };
    if (PREVIOUS_PATTERNS.some((pattern) => pattern.test(text))) return { action: "previous" };
    if (NEXT_PATTERNS.some((pattern) => pattern.test(text))) return { action: "next" };
  }

  if (WORKFLOW_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return { action: "start" };
  }

  return { action: "none" };
}

export function formatWorkflowInstruction({ filename, steps, stepIndex }) {
  const safeIndex = Math.min(Math.max(Number(stepIndex) || 0, 0), Math.max(steps.length - 1, 0));
  const step = steps[safeIndex];
  const position = safeIndex + 1;
  const isLast = position === steps.length;

  return [
    `You are guiding the user through a documented procedure from "${filename}".`,
    `Current step: ${position} of ${steps.length}.`,
    `Instruction: ${step}`,
    "Explain only this step using the supplied repository context. Do not perform actions, claim actions were completed, or advance automatically.",
    isLast
      ? "Tell the user this is the final step and ask them to confirm when they are finished."
      : 'End by telling the user they can reply "next" when ready, or "previous" to go back.',
  ].join("\n");
}
