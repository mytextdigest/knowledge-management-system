// Suggestion doc Test 6 - "False-positive testing": scenarios A-D, checking
// who KMS should NOT treat as an expert. There's no score-bucket/"Not an
// Expert" label in the real system (see Part D of the test tracker), so
// these assert against the real ceiling each weak signal structurally can't
// exceed, rather than against a classification that doesn't exist.
// Throwaway DB rows only - no signup, no login, no real accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { refreshTopicExpertise } from "../../worker/knowledgeContext.js";
import { makeSandbox } from "./expertTestHarness.mjs";

const enabled = process.env.RUN_TIER2_DB_TESTS === "1" && process.env.DATABASE_URL;

test("Scenario A - upload spam alone stays capped low", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "false-pos-a");
  try {
    await sandbox.createOrg();
    const spammer = await sandbox.createUser("spammer");
    const topic = await sandbox.createTopic("Upload Spam Topic");
    for (let i = 0; i < 50; i++) {
      const doc = await sandbox.createDocument({ userId: spammer.id });
      await sandbox.linkTopicDocument(topic.id, doc.id);
    }
    await refreshTopicExpertise(topic.id, sandbox.state.orgId);
    const row = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: spammer.id } });
    assert.ok(row.score <= 1.51, `50 uploads with nothing else should stay near the uploads cap, got ${row.score}`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("Scenario B - department membership alone stays capped very low", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "false-pos-b");
  try {
    await sandbox.createOrg();
    const bystander = await sandbox.createUser("bystander");
    const uploader = await sandbox.createUser("uploader");
    const dept = await sandbox.createDepartment("Ops");
    await sandbox.addDeptMember(dept.id, bystander.id);
    const topic = await sandbox.createTopic("Department Only Topic");
    const doc = await sandbox.createDocument({ userId: uploader.id, departmentId: dept.id });
    await sandbox.linkTopicDocument(topic.id, doc.id);

    await refreshTopicExpertise(topic.id, sandbox.state.orgId);
    const row = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: bystander.id } });
    assert.ok(row.score <= 0.51, `department overlap alone should stay near its 0.5 cap, got ${row.score}`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("Scenario C - reading-only cannot reach the diverse-signal territory a real contributor reaches", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "false-pos-c");
  try {
    await sandbox.createOrg();
    const reader = await sandbox.createUser("reader");
    const topic = await sandbox.createTopic("Reading Only Topic");
    const doc = await sandbox.createDocument({ userId: reader.id });
    await sandbox.linkTopicDocument(topic.id, doc.id);
    await sandbox.addInteraction({ documentId: doc.id, userId: reader.id, type: "study_duration", durationSeconds: 1200 });
    await sandbox.addInteraction({ documentId: doc.id, userId: reader.id, type: "view" });

    await refreshTopicExpertise(topic.id, sandbox.state.orgId);
    const row = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: reader.id } });
    // interactions (cap 1.5) + dwell (cap 3.0) = 4.5, well under the 15.5 theoretical max -
    // reading alone structurally cannot look like a diversified expert profile.
    assert.ok(row.score <= 4.51, `reading-only should stay under the interactions+dwell combined cap, got ${row.score}`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("Scenario D - a historically active but now-stale contributor is substantially reduced", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "false-pos-d");
  try {
    await sandbox.createOrg();
    const oldExpert = await sandbox.createUser("old-expert");
    const topic = await sandbox.createTopic("Old Expert Topic");
    const longAgo = new Date(Date.now() - 400 * 86400000);
    const doc = await sandbox.createDocument({ userId: oldExpert.id, createdAt: longAgo });
    await sandbox.linkTopicDocument(topic.id, doc.id, longAgo);
    await sandbox.addLesson({ documentId: doc.id, authorUserId: oldExpert.id, createdAt: longAgo });
    await sandbox.addLesson({ documentId: doc.id, authorUserId: oldExpert.id, createdAt: longAgo });

    await refreshTopicExpertise(topic.id, sandbox.state.orgId);
    const row = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: oldExpert.id } });
    // Raw score is the 4.0 lessonsAuthored cap; 400 days of decay should crush it.
    assert.ok(row.score < 0.5, `400-day-stale contributor should be heavily decayed, got ${row.score}`);
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});

test("Scenario E - a single lesson is a moderate signal, not an automatic top score", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "false-pos-e");
  try {
    await sandbox.createOrg();
    const oneOff = await sandbox.createUser("one-off");
    const uploader = await sandbox.createUser("someone-else");
    const topic = await sandbox.createTopic("One Off Topic");
    // Uploaded by someone else, so oneOff's only signal is the lesson itself
    // (not an extra uploads credit for owning the document).
    const doc = await sandbox.createDocument({ userId: uploader.id });
    await sandbox.linkTopicDocument(topic.id, doc.id);
    await sandbox.addLesson({ documentId: doc.id, authorUserId: oneOff.id });

    await refreshTopicExpertise(topic.id, sandbox.state.orgId);
    const row = await prisma.topicExpertise.findFirst({ where: { topicId: topic.id, userId: oneOff.id } });
    assert.ok(row.score > 0 && row.score <= 2.1, `one lesson should land near the single-lesson value (2.0), got ${row.score}`);
    assert.ok(row.score < 15.5 * 0.5, "one lesson alone should be far from the theoretical max");
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});
