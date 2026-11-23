// D-9: safe, idempotent backfill; dry run by default.
// node scripts/ekp/p2/d9-backfill-content-updated.mjs --org <id> [--apply]
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const arg = key => { const i = process.argv.indexOf(key); return i < 0 ? null : process.argv[i+1]; };
const orgId = arg('--org');
const apply = process.argv.includes('--apply');
if (!orgId) { console.error('Usage: --org <id> [--apply]'); process.exit(2); }
try {
  let cursor;
  let count = 0, updated = 0;
  for (;;) {
    const docs = await db.document.findMany({
      where: { orgId, contentUpdatedAt: null },
      select: { id: true, createdAt: true, externalModifiedAt: true, sourceProvider: true },
      orderBy: { id: 'asc' }, take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!docs.length) break;
    cursor = docs[docs.length - 1].id;
    count += docs.length;
    if (apply) for (const doc of docs) {
      const date = doc.sourceProvider && doc.sourceProvider !== 'manual' && doc.externalModifiedAt ? doc.externalModifiedAt : doc.createdAt;
      const result = await db.document.updateMany({ where: { id: doc.id, orgId, contentUpdatedAt: null }, data: { contentUpdatedAt: date } });
      updated += result.count;
    }
  }
  console.log(JSON.stringify({ orgId, dryRun: !apply, eligible: count, updated }));
} finally { await db.$disconnect(); }
