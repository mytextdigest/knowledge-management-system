// B-10 pure validation helpers; never infer authority from uploader identity.
export function validateOwnerCandidate({ orgId, documentOrgId, ownerIsMember, deletedAt }) {
  if (!orgId || documentOrgId !== orgId) return 'Document must belong to the organization';
  if (deletedAt) return 'Deleted documents cannot be reassigned';
  if (!ownerIsMember) return 'Owner must be an active organization member';
  return null;
}
export function validateStewards(ids) {
  if (!Array.isArray(ids) || ids.length > 25 || ids.some(x => typeof x !== 'string' || !x.trim())) return 'Invalid steward IDs';
  if (new Set(ids).size !== ids.length) return 'Duplicate steward IDs';
  return null;
}
