export function validateSupersession(source, successor) {
  if (!source || !successor) return 'Both documents must exist';
  if (source.id === successor.id) return 'A document cannot supersede itself';
  if (!source.orgId || source.orgId !== successor.orgId) return 'Documents must belong to the same organization';
  if (source.scope !== 'repository' || successor.scope !== 'repository') return 'Only repository documents can be superseded';
  if (source.departmentId !== successor.departmentId) return 'Documents must belong to the same department';
  if (source.lifecycle !== 'published') return 'Only published documents can be superseded';
  if (source.supersededById) return 'Document is already superseded';
  if (successor.lifecycle !== 'published' || successor.supersededById) return 'Successor must be a current published document';
  return null;
}
