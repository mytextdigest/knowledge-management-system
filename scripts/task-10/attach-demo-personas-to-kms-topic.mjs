// Part B redo, final step: attach the 4 demo personas' activity to the real
// "Conversational Knowledge Assistant Implementation" topic (under the real
// "KMS" project, populated by upload-real-kms-project-docs.mjs), so the
// Experts page actually shows a ranked list on real content.
//
// Alex Chen already uploaded the 3 real documents in that earlier step
// (uploads=3, capped at 1.5 - no further action needed for him here).
// Everyone else's engagement centers on one real "hub" document
// (CKA_IMPLEMENTATION_TRACKER.md - it's the one that best matches the
// topic's final subject-based name) rather than fabricating any new
// documents, so every document in this org stays real - only the
// engagement signals are synthetic demo data.
//
//   Priya Nair   - 1 lesson, 5 real questions, 30 min reading, 3 citations (recent)  -> real contributor, ranks top
//   Sam Okafor   - 0 uploads, 4 questions, 20 min reading, 3 citations (recent)      -> hidden expert, outranks the uploader
//   Alex Chen    - 3 real uploads, nothing else (already done)                       -> the old "uploads = expert" bug
//   Taylor Brooks- 2 lessons on the hub doc, backdated ~400 days                     -> decay drags a once-strong signal to the bottom
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { refreshTopicExpertise } from "../../worker/knowledgeContext.js";
import { getAccessibleExpertsWithPrisma } from "../../src/lib/expertDiscoveryQuery.mjs";

const prisma = new PrismaClient();
const ADMIN_EMAIL = "nexgeninnovation2018@gmail.com";
const PROJECT_NAME = "KMS";
const HUB_DOC_FILENAME = "CKA_IMPLEMENTATION_TRACKER.md";
const DEMO_DOMAIN = "ngi-expert-demo.example";

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) throw new Error(`${ADMIN_EMAIL} not found.`);
  const membership = await prisma.organizationMember.findFirst({ where: { userId: admin.id } });
  if (!membership) throw new Error(`${ADMIN_EMAIL} has no org membership.`);
  const orgId = membership.orgId;

  const project = await prisma.project.findFirst({ where: { orgId, name: PROJECT_NAME } });
  if (!project) throw new Error(`Project "${PROJECT_NAME}" not found - run upload-real-kms-project-docs.mjs first.`);

  const hubDoc = await prisma.document.findFirst({ where: { projectId: project.id, filename: HUB_DOC_FILENAME } });
  if (!hubDoc) throw new Error(`Hub document "${HUB_DOC_FILENAME}" not found under project "${PROJECT_NAME}".`);

  const topicDoc = await prisma.topicDocument.findUnique({ where: { documentId: hubDoc.id }, include: { topic: true } });
  if (!topicDoc) throw new Error(`Hub document has no topic assignment yet.`);
  const topic = topicDoc.topic;
  console.log(`Hub document: ${hubDoc.id} (${hubDoc.filename}), Topic: "${topic.name}" (${topic.id})`);

  const priya = await prisma.user.findUnique({ where: { email: `priya.nair@${DEMO_DOMAIN}` } });
  const sam = await prisma.user.findUnique({ where: { email: `sam.okafor@${DEMO_DOMAIN}` } });
  const taylor = await prisma.user.findUnique({ where: { email: `taylor.brooks@${DEMO_DOMAIN}` } });
  if (!priya || !sam || !taylor) throw new Error("One or more demo persona accounts not found.");

  const alreadySeeded = await prisma.lesson.findFirst({ where: { documentId: hubDoc.id, authorUserId: priya.id } });
  if (alreadySeeded) {
    console.log("Already seeded (Priya's lesson on the hub doc already exists) - nothing to do.");
    return;
  }

  // --- Priya: real engagement, recent. ---
  await prisma.lesson.create({
    data: {
      orgId, documentId: hubDoc.id, authorUserId: priya.id, status: "published",
      whatHappened: "[Sample data for the Expert Discovery feature demo] Walked through this tracker in depth to understand the CKA rollout status and dependencies.",
    },
  });
  const priyaQuestions = [
    "Which of these tracker items are actually blocking the next release?",
    "Can you clarify the dependency between this item and the ingestion pipeline work?",
    "Who owns the follow-up on the item still marked in progress?",
    "Does this reflect the latest status, or is anything here stale?",
    "What's the risk if this milestone slips another sprint?",
  ];
  for (const q of priyaQuestions) {
    const conv = await prisma.conversation.create({ data: { userId: priya.id, documentId: hubDoc.id } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: q } });
  }
  await prisma.documentInteraction.create({
    data: { documentId: hubDoc.id, userId: priya.id, orgId, type: "study_duration", durationSeconds: 1800 },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.chatAuditLog.create({
      data: { orgId, userId: priya.id, question: `Priya demo citation question ${i + 1}`, citedDocIds: [hubDoc.id] },
    });
  }
  console.log("Priya Nair: 1 lesson, 5 questions, 30 min reading, 3 citations - recent");

  // --- Sam: the hidden expert - zero uploads, real engagement, recent. ---
  const samQuestions = [
    "What assumptions is this tracker making about team capacity?",
    "Does this conflict with what's tracked in the other implementation doc?",
    "Can we get a plain-language summary of what's actually left?",
    "Who should be pinged if one of these items is at risk?",
  ];
  for (const q of samQuestions) {
    const conv = await prisma.conversation.create({ data: { userId: sam.id, documentId: hubDoc.id } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: q } });
  }
  await prisma.documentInteraction.create({
    data: { documentId: hubDoc.id, userId: sam.id, orgId, type: "study_duration", durationSeconds: 1200 },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.chatAuditLog.create({
      data: { orgId, userId: sam.id, question: `Sam demo citation question ${i + 1}`, citedDocIds: [hubDoc.id] },
    });
  }
  console.log("Sam Okafor: 0 uploads, 4 questions, 20 min reading, 3 citations - recent, never owned any of the material");

  // --- Taylor: heavy activity, but ~400 days stale. ---
  const longAgo = new Date(Date.now() - 400 * 86400000);
  for (let i = 0; i < 2; i++) {
    await prisma.lesson.create({
      data: {
        orgId, documentId: hubDoc.id, authorUserId: taylor.id, status: "published",
        whatHappened: `[Sample data for the Expert Discovery feature demo] Historical lesson ${i + 1} from reviewing this tracker, authored well over a year ago.`,
        createdAt: longAgo,
      },
    });
  }
  console.log("Taylor Brooks: 2 lessons on the hub doc, backdated ~400 days - demonstrates recency decay");

  console.log("\nRunning refreshTopicExpertise...");
  await refreshTopicExpertise(topic.id, orgId);

  const rows = await prisma.topicExpertise.findMany({ where: { topicId: topic.id }, include: { user: true }, orderBy: { score: "desc" } });
  console.log(`\nFinal ranking for "${topic.name}":`);
  for (const row of rows) console.log(`  ${row.score.toFixed(2).padStart(6)}  ${row.user.name || row.user.email} (${row.source})`);

  console.log("\nVerifying through the real Experts page query path...");
  const experts = await getAccessibleExpertsWithPrisma(prisma, { orgId, userId: admin.id, query: topic.name, isSuperAdmin: true, limit: 20 });
  for (const e of experts) console.log(`  ${e.name || e.email} — ${e.topic} · ${e.projectName ? e.projectName + " project" : e.departmentName} (${Number(e.score).toFixed(2)})`);

  console.log(`\nView it live: log in as ${ADMIN_EMAIL}, open the Experts page, and search "${topic.name}".`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
