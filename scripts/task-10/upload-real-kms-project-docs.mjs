// Part B redo, take 2: the first attempt uploaded documents that were
// literally *about* Expert Discovery, which would confuse anyone watching
// the demo into thinking the document content is what matters. This
// version instead uses 3 general project-planning docs from docs/tier-1/
// (not about any specific Tier 2 feature) and puts them under a new
// project called "KMS" under NGI's Engineering department, so the story is
// clearly "people engaging with ordinary project docs", not
// "documents about expert discovery -> expert discovery topic".
//
// Same reasoning as before on why one real ingestion pass instead of a
// throwaway insert: real chunking + real OpenAI embeddings + the real
// classification pipeline, so the resulting Topic is genuine, not staged.
// No S3/SQS in this environment, so this calls the same exported,
// production functions the worker calls (processClusterJobWorker for
// project-scope clustering, then processKnowledgeContext for the
// downstream relationship/expertise refresh), after creating
// Chunks/embeddings exactly like worker/index.js's processEmbeddingJob.
//
// Uploaded "by" Alex Chen (the existing demo persona), continuing his
// "dumped some documents" story - Priya/Sam/Taylor's real engagement will
// attach to these same documents next.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { getOpenAIForDocument } from "../../worker/openai.js";
import { processClusterJobWorker } from "../../worker/cluster.js";
import { processKnowledgeContext } from "../../worker/knowledgeContext.js";

const prisma = new PrismaClient();
const ADMIN_EMAIL = "nexgeninnovation2018@gmail.com";
const UPLOADER_EMAIL = "alex.chen@ngi-expert-demo.example";
const DEPARTMENT_NAME = "Engineering";
const PROJECT_NAME = "KMS";

// Small, deliberate batch of general project-planning docs - not about any
// specific Tier 2 feature, so the topic that emerges isn't "Expert Discovery".
const FILES = [
  "docs/tier-1/IMPLEMENTATION_TRACKER.md",
  "docs/tier-1/CKA_IMPLEMENTATION_TRACKER.md",
  "docs/tier-1/TIER1_COMPLETION_PLAN.md",
];

function chunkText(text, size = 2000, overlap = 0) {
  const chunks = [];
  const step = Math.max(1, size - overlap);
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return chunks;
}

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`${ADMIN_EMAIL} not found.`);
  const membership = await prisma.organizationMember.findFirst({ where: { userId: admin.id } });
  if (!membership) throw new Error(`${ADMIN_EMAIL} has no org membership.`);
  const orgId = membership.orgId;

  const uploader = await prisma.user.findUnique({ where: { email: UPLOADER_EMAIL } });
  if (!uploader) throw new Error(`Demo persona ${UPLOADER_EMAIL} not found - run the Part B persona setup first.`);

  const department = await prisma.department.findFirst({ where: { orgId, name: DEPARTMENT_NAME } });
  if (!department) throw new Error(`Department "${DEPARTMENT_NAME}" not found in this org.`);

  let project = await prisma.project.findFirst({ where: { orgId, departmentId: department.id, name: PROJECT_NAME } });
  if (!project) {
    project = await prisma.project.create({
      data: { name: PROJECT_NAME, orgId, departmentId: department.id, userId: admin.id, scope: "org" },
    });
    console.log(`Created project "${PROJECT_NAME}": ${project.id}`);
  } else {
    console.log(`Reusing existing project "${PROJECT_NAME}": ${project.id}`);
  }

  console.log(`Org: ${orgId}, Department: ${department.id}, Project: ${project.id}, Uploader: ${uploader.email}`);

  for (const relPath of FILES) {
    const absPath = path.resolve(process.cwd(), relPath);
    const filename = path.basename(relPath);

    const existing = await prisma.document.findFirst({ where: { orgId, filename, projectId: project.id } });
    if (existing) {
      console.log(`Skipping ${filename} - already uploaded (document ${existing.id}).`);
      continue;
    }

    const content = fs.readFileSync(absPath, "utf8");
    const doc = await prisma.document.create({
      data: {
        filename, content, userId: uploader.id, orgId,
        departmentId: department.id, projectId: project.id,
        scope: "project", lifecycle: "published", status: "ready",
      },
    });
    console.log(`Created document ${doc.id} for ${filename} (${content.length} chars)`);

    const pieces = chunkText(content);
    await prisma.chunk.createMany({
      data: pieces.map((text, idx) => ({ documentId: doc.id, chunkIndex: idx, text })),
    });

    const openai = await getOpenAIForDocument(doc.id);
    const chunks = await prisma.chunk.findMany({ where: { documentId: doc.id }, orderBy: { chunkIndex: "asc" } });
    for (const chunk of chunks) {
      const emb = await openai.embeddings.create({ model: "text-embedding-3-small", input: chunk.text.slice(0, 30000) });
      const embVec = emb.data[0].embedding;
      await prisma.chunk.update({ where: { id: chunk.id }, data: { embedding: embVec } });
      const embStr = JSON.stringify(embVec);
      await prisma.$executeRaw`UPDATE "Chunk" SET "embedding_vec" = ${embStr}::vector WHERE id = ${chunk.id}`;
    }
    console.log(`  embedded ${chunks.length} chunk(s)`);

    await processClusterJobWorker(doc.id, project.id, false);
    const result = await processKnowledgeContext(doc.id);
    console.log(`  classified into topic: ${result.topicId || "(none)"}`);
  }

  const topics = await prisma.topic.findMany({
    where: { projectId: project.id },
    include: { topicDocuments: { include: { document: { select: { filename: true } } } } },
  });
  console.log(`\nTopics under project "${PROJECT_NAME}" now:`);
  for (const t of topics) {
    console.log(`  "${t.name}" (${t.id}) - ${t.topicDocuments.length} document(s): ${t.topicDocuments.map((td) => td.document.filename).join(", ")}`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
