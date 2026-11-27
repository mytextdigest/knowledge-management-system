// Phase 1 worker smoke test against a running worker (local or EC2) on the
// dev queue. Creates a throwaway org, then checks:
//   1. ingestion: a real PDF goes chunk -> embed -> summarize -> ready
//   2. "Run now" governance jobs for that org only: reviews.due-scan,
//      content.stale-scan and documents.purge-deleted (incl. the S3 delete)
// Everything it created (org, user, documents, S3 objects) is removed at the
// end, pass or fail.
// The worker uses the organization's OpenAI key; the throwaway org borrows
// the key of SMOKE_KEY_FROM_ORG (default "NGI") inside the database.
//   node scripts/ekp/worker-smoke.mjs [path/to/file.pdf]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const prisma = new PrismaClient();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const Bucket = process.env.S3_BUCKET;
const DAY = 86_400_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

async function waitFor(label, fn, { timeoutMs, everyMs = 5000 }) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) { console.log(`… timed out waiting for ${label}`); return null; }
    await sleep(everyMs);
  }
}
const s3Exists = (Key) => s3.send(new HeadObjectCommand({ Bucket, Key })).then(() => true, () => false);

const pdfPath = process.argv[2] || "temp/engineering-onboarding-checklist.pdf";
const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const created = { orgId: null, userId: null, keys: [] };

