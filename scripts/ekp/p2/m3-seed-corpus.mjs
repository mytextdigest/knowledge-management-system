// Shared C-M3 / D-M3 fixture. Dry run by default.
// node scripts/ekp/p2/m3-seed-corpus.mjs --org ORG_ID [--apply | --remove] [--count 30..500]
// Requires DATABASE_URL, AWS_REGION, S3_BUCKET, SQS_QUEUE_URL and AWS credentials.
// Ingests via the same S3 + chunk SQS pipeline as /api/documents/ingest, so the
// worker chunks, embeds and classifies the documents (C-10 auto-tagging runs).
//
// Everything created is marked and removable with --remove:
// - documents: sourceProvider "m3_fixture", externalId "m3-…" (and their S3 objects)
// - term set "M3 Evaluation Terms [fixture]" (from terms.ttl) + field "m3_fixture_topic"
// - departments "M3 Operations [fixture]" and "M3 Corporate [fixture]"
// - review policy "M3 Review Policy [fixture]" (inactive) with due and overdue records
// The terms come only from terms.ttl, parsed with the C-M2 SKOS parser.
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseSkosTurtle } from '../../../src/lib/taxonomy/import/skos.mjs';
import { normalizeLabel } from '../../../src/lib/taxonomy/labels.mjs';

