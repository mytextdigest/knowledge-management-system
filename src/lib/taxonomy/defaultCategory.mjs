// C-3: compatibility bridge between legacy Document.category and Phase 2 terms.
import { normalizeLabel } from './labels.mjs';

export const DEFAULT_CATEGORIES = Object.freeze([
  'Policies', 'SOPs', 'Reports', 'Meeting Knowledge',
  'Product Knowledge', 'Historical Documents', 'Other',
]);
export const normalizeCategory = normalizeLabel;

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
    const normalizedLabel = normalizeLabel(label);
    const existing = await prisma.term.findFirst({ where: { termSetId: set.id, parentId: null, normalizedLabel } });
    if (!existing) await prisma.term.create({ data: { termSetId: set.id, label, normalizedLabel, sortOrder } });
  }
  return { set, field };
}

/**
 * Keep the Category tag in step with Document.category.
 *
 * - `auto` / `import` (classifier, back-fill): replaces earlier auto/import
 *   rows, but never a person's choice. If a `manual` tag exists the call is
 *   skipped, so re-classifying a document doesn't undo a correction.
 * - `manual` (a reviewer corrected the category): replaces every
 *   auto/import/manual row for the field with one manual row.
 *
 * `source_system` rows (SharePoint tags, A-23 / C-8) are never touched.
 */
export async function syncDocumentCategory(prisma, { documentId, orgId, category, source = 'import', actorId = null }) {
  if (!documentId || !orgId) return { skipped: 'missing_scope' };
  const field = await prisma.metadataField.findUnique({ where: { orgId_key: { orgId, key: 'category' } } });
  if (!field) return { skipped: 'not_seeded' }; // avoid implicit taxonomy writes on unrelated orgs
  const term = category ? await prisma.term.findFirst({
    where: { termSetId: field.termSetId, normalizedLabel: normalizeLabel(category), status: 'active' },
  }) : null;
  if (category && !term) return { skipped: 'unmapped_category' };
  const manual = source === 'manual';
  return prisma.$transaction(async (tx) => {
    if (!manual) {
      const override = await tx.documentTerm.findFirst({ where: { documentId, fieldId: field.id, source: 'manual' }, select: { id: true } });
      if (override) return { skipped: 'manual_override' };
    }
    await tx.documentTerm.deleteMany({
      where: { documentId, fieldId: field.id, source: { in: manual ? ['import', 'auto', 'manual'] : ['import', 'auto'] } },
    });
    if (term) {
      const now = new Date();
      await tx.documentTerm.upsert({
        where: { documentId_fieldId_termId: { documentId, fieldId: field.id, termId: term.id } },
        create: {
          documentId, fieldId: field.id, termId: term.id, source, status: 'accepted', createdById: actorId,
          ...(manual ? { acceptedById: actorId, acceptedAt: now } : {}),
        },
        update: {}, // an existing source_system row for the same term stays as it is
      });
    }
    return { termId: term?.id ?? null };
  });
}
