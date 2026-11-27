/** B-9 read-only dry-run. No deletion, S3 operation or audit mutation. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPurgePlan } from '../../../src/lib/lifecycle/purgePolicy.mjs';

const orgId = process.env.PURGE_ORG_ID;
if (!orgId || !/^[a-zA-Z0-9_-]{1,128}$/.test(orgId)) {
  console.error('Set PURGE_ORG_ID to an explicit organization ID. This command is read-only.');
  process.exit(2);
}
const prisma = new PrismaClient();
try {
  // Explicit null overrides deadlines written before the policy was changed.
  const retention = await prisma.orgSetting.findUnique({ where: { orgId_key: { orgId, key: 'retention.deletedDays' } }, select: { value: true } });
  if (retention && retention.value === null) {
    console.log(JSON.stringify({ mode: 'DRY_RUN_ONLY', orgId, scanned: 0, candidates: [], reason: 'never_purge_policy' }, null, 2));
    process.exitCode = 0;
  } else {
  const docs = await prisma.document.findMany({
    where: { orgId, deletedAt: { not: null }, purgeAfter: { lte: new Date() } },
    take: 100,
    orderBy: [{ purgeAfter: 'asc' }, { id: 'asc' }],
    select: {
      id: true, orgId: true, deletedAt: true, purgeAfter: true, filePath: true,
      versions: { select: { filePath: true } },
      supersedes: { select: { id: true }, take: 1 },
      conversations: { select: { id: true }, take: 1 },
      decisionEvidence: { select: { id: true }, take: 1 },
      workflowInstances: { where: { status: 'in_review' }, select: { id: true }, take: 1 },
      reviewRecords: { where: { status: 'pending' }, select: { id: true }, take: 1 },
      _count: { select: { chunks: true, versions: true } },
    },
  });
  const plans = docs.map(d => createPurgePlan(d));
  // Avoid exposing S3 object keys in logs. The planner retains keys for eventual safe cleanup.
  console.log(JSON.stringify({ mode: 'DRY_RUN_ONLY', orgId, scanned: plans.length,
    candidates: plans.map(({ objectKeys, ...p }) => ({ ...p, objectCount: objectKeys.length })) }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