const db = new PrismaClient();
const root = dirname(fileURLToPath(new URL('./fixtures/m3-corpus/manifest.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const orgId = arg('--org');
const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--remove');
const count = arg('--count') === null ? 30 : Number(arg('--count'));
if (!orgId || orgId.startsWith('--') || (apply && remove)) throw Error('Usage: --org <id> [--apply | --remove] [--count 30..500]');
if (!Number.isInteger(count) || count < 30 || count > 500) throw Error('--count must be 30..500');

// Documents beyond the 30 fixtures are benchmark copies (C-10 throughput only).
const planned = Array.from({ length: count }, (_, i) => {
  const template = manifest.documents[i % manifest.documents.length];
  if (i < manifest.documents.length) return template;
  const key = `m3-bench-${String(i + 1).padStart(4, '0')}`;
  return { ...template, externalId: key, filename: `${key}.txt`, sourceFilename: template.filename, review: undefined, stale: undefined };
});
const prefix = `m3-fixtures/${orgId}/`;
const SET_NAME = 'M3 Evaluation Terms [fixture]';
const FIELD_KEY = 'm3_fixture_topic';
const POLICY_NAME = 'M3 Review Policy [fixture]';
const DEPARTMENTS = [...new Set(manifest.documents.map((d) => d.department))];
const DAY = 86_400_000;

const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });

async function createTerms(termSetId) {
  const parsed = parseSkosTurtle(readFileSync(join(root, 'terms.ttl'), 'utf8'));
  const byUri = new Map(parsed.concepts.map((c) => [c.externalId, c]));
  const depth = (c) => (c.parentExternalId ? 1 + depth(byUri.get(c.parentExternalId)) : 0);
  const ids = new Map();
  const ancestors = new Map();
  for (const c of [...parsed.concepts].sort((a, b) => depth(a) - depth(b))) {
    const parentId = c.parentExternalId ? ids.get(c.parentExternalId) : null;
    const ancestorIds = parentId ? [...ancestors.get(c.parentExternalId), parentId] : [];
    const term = await db.term.create({ data: {
      termSetId, label: c.label, normalizedLabel: normalizeLabel(c.label), externalId: c.externalId,
      parentId, depth: depth(c), ancestorIds,
      synonyms: { create: c.synonyms.map((label) => ({ label, normalizedLabel: normalizeLabel(label) })) },
    } });
    ids.set(c.externalId, term.id);
    ancestors.set(c.externalId, ancestorIds);
  }
  for (const c of parsed.concepts) for (const other of c.relatedExternalIds || []) {
    await db.termRelation.create({ data: { fromTermId: ids.get(c.externalId), toTermId: ids.get(other), kind: 'related' } });
  }
  return ids.size;
}

try {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true, openaiApiKey: true } });
  if (!org) throw Error('Organization not found');
  const fixtureWhere = { orgId, sourceProvider: 'm3_fixture', externalId: { startsWith: 'm3-' } };
  const existing = await db.document.findMany({ where: fixtureWhere, select: { id: true, filePath: true } });
  const set = await db.termSet.findFirst({ where: { orgId, name: SET_NAME }, select: { id: true } });
  const departments = await db.department.findMany({ where: { orgId, name: { in: DEPARTMENTS } }, select: { id: true, name: true } });
  const policy = await db.reviewPolicy.findFirst({ where: { orgId, name: POLICY_NAME }, select: { id: true } });

  if (!apply && !remove) {
    console.log(JSON.stringify({ dryRun: true, orgId, existingDocuments: existing.length, existingSet: !!set,
      existingDepartments: departments.length, existingPolicy: !!policy, plannedDocuments: planned.length }));
  } else if (remove) {
    // Only records carrying the fixture marker or fixture-owned names. Documents
    // go first: their tags, links and review records cascade with them.
    const ids = existing.map((d) => d.id);
    if (ids.length) await db.document.deleteMany({ where: { id: { in: ids }, ...fixtureWhere } });
    if (policy) await db.reviewPolicy.delete({ where: { id: policy.id } });
    if (set) {
      await db.metadataField.deleteMany({ where: { orgId, termSetId: set.id, key: FIELD_KEY } });
      await db.termSet.delete({ where: { id: set.id } });
    }
    let removedDepartments = 0;
    for (const d of departments) {
      // A fixture department someone has since used for real documents is kept.
      if (await db.document.count({ where: { departmentId: d.id } })) continue;
      await db.department.delete({ where: { id: d.id } });
      removedDepartments++;
    }
    for (const d of existing) if (d.filePath?.startsWith(prefix)) {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: d.filePath }));
    }
    console.log(JSON.stringify({ removedDocuments: ids.length, removedFixtureSet: !!set, removedPolicy: !!policy, removedDepartments }));
  } else {
    if (existing.length || set || policy) throw Error('Fixture already exists. Use --remove before re-seeding.');
    for (const key of ['AWS_REGION', 'S3_BUCKET', 'SQS_QUEUE_URL']) if (!process.env[key]) throw Error(`Missing ${key}`);
    const member = await db.organizationMember.findFirst({ where: { orgId, role: 'super_admin' }, select: { userId: true } });
    if (!member) throw Error('Fixture requires an org super_admin to own documents');
    const apiKey = org.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw Error('Missing org/OpenAI API key for fixture term embeddings');

    // A local, editable set, so manual tagging and topic candidates work on it.
    const termSet = await db.termSet.create({ data: { orgId, name: SET_NAME, source: 'local', readOnly: false } });
    await db.metadataField.create({ data: { orgId, termSetId: termSet.id, key: FIELD_KEY, name: 'M3 Fixture Topic', multi: true } });
    const termCount = await createTerms(termSet.id);
    // Embed the set once before queueing documents, as an import does. Same
    // text and version stamp as C-10's ensureTermEmbeddings (kept inline so this
    // script also runs on branches without it).
    const terms = await db.term.findMany({ where: { termSetId: termSet.id }, select: { id: true, label: true, description: true, synonyms: { select: { label: true } } } });
    const response = await new OpenAI({ apiKey }).embeddings.create({ model: 'text-embedding-3-small',
      input: terms.map((t) => [t.label, ...t.synonyms.map((x) => x.label), t.description].filter(Boolean).join(' | ').slice(0, 4000)) });
    for (const row of response.data) {
      if (!Array.isArray(row.embedding) || row.embedding.length !== 1536) throw Error('Invalid embedding');
      await db.$executeRaw`UPDATE "Term" SET embedding_vec = ${`[${row.embedding.join(',')}]`}::vector, embedded_at = updated_at WHERE id = ${terms[row.index].id}`;
    }

    const deptIds = {};
    for (const name of DEPARTMENTS) {
      const found = departments.find((d) => d.name === name);
      deptIds[name] = found?.id || (await db.department.create({ data: { orgId, name } })).id;
    }
    // Inactive, so the review scan never applies it to the org's real documents.
    const reviewPolicy = await db.reviewPolicy.create({ data: { orgId, name: POLICY_NAME, intervalDays: 365, active: false } });

    const now = Date.now();
    let queued = 0;
    for (const entry of planned) {
      const key = `${prefix}${entry.filename}`;
      const body = readFileSync(join(root, entry.sourceFilename || entry.filename));
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: 'text/plain' }));
      const doc = await db.document.create({ data: {
        orgId, userId: member.userId, ownerId: entry.ownerRequired ? member.userId : null,
        departmentId: deptIds[entry.department], filename: entry.filename, filePath: key,
        status: 'queued', scope: 'repository', lifecycle: 'published',
        sourceProvider: 'm3_fixture', externalId: entry.externalId, category: entry.categoryRequired ? 'Operations' : null,
        contentUpdatedAt: new Date(entry.contentDate), createdAt: new Date(entry.contentDate),
        classificationStatus: 'pending_classification',
        // Stands in for B's content.stale-scan result, so the demo needs no view history.
        ...(entry.stale ? { lifecycleSuggestion: 'archived', lifecycleSuggestionReason: 'Fixture: no update in over a year', lifecycleSuggestedAt: new Date() } : {}),
      } });
      if (entry.review) {
        await db.reviewRecord.create({ data: { orgId, documentId: doc.id, policyId: reviewPolicy.id, reviewerId: member.userId, status: 'pending',
          dueAt: new Date(now + (entry.review === 'overdue' ? -14 : 10) * DAY) } });
      }
      await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify({
        type: 'chunk', docId: doc.id, s3Key: key, filename: entry.filename, projectId: null, userId: member.userId, orgId,
        visibility: 'private', regenerate: false,
      }) }));
      queued++;
    }
    console.log(JSON.stringify({ orgId, termSetId: termSet.id, terms: termCount, departments: deptIds, queuedDocuments: queued,
      note: 'Wait for the worker to chunk, embed and classify before evaluating. For the department-admin demo, make a member admin of "M3 Operations [fixture]".' }));
  }
} finally { await db.$disconnect(); }
