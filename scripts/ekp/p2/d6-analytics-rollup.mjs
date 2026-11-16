// D-6 run-now / back-fill for the `analytics.rollup` job. Dry run by default
// (computes and prints the totals); --apply writes AnalyticsDaily rows.
// Usage: node scripts/ekp/p2/d6-analytics-rollup.mjs --org ORG_ID [--days 90] [--apply]
import { PrismaClient } from '@prisma/client';
import { computeUsageDayGroups, rollupUsageRange } from '../../../src/lib/analytics/rollup.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((v, i) => args[i - 1] === name);
const orgId = value('--org');
const days = Number(value('--days') || 3);
const apply = args.includes('--apply');
if (!orgId || !Number.isInteger(days) || days < 1 || days > 400) {
  console.log('Usage: node scripts/ekp/p2/d6-analytics-rollup.mjs --org ORG_ID [--days 1-400] [--apply]');
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new Error('Organization not found');
  if (apply) {
    console.log(JSON.stringify({ mode: 'APPLY', ...(await rollupUsageRange(prisma, { orgId, days })) }));
  } else {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    for (let offset = days - 1; offset >= 0; offset--) {
      const date = new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
      const groups = await computeUsageDayGroups(prisma, { orgId, date });
      const t = groups.all.total;
      console.log(JSON.stringify({ mode: 'DRY_RUN', date, departments: Object.keys(groups).length - 1, searches: t.searches, questions: t.questions, activeUsers: t.activeUsers, clicked: t.clickedSearches, bounced: t.bouncedSearches }));
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
