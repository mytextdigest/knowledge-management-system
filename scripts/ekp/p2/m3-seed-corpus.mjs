// Shared C-M3 / D-M3 fixture. Dry run by default.
// node scripts/ekp/p2/m3-seed-corpus.mjs --org ORG_ID [--apply | --remove]
// Requires DATABASE_URL, AWS_REGION, S3_BUCKET, SQS_QUEUE_URL and AWS credentials.
// Ingests via the same S3 + chunk SQS pipeline as /api/documents/ingest.
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const db = new PrismaClient();
const root = dirname(fileURLToPath(new URL('./fixtures/m3-corpus/manifest.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const orgId = process.argv[process.argv.indexOf('--org') + 1];
const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--remove');
const countIndex = process.argv.indexOf('--count');
const count = countIndex < 0 ? 30 : Number(process.argv[countIndex + 1]);
if (!Number.isInteger(count) || count < 30 || count > 500) throw Error('--count must be 30..500');
const planned = Array.from({ length: count }, (_, i) => {
  const template = manifest.documents[i % manifest.documents.length];
  return i < manifest.documents.length ? template : { ...template, externalId: `m3-bench-${String(i+1).padStart(4,'0')}`, filename: `m3-bench-${String(i+1).padStart(4,'0')}.txt`, sourceFilename: template.filename };
});
const prefix = `m3-fixtures/${orgId}/`;
const setName = 'M3 Evaluation Terms [fixture]';
const fieldKey = 'm3_fixture_topic';
if (!orgId || orgId.startsWith('--') || apply && remove) throw Error('Usage: --org <id> [--apply | --remove]');
const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const topics = [
 ['transformer-maintenance','Transformer Maintenance','substation transformer oil testing'],
 ['grid-reliability','Grid Reliability','outage restoration'],
 ['hydro-generation','Hydro Generation','hydroelectric turbine'],
 ['cybersecurity','Cybersecurity','identity access'],
 ['safety-compliance','Safety Compliance','field safety audits'],
 ['asset-management','Asset Management','asset inventory'],
 ['billing-operations','Billing Operations','meter billing'],
 ['vegetation-management','Vegetation Management','right of way tree trimming'],
 ['renewable-integration','Renewable Integration','solar and wind interconnection'],
 ['emergency-response','Emergency Response','storm response'],
];
try {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw Error('Organization not found');
  const fixtureWhere = { orgId, sourceProvider: 'm3_fixture', externalId: { startsWith: 'm3-' } };
  const existing = await db.document.findMany({ where: fixtureWhere, select: { id: true, filePath: true } });
  const set = await db.termSet.findFirst({ where: { orgId, name: setName }, select: { id: true } });
  if (!apply && !remove) {
    console.log(JSON.stringify({ dryRun: true, orgId, existingDocuments: existing.length, existingSet: !!set, plannedDocuments: planned.length }));
  } else if (remove) {
    // Deliberately remove ONLY records carrying our marker and fixture-owned set.
    const ids = existing.map(d => d.id);
    if (ids.length) await db.document.deleteMany({ where: { id: { in: ids }, ...fixtureWhere } });
    if (set) {
      await db.metadataField.deleteMany({ where: { orgId, termSetId: set.id, key: fieldKey } });
      await db.termSet.delete({ where: { id: set.id } });
    }
    for (const d of existing) if (d.filePath?.startsWith(prefix)) {
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: d.filePath }));
    }
    console.log(JSON.stringify({ removedDocuments: ids.length, removedFixtureSet: !!set }));
  } else {
    if (existing.length || set) throw Error('Fixture already exists. Use --remove before re-seeding.');
    for (const key of ['AWS_REGION','S3_BUCKET','SQS_QUEUE_URL']) if (!process.env[key]) throw Error(`Missing ${key}`);
    const member = await db.organizationMember.findFirst({ where: { orgId, role: 'super_admin' }, select: { userId: true } });
    if (!member) throw Error('Fixture requires an org super_admin to own documents');
    const termSet = await db.termSet.create({ data: { orgId, name: setName, source: 'external', readOnly: true, importFormat: 'skos_ttl', externalId: 'https://example.org/kms-m3/scheme', lastImportedAt: new Date() } });
    await db.metadataField.create({ data: { orgId, termSetId: termSet.id, key: fieldKey, name: 'M3 Fixture Topic', multi: true } });
    const ids = {};
    for (const [slug,label,synonym] of topics) {
      const term = await db.term.create({ data: { termSetId: termSet.id, label, normalizedLabel: label.toLowerCase(), externalId: `https://example.org/kms-m3/${slug}`, synonyms: { create: { label: synonym, normalizedLabel: synonym.toLowerCase() } } } });
      ids[slug] = term.id;
    }
    await db.term.create({ data: { termSetId: termSet.id, label: 'Dielectric Fluid', normalizedLabel: 'dielectric fluid', parentId: ids['transformer-maintenance'], ancestorIds: [ids['transformer-maintenance']], depth: 1, externalId: 'https://example.org/kms-m3/dielectric-fluid', synonyms: { create: { label: 'insulating oil', normalizedLabel: 'insulating oil' } } } });
    // Embed taxonomy once before queueing any document, so classification
    // never waits for a first-document embedding storm.
    const orgKey = await db.organization.findUnique({ where: { id: orgId }, select: { openaiApiKey: true } });
    const apiKey = orgKey?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw Error('Missing org/OpenAI API key for fixture term embeddings');
    const openai = new OpenAI({ apiKey });
    const terms = await db.term.findMany({ where: { termSetId: termSet.id }, select: { id: true, label: true, description: true, synonyms: { select: { label: true } } } });
    const response = await openai.embeddings.create({ model: 'text-embedding-3-small', input: terms.map(t => [t.label, ...t.synonyms.map(x => x.label), t.description].filter(Boolean).join(' | ')) });
    for (const row of response.data) {
      const vector = row.embedding;
      if (!Array.isArray(vector) || vector.length !== 1536) throw Error('Invalid embedding');
      const vectorLiteral = `[${vector.join(',')}]`;
      await db.$executeRaw`UPDATE "Term" SET embedding_vec = ${vectorLiteral}::vector, embedded_at = NOW() WHERE id = ${terms[row.index].id}`;
    }
    let queued = 0;
    for (const entry of planned) {
      const key = `${prefix}${entry.filename}`;
      const body = readFileSync(join(root, entry.sourceFilename || entry.filename));
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: 'text/plain' }));
      const doc = await db.document.create({ data: { orgId, userId: member.userId, ownerId: entry.ownerRequired ? member.userId : null,
        filename: entry.filename, filePath: key, status: 'queued', scope: 'repository', lifecycle: 'published',
        sourceProvider: 'm3_fixture', externalId: entry.externalId, category: entry.categoryRequired ? 'Operations' : null,
        contentUpdatedAt: new Date(entry.contentDate), createdAt: new Date(entry.contentDate), classificationStatus: 'pending_classification' } });
      await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify({
        type: 'chunk', docId: doc.id, s3Key: key, filename: entry.filename, projectId: null, userId: member.userId, orgId,
        visibility: 'private', regenerate: false,
      }) }));
      queued++;
    }
    console.log(JSON.stringify({ orgId, termSetId: termSet.id, queuedDocuments: queued, note: 'Wait for chunk/embedding/classification workers before evaluation.' }));
  }
} finally { await db.$disconnect(); }
