export function validateWorkflowDraft(name, stages) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120) return 'Enter a workflow name (up to 120 characters).';
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > 12) return 'A workflow needs 1–12 approval stages.';
  for (const stage of stages) {
    if (!stage?.name?.trim() || stage.name.length > 120 || !stage.approverUserId) return 'Each stage needs a name and reviewer.';
  }
  return null;
}
export function parseDocumentId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return id && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}
