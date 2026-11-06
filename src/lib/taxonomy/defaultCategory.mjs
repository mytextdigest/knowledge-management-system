// C-3: compatibility bridge between legacy Document.category and Phase 2 terms.
export const DEFAULT_CATEGORIES = Object.freeze([
  'Policies', 'SOPs', 'Reports', 'Meeting Knowledge',
  'Product Knowledge', 'Historical Documents', 'Other',
]);
export const normalizeCategory = (label) => String(label || '').trim().toLocaleLowerCase('en-US');

export async function ensureCategoryTermSet(prisma, orgId) {
  if (!orgId) throw new Error('orgId required');
  // Concurrent seed runs are safe because of the unique org/name key.
  const set = await prisma.termSet.upsert({
    where: { orgId_name: { orgId, name: 'Category' } },
    create: { orgId, name: 'Category', description: 'Legacy document categories', source: 'local' },
    update: {},
  });
  const field = await prisma.metadataField.upsert({
    where: { orgId_key: { orgId, key: 'category' } },
    create: { orgId, key: 'category', name: 'Category', termSetId: set.id, multi: false },
    update: {},
  });
  if (field.termSetId !== set.id) throw new Error('Category field is bound to another term set; refusing to overwrite');
  for (const [sortOrder, label] of DEFAULT_CATEGORIES.entries()) {
    const normalizedLabel = normalizeCategory(label);
    const existing = await prisma.term.findFirst({ where: { termSetId: set.id, parentId: null, normalizedLabel } });
    if (!existing) await prisma.term.create({ data: { termSetId: set.id, label, normalizedLabel, sortOrder } });
  }
  return { set, field };
}

export async function syncDocumentCategory(prisma, { documentId, orgId, category, source = 'import', actorId = null }) {
  if (!documentId || !orgId) return { skipped: 'missing_scope' };
  const field = await prisma.metadataField.findUnique({ where: { orgId_key: { orgId, key: 'category' } } });
  if (!field) return { skipped: 'not_seeded' }; // avoid implicit taxonomy writes on unrelated orgs
  const term = category ? await prisma.term.findFirst({
    where: { termSetId: field.termSetId, normalizedLabel: normalizeCategory(category), status: 'active' },
  }) : null;
  if (category && !term) return { skipped: 'unmapped_category' };
  // Do not delete manual/source-system tags; only replace this bridge's own category rows.
  await prisma.$transaction(async (tx) => {
    await tx.documentTerm.deleteMany({ where: { documentId, fieldId: field.id, source: { in: ['import', 'auto'] } } });
    if (term) await tx.documentTerm.upsert({
      where: { documentId_fieldId_termId: { documentId, fieldId: field.id, termId: term.id } },
      create: { documentId, fieldId: field.id, termId: term.id, source, status: 'accepted', createdById: actorId },
      update: {}, // never overwrite manually approved provenance
    });
  });
  return { termId: term?.id ?? null };
}
