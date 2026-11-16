// D-M2 demo data: a week of synthetic searches, questions and clicks for one
// org, made by its real members (their role and primary department), then the
// roll-up for those days. Every row is marked filters.synthetic = "d-m2-demo"
// so --remove takes it all out again. Dry run by default.
// Usage: node scripts/ekp/p2/d7-seed-usage-week.mjs --org ORG_ID [--apply | --remove]
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { rollupUsageRange } from '../../../src/lib/analytics/rollup.mjs';

const MARK = 'd-m2-demo';
const args = process.argv.slice(2);
const orgId = args.find((v, i) => args[i - 1] === '--org');
const apply = args.includes('--apply');
const remove = args.includes('--remove');
if (!orgId || (apply && remove)) {
  console.log('Usage: node scripts/ekp/p2/d7-seed-usage-week.mjs --org ORG_ID [--apply | --remove]');
  process.exit(1);
}

// Deterministic, so a re-seed gives the same week.
let seed = 20261113;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (a, b) => Math.round(a + rand() * (b - a));

const QUERIES = ['transformer maintenance', 'outage response procedure', 'vegetation management policy', 'safety training schedule',
  'substation inspection checklist', 'budget approval process', 'contractor onboarding', 'incident report template',
  'canal lock operations', 'records retention', 'hydro turbine overhaul', 'switching order procedure'];
const NO_RESULT = ['quantum grid ledger', 'zxq form 99'];
const QUESTIONS = ['how do I request a switching order?', 'who approves capital budgets?', 'what PPE is needed in a substation?',
  'when is the next safety training?', 'how often are transformers inspected?'];

const prisma = new PrismaClient();
try {
  const marked = { orgId, filters: { path: ['synthetic'], equals: MARK } };
  if (remove) {
    const { count } = await prisma.searchEvent.deleteMany({ where: marked });
    await rollupUsageRange(prisma, { orgId, days: 8 });
    console.log(JSON.stringify({ removedEvents: count, rolledUpDays: 8 }));
    process.exit(0);
  }
  const existing = await prisma.searchEvent.count({ where: marked });
  if (existing) throw new Error(`${existing} demo events already exist; run with --remove first`);

  const members = await prisma.organizationMember.findMany({ where: { orgId }, select: { userId: true, role: true, lastDepartmentId: true } });
  const memberships = await prisma.departmentMember.findMany({ where: { department: { orgId } }, orderBy: { createdAt: 'asc' }, select: { userId: true, departmentId: true } });
  const documents = await prisma.document.findMany({ where: { orgId, deletedAt: null }, select: { id: true }, take: 200 });
  if (!members.length || !documents.length) throw new Error('Org needs members and documents');
  const departmentOf = (m) => {
    const ids = memberships.filter((d) => d.userId === m.userId).map((d) => d.departmentId);
    return m.lastDepartmentId && ids.includes(m.lastDepartmentId) ? m.lastDepartmentId : ids[0] ?? null;
  };

  const events = [], clicks = [];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  for (let day = 7; day >= 1; day--) {
    const date = new Date(today.getTime() - day * 86_400_000);
    // Adoption grows over the week.
    const people = members.filter(() => rand() < 0.45 + (7 - day) * 0.06);
    for (const m of people) {
      let at = date.getTime() + between(8, 17) * 3_600_000 + between(0, 3_599) * 1000;
      for (let n = between(1, 5); n > 0; n--) {
        const chat = rand() < 0.3;
        const empty = !chat && rand() < 0.08;
        const query = chat ? pick(QUESTIONS) : empty ? pick(NO_RESULT) : pick(QUERIES);
        const resultCount = empty ? 0 : chat ? 8 : between(3, 20);
        const id = randomUUID();
        events.push({
          id, orgId, userId: m.userId, kind: chat ? 'chat' : rand() < 0.5 ? 'search' : 'repository',
          query, normalizedQuery: query, filters: { synthetic: MARK }, resultCount,
          answerShown: chat, confidence: chat ? pick(['high', 'medium', 'low']) : null,
          latencyMs: between(chat ? 400 : 120, chat ? 1500 : 900), firstTokenMs: chat ? between(1500, 6000) : null,
          departmentId: departmentOf(m), role: m.role, createdAt: new Date(at),
        });
        if (resultCount && rand() < (chat ? 0.35 : 0.6)) {
          clicks.push({ searchEventId: id, documentId: pick(documents).id, rank: between(1, Math.min(5, resultCount)),
            dwellSeconds: between(5, 300), clickedAt: new Date(at + between(2, 40) * 1000) });
        }
        // Next action: a quick reformulation (follow-up) or later in the day.
        at += rand() < 0.25 ? between(10, 50) * 1000 : between(5, 90) * 60_000;
      }
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', members: members.length, events: events.length, clicks: clicks.length }));
  if (apply) {
    await prisma.searchEvent.createMany({ data: events });
    await prisma.searchClick.createMany({ data: clicks });
    const rollup = await rollupUsageRange(prisma, { orgId, days: 8 });
    console.log(JSON.stringify({ inserted: events.length, clicks: clicks.length, rollup }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
