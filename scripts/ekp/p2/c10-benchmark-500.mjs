// C-10 NFR-5: 500-document classification throughput, real OpenAI + pgvector.
// Dry-run count: node ... --org ORG_ID
// Run (writes auto tags, incurs API costs): node ... --org ORG_ID --apply
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { classifyTaxonomyTerms } from '../../../src/lib/taxonomy/autoTag.mjs';
const db = new PrismaClient();
const args = process.argv.slice(2);
const orgId = args[args.indexOf('--org') + 1];
const apply = args.includes('--apply');
if (!orgId || orgId.startsWith('--')) throw Error('Usage: --org <id> [--apply]');
try {
  const docs = await db.document.findMany({ where: { orgId, deletedAt: null, sourceProvider: 'm3_fixture', status: 'ready' },
    select: { id: true, filename: true, content: true, summary: true }, orderBy: { id: 'asc' }, take: 500 });
  if (!apply) { console.log(JSON.stringify({ dryRun: true, eligible: docs.length, target: 500 })); process.exit(0); }
  if (docs.length !== 500) throw Error(`Need 500 ready fixture documents, found ${docs.length}; seed a dedicated benchmark org with --count 500.`);
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { openaiApiKey: true } });
  const apiKey = org?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw Error('OpenAI key missing');
  const openai = new OpenAI({ apiKey });
  const started = performance.now();
  let success = 0, failures = 0;
  // Concurrency 4: bounded throughput, not an unrealistic 500-way burst.
  for (let i = 0; i < docs.length; i += 4) {
    await Promise.all(docs.slice(i, i + 4).map(async doc => {
      try { await classifyTaxonomyTerms({ prisma: db, openai, orgId, documentId: doc.id,
        filename: doc.filename, summary: doc.summary, text: doc.content }); success++; }
      catch (error) { failures++; console.error(`Classification failed: ${doc.id}: ${error.message}`); }
    }));
  }
  const seconds = (performance.now() - started) / 1000;
  console.log(JSON.stringify({ orgId, documents: docs.length, success, failures, elapsedSeconds: seconds,
    docsPerMinute: Number((success / seconds * 60).toFixed(2)), targetSeconds: 1800,
    passesNfr5: failures === 0 && success === 500 && seconds <= 1800 }, null, 2));
  if (failures) process.exitCode = 1;
} finally { await db.$disconnect(); }
