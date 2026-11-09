// Explicit, opt-in C-3 seed/backfill. Dry-run by default; no schema changes.
import { PrismaClient } from '@prisma/client';
import { ensureCategoryTermSet, syncDocumentCategory } from '../../../src/lib/taxonomy/defaultCategory.mjs';
const args = process.argv.slice(2);
const orgId = args.find((v, i) => args[i - 1] === '--org');
const apply = args.includes('--apply');
if (!orgId || args.includes('--help')) {
  console.log('Usage: node scripts/ekp/p2/c3-default-category-termset.mjs --org ORG_ID [--apply]');
  process.exit(orgId ? 0 : 1);
}
const prisma = new PrismaClient();
try {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new Error('Organization not found');
  const where = { OR: [{ orgId }, { project: { orgId, scope: 'org' } }], category: { not: null } };
  const count = await prisma.document.count({ where });
  console.log(JSON.stringify({ orgId, eligibleDocuments: count, mode: apply ? 'APPLY' : 'DRY_RUN' }));
  if (!apply) process.exitCode = 0;
  else {
    await ensureCategoryTermSet(prisma, orgId);
    let cursor;
    let processed = 0;
    while (true) {
      const docs = await prisma.document.findMany({ where, select: { id: true, category: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!docs.length) break;
      for (const doc of docs) {
        await syncDocumentCategory(prisma, { documentId: doc.id, orgId, category: doc.category });
        processed++;
      }
      cursor = docs.at(-1).id;
    }
    console.log(JSON.stringify({ processed, complete: true }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