try {
  const user = await prisma.user.create({ data: { email: `worker-smoke-${tag}@contoso.test`, name: "Worker smoke", emailVerified: true } });
  created.userId = user.id;
  const keySource = await prisma.organization.findFirst({ where: { name: process.env.SMOKE_KEY_FROM_ORG || "NGI", openaiApiKey: { not: null } }, select: { openaiApiKey: true } });
  const org = await prisma.organization.create({ data: { name: `zz-worker-smoke-${tag}`, openaiApiKey: keySource?.openaiApiKey ?? null } });
  created.orgId = org.id;
  await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "super_admin" } });
  const dept = await prisma.department.create({ data: { orgId: org.id, name: "Engineering" } });

  // 1. Ingestion, exactly as /api/documents/ingest does it.
  const filename = basename(pdfPath);
  const key = `uploads/${user.id}/org/${org.id}/${filename}`;
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: readFileSync(pdfPath), ContentType: "application/pdf" }));
  created.keys.push(key);
  const doc = await prisma.document.create({ data: {
    filename, filePath: key, status: "queued", classificationStatus: "pending_classification", visibility: "org",
    scope: "repository", orgId: org.id, departmentId: dept.id, category: "SOPs", userId: user.id, ownerId: user.id,
  } });
  await sqs.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: JSON.stringify({
    type: "chunk", docId: doc.id, s3Key: key, filename, projectId: null, userId: user.id, orgId: org.id, visibility: "org", regenerate: false,
  }) }));
  console.log(`queued ${filename} (${doc.id}) in org ${org.name}`);

  // 2. Governance fixtures: an old published document (due for review, stale)
  // and a deleted one past its purge date with a stored file.
  await prisma.reviewPolicy.create({ data: { orgId: org.id, name: "Annual", intervalDays: 365, reviewerType: "owner" } });
  const old = await prisma.document.create({ data: {
    filename: "old-procedure.pdf", status: "ready", scope: "repository", orgId: org.id, departmentId: dept.id,
    userId: user.id, ownerId: user.id, lifecycle: "published", createdAt: new Date(Date.now() - 400 * DAY),
  } });
  const purgeKey = `uploads/${user.id}/org/${org.id}/to-purge.txt`;
  await s3.send(new PutObjectCommand({ Bucket, Key: purgeKey, Body: "purge me", ContentType: "text/plain" }));
  created.keys.push(purgeKey);
  const gone = await prisma.document.create({ data: {
    filename: "to-purge.txt", filePath: purgeKey, status: "ready", scope: "repository", orgId: org.id, departmentId: dept.id,
    userId: user.id, ownerId: user.id, deletedAt: new Date(Date.now() - 40 * DAY), deletedById: user.id, purgeAfter: new Date(Date.now() - 10 * DAY),
  } });
  const JOBS = ["reviews.due-scan", "content.stale-scan", "documents.purge-deleted"];
  for (const name of JOBS) {
    await prisma.scheduledJob.create({ data: {
      key: `${name}:${org.id}`, name, orgId: org.id, intervalMinutes: 1440, enabled: false,
      nextRunAt: new Date(Date.now() + 365 * DAY), runRequestedAt: new Date(),
    } });
  }
  console.log("requested Run now for", JOBS.join(", "));

  const ready = await waitFor("ingestion", async () => {
    const d = await prisma.document.findUnique({ where: { id: doc.id }, select: { status: true } });
    return ["ready", "error"].includes(d?.status) ? d : null;
  }, { timeoutMs: 8 * 60_000 });
  const final = await prisma.document.findUnique({ where: { id: doc.id }, select: { status: true, summary: true, classificationStatus: true, _count: { select: { chunks: true } } } });
  check("ingestion reaches ready", ready?.status === "ready", `status ${final.status}`);
  check("chunks written", final._count.chunks > 0, `${final._count.chunks} chunks`);
  check("summary generated", Boolean(final.summary?.trim()));
  check("classification ran", final.classificationStatus !== "pending_classification", final.classificationStatus);

  const jobs = await waitFor("scheduled jobs", async () => {
    const rows = await prisma.scheduledJob.findMany({ where: { orgId: org.id }, select: { name: true, lastStatus: true, lastError: true, lastResult: true, runRequestedAt: true } });
    return rows.every((j) => j.lastStatus && j.lastStatus !== "running" && !j.runRequestedAt) ? rows : null;
  }, { timeoutMs: 4 * 60_000 });
  for (const name of JOBS) {
    const j = jobs?.find((x) => x.name === name);
    check(`job ${name} ran ok`, j?.lastStatus === "ok", j ? `${j.lastStatus}${j.lastError ? `: ${j.lastError}` : ""} ${JSON.stringify(j.lastResult)}` : "not run");
  }
  const oldNow = await prisma.document.findUnique({ where: { id: old.id }, select: { lifecycleSuggestion: true, _count: { select: { reviewRecords: true } } } });
  check("due review created for the old document", oldNow._count.reviewRecords === 1, `${oldNow._count.reviewRecords} review(s)`);
  check("old document flagged May be outdated", oldNow.lifecycleSuggestion === "archived");
  check("owner notified", (await prisma.notification.count({ where: { orgId: org.id, userId: user.id } })) > 0);
  check("deleted document purged", !(await prisma.document.findUnique({ where: { id: gone.id }, select: { id: true } })));
  check("purged file removed from S3", !(await s3Exists(purgeKey)));
  check("purge audited", (await prisma.auditLog.count({ where: { orgId: org.id, action: "document.purged", entityId: gone.id } })) === 1);
} catch (error) {
  check("smoke test ran without errors", false, error.message);
} finally {
  // Cleanup: documents first (Document.orgId is SET NULL on org delete).
  try {
    for (const Key of created.keys) await s3.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {});
    // Chunk -> Document is RESTRICT, so chunks go first.
    const docWhere = { OR: [created.orgId && { orgId: created.orgId }, created.userId && { userId: created.userId }].filter(Boolean) };
    if (docWhere.OR.length) {
      const ids = (await prisma.document.findMany({ where: docWhere, select: { id: true } })).map((d) => d.id);
      await prisma.chunk.deleteMany({ where: { documentId: { in: ids } } });
      await prisma.document.deleteMany({ where: { id: { in: ids } } });
    }
    if (created.orgId) await prisma.organization.delete({ where: { id: created.orgId } });
    if (created.userId) await prisma.user.delete({ where: { id: created.userId } });
    console.log("cleanup done");
  } catch (error) {
    console.log(`CLEANUP FAILED: ${error.message} (org ${created.orgId}, user ${created.userId})`);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exitCode = 1;
}
