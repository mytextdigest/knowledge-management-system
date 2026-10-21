// Suggestion doc Test 3 - "Verify the anti-gaming behavior", run end-to-end
// through the real worker pipeline (SQL aggregation -> computeExpertiseScore
// -> upsert), not just the formula in isolation. Uses throwaway DB rows only
// (see expertTestHarness.mjs) - no signup, no login, no real accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { refreshTopicExpertise } from "../../worker/knowledgeContext.js";
import { makeSandbox } from "./expertTestHarness.mjs";

const enabled = process.env.RUN_TIER2_DB_TESTS === "1" && process.env.DATABASE_URL;

test("a document hoarder scores lower than a real knowledge contributor", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "anti-gaming");
  try {
    await sandbox.createOrg();
    const hoarder = await sandbox.createUser("hoarder");
    const contributor = await sandbox.createUser("contributor");
    const topic = await sandbox.createTopic("Customer Onboarding");

    // Hoarder: 20 uploads, 5 minutes of reading, nothing else.
    for (let i = 0; i < 20; i++) {
      const doc = await sandbox.createDocument({ userId: hoarder.id });
      await sandbox.linkTopicDocument(topic.id, doc.id);
    }
    const hoarderDoc = await sandbox.createDocument({ userId: hoarder.id });
    await sandbox.addInteraction({ documentId: hoarderDoc.id, userId: hoarder.id, type: "study_duration", durationSeconds: 300 });

    // Contributor: 1 lesson, 5 real questions, 30 minutes of reading, 3 citations.
    const sharedDoc = await sandbox.createDocument({ userId: contributor.id });
    await sandbox.linkTopicDocument(topic.id, sharedDoc.id);
    await sandbox.addLesson({ documentId: sharedDoc.id, authorUserId: contributor.id });
    for (let i = 0; i < 5; i++) {
      await sandbox.addDocumentQuestion({ documentId: sharedDoc.id, userId: contributor.id, content: `Question number ${i} about this section?` });
    }
    await sandbox.addInteraction({ documentId: sharedDoc.id, userId: contributor.id, type: "study_duration", durationSeconds: 1800 });
    await sandbox.addCitation({ userId: contributor.id, citedDocIds: [sharedDoc.id] });
    await sandbox.addCitation({ userId: contributor.id, citedDocIds: [sharedDoc.id] });
    await sandbox.addCitation({ userId: contributor.id, citedDocIds: [sharedDoc.id] });

    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const rows = await prisma.topicExpertise.findMany({ where: { topicId: topic.id } });
    const hoarderScore = rows.find((r) => r.userId === hoarder.id)?.score ?? 0;
    const contributorScore = rows.find((r) => r.userId === contributor.id)?.score ?? 0;

    assert.ok(contributorScore > hoarderScore, `expected contributor ${contributorScore} > hoarder ${hoarderScore}`);
    // The hoarder's uploads are capped well below the contributor's diverse signals.
    assert.ok(hoarderScore <= 2.1, `hoarder score ${hoarderScore} should stay near the uploads+dwell cap`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});
