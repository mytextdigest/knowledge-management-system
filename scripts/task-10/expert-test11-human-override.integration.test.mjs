// Suggestion doc Test 11 - "Human override tests": self-confirm, self-dismiss,
// admin-confirmation, and "new activity after confirmation" must all survive
// a background refresh. Confirmation/dismissal is simulated with a direct
// TopicExpertise update (the same effect the confirm/dismiss API endpoint
// has) rather than going through auth/session - these tests are about the
// worker's protection logic, not the API route. Throwaway DB rows only - no
// signup, no login, no real accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { refreshTopicExpertise } from "../../worker/knowledgeContext.js";
import { makeSandbox } from "./expertTestHarness.mjs";

const enabled = process.env.RUN_TIER2_DB_TESTS === "1" && process.env.DATABASE_URL;

test("self-confirm survives a refresh, and the score can still rise from new activity", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "override-self-confirm");
  try {
    await sandbox.createOrg();
    const user = await sandbox.createUser("rahul");
    const topic = await sandbox.createTopic("Payments");
    const doc1 = await sandbox.createDocument({ userId: user.id });
    await sandbox.linkTopicDocument(topic.id, doc1.id);
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const before = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    assert.equal(before.source, "inferred");
    await prisma.topicExpertise.update({ where: { id: before.id }, data: { source: "self_confirmed" } });

    // New activity: two more uploads push uploads to the 1.5 cap (was 0.5).
    const doc2 = await sandbox.createDocument({ userId: user.id });
    await sandbox.linkTopicDocument(topic.id, doc2.id);
    const doc3 = await sandbox.createDocument({ userId: user.id });
    await sandbox.linkTopicDocument(topic.id, doc3.id);
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const after = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    assert.equal(after.source, "self_confirmed", "confirmation must survive the refresh");
    assert.ok(after.score > before.score, `score should rise with new activity: before ${before.score}, after ${after.score}`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("self-dismiss survives a refresh and freezes the score, even with a lot of new activity", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "override-dismiss");
  try {
    await sandbox.createOrg();
    const user = await sandbox.createUser("dismissed-user");
    const topic = await sandbox.createTopic("Onboarding");
    const doc = await sandbox.createDocument({ userId: user.id });
    await sandbox.linkTopicDocument(topic.id, doc.id);
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const before = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    await prisma.topicExpertise.update({ where: { id: before.id }, data: { source: "dismissed" } });

    // A lot of new, high-value activity that would otherwise push the score way up.
    await sandbox.addLesson({ documentId: doc.id, authorUserId: user.id });
    await sandbox.addLesson({ documentId: doc.id, authorUserId: user.id });
    await sandbox.addDocumentQuestion({ documentId: doc.id, userId: user.id });
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const after = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    assert.equal(after.source, "dismissed", "dismissal must survive the refresh");
    assert.equal(after.score, before.score, "a dismissed listing's score must not move at all, even with major new activity");
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("admin-confirmation survives a refresh independently of algorithmic recalculation", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "override-admin-confirm");
  try {
    await sandbox.createOrg();
    const user = await sandbox.createUser("admin-designated-sme");
    const topic = await sandbox.createTopic("Security Review");
    const doc = await sandbox.createDocument({ userId: user.id });
    await sandbox.linkTopicDocument(topic.id, doc.id);
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const before = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    await prisma.topicExpertise.update({ where: { id: before.id }, data: { source: "admin_confirmed" } });

    await sandbox.addInteraction({ documentId: doc.id, userId: user.id, type: "view" });
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const after = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    assert.equal(after.source, "admin_confirmed", "admin confirmation must survive the refresh");
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("a confirmed listing's score never decreases even if its underlying signals shrink", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "override-never-decreases");
  try {
    await sandbox.createOrg();
    const user = await sandbox.createUser("shrinking-signals-user");
    const topic = await sandbox.createTopic("Architecture Reviews");
    const doc = await sandbox.createDocument({ userId: user.id });
    await sandbox.linkTopicDocument(topic.id, doc.id);
    const lesson1 = await sandbox.addLesson({ documentId: doc.id, authorUserId: user.id });
    await sandbox.addLesson({ documentId: doc.id, authorUserId: user.id });
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const before = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    assert.ok(before.score >= 3.9, `expected the 2-lesson cap (~4.0) before confirming, got ${before.score}`);
    await prisma.topicExpertise.update({ where: { id: before.id }, data: { source: "admin_confirmed" } });

    // One of the two lessons is removed (e.g. unpublished) - the raw signal shrinks.
    await prisma.lesson.delete({ where: { id: lesson1.id } });
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);

    const after = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: user.id } });
    assert.equal(after.source, "admin_confirmed");
    assert.ok(after.score >= before.score, `score must never drop for a confirmed listing: before ${before.score}, after ${after.score}`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});
