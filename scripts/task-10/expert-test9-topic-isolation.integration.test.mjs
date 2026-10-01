// Suggestion doc Test 9 - "Topic isolation": activity on one topic must not
// change (or create) a person's expertise on an unrelated topic. Expertise
// is Person x Topic, not just Person. Throwaway DB rows only - no signup,
// no login, no real accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { refreshTopicExpertise } from "../../worker/knowledgeContext.js";
import { makeSandbox } from "./expertTestHarness.mjs";

const enabled = process.env.RUN_TIER2_DB_TESTS === "1" && process.env.DATABASE_URL;

test("heavy activity on Topic A does not create or inflate expertise on unrelated Topic B", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "topic-isolation");
  try {
    await sandbox.createOrg();
    const rahul = await sandbox.createUser("rahul");
    const topicA = await sandbox.createTopic("React");
    const topicB = await sandbox.createTopic("Financial Planning");

    // Rahul is heavily active on Topic A only.
    const reactDoc = await sandbox.createDocument({ userId: rahul.id });
    await sandbox.linkTopicDocument(topicA.id, reactDoc.id);
    await sandbox.addLesson({ documentId: reactDoc.id, authorUserId: rahul.id });
    await sandbox.addDocumentQuestion({ documentId: reactDoc.id, userId: rahul.id });

    // Topic B exists and has its own unrelated document/activity from someone else.
    const otherUser = await sandbox.createUser("finance-person");
    const financeDoc = await sandbox.createDocument({ userId: otherUser.id });
    await sandbox.linkTopicDocument(topicB.id, financeDoc.id);
    await sandbox.addLesson({ documentId: financeDoc.id, authorUserId: otherUser.id });

    await refreshTopicExpertise(topicA.id, sandbox.state.orgId);
    await refreshTopicExpertise(topicB.id, sandbox.state.orgId);

    const reactScore = await prisma.topicExpertise.findFirst({ where: { topicId: topicA.id, userId: rahul.id } });
    const financeRowForRahul = await prisma.topicExpertise.findFirst({ where: { topicId: topicB.id, userId: rahul.id } });

    assert.ok(reactScore && reactScore.score > 0, "Rahul should have a real score on the React topic");
    assert.equal(financeRowForRahul, null, "Rahul's React activity must not create any expertise row on Financial Planning");
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});
