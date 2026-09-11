import "dotenv/config";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const orgIdArg = process.argv.find((arg) => arg.startsWith("--org="));
const deptIdArg = process.argv.find((arg) => arg.startsWith("--department="));
const orgId = orgIdArg?.split("=")[1];

if (!orgId) {
  console.error("Usage: node scripts/task-5d/seed-conflict-demo.mjs --org=<ORG_ID> [--department=<DEPARTMENT_ID>]");
  process.exit(1);
}

// Two documents on the same narrow topic with directly contradictory policy
// claims — used to exercise detect-document-conflicts.mjs end-to-end without
// waiting on real documents to happen to disagree.
const DEMO_PAIR = [
  {
    filename: "Remote Work Policy — Engineering (Draft v1).docx",
    text: "Remote Work Policy — Engineering\n\nEngineering staff may work remotely full-time. There is no in-office attendance requirement for engineering roles; teams are expected to coordinate synchronous hours via Slack instead of physical presence.",
    summary:
      '{"overview":"Engineering staff may work fully remote with no in-office requirement.","keyPoints":["No in-office attendance requirement for engineering.","Coordination happens via Slack, not physical presence."]}',
  },
  {
    filename: "Remote Work Policy — Engineering (Updated).docx",
    text: "Remote Work Policy — Engineering\n\nEngineering staff are required to work on-site a minimum of four days per week. Fully remote arrangements for engineering roles are not permitted except by VP-level exception.",
    summary:
      '{"overview":"Engineering staff must work on-site at least four days a week; fully remote is not permitted.","keyPoints":["Minimum four in-office days per week for engineering.","Fully remote engineering roles are not permitted without VP exception."]}',
  },
];

try {
  const department = deptIdArg
    ? await prisma.department.findUnique({ where: { id: deptIdArg.split("=")[1] } })
    : await prisma.department.findFirst({ where: { orgId } });
  if (!department) throw new Error(`No department found for org ${orgId}`);

  const owner = await prisma.document.findFirst({
    where: { orgId },
    select: { userId: true },
  });
  if (!owner) throw new Error(`No existing document/user found to attribute seed docs to in org ${orgId}`);

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { openaiApiKey: true } });
  const apiKey = org?.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("ORG_OPENAI_KEY_MISSING");
  const openai = new OpenAI({ apiKey });

  // Idempotent: wipe any previous run of this exact demo pair before recreating.
  await prisma.document.deleteMany({
    where: { orgId, filename: { in: DEMO_PAIR.map((d) => d.filename) } },
  });

  const created = [];
  for (const demoDoc of DEMO_PAIR) {
    const doc = await prisma.document.create({
      data: {
        filename: demoDoc.filename,
        content: demoDoc.text,
        summary: demoDoc.summary,
        status: "ready",
        userId: owner.userId,
        orgId,
        departmentId: department.id,
        scope: "repository",
        lifecycle: "published",
        category: "Policies",
      },
    });

    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: demoDoc.text,
    });
    const embVec = emb.data[0].embedding;
    const embStr = JSON.stringify(embVec);

    await prisma.chunk.create({
      data: {
        documentId: doc.id,
        chunkIndex: 0,
        text: demoDoc.text,
        summary: demoDoc.summary,
        embedding: embVec,
      },
    });
    await prisma.$executeRaw`UPDATE "Chunk" SET "embedding_vec" = ${embStr}::vector WHERE "document_id" = ${doc.id}`;

    created.push(doc);
    console.log(`Seeded ${doc.filename} (${doc.id})`);
  }

  console.log(
    `Done. Run: npm run task5d:conflicts -- --org=${orgId} to verify the pair gets flagged.`
  );
} finally {
  await prisma.$disconnect();
}
