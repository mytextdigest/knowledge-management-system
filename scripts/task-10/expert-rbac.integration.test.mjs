import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { getAccessibleExpertsWithPrisma } from "../../src/lib/expertDiscoveryQuery.mjs";

const enabled = process.env.RUN_TIER2_DB_TESTS === "1" && process.env.DATABASE_URL;

test("Expert Discovery RBAC blocks cross-department expertise, including a shared topic", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ids = {};
  try {
    const org = await prisma.organization.create({ data: { name: `tier2-rbac-${suffix}` } });
    ids.orgId = org.id;

    const viewer = await prisma.user.create({ data: { email: `viewer-${suffix}@example.test`, name: "Viewer" } });
    const hiddenExpert = await prisma.user.create({ data: { email: `hidden-${suffix}@example.test`, name: "Hidden Expert" } });
    const visibleExpert = await prisma.user.create({ data: { email: `visible-${suffix}@example.test`, name: "Visible Expert" } });
    ids.userIds = [viewer.id, hiddenExpert.id, visibleExpert.id];

    await prisma.organizationMember.createMany({ data: [
      { orgId: org.id, userId: viewer.id, role: "employee" },
      { orgId: org.id, userId: hiddenExpert.id, role: "employee" },
      { orgId: org.id, userId: visibleExpert.id, role: "employee" },
    ] });

    const deptA = await prisma.department.create({ data: { orgId: org.id, name: `A-${suffix}` } });
    const deptB = await prisma.department.create({ data: { orgId: org.id, name: `B-${suffix}` } });
    await prisma.departmentMember.createMany({ data: [
      { departmentId: deptA.id, userId: viewer.id, role: "member" },
      { departmentId: deptA.id, userId: visibleExpert.id, role: "member" },
      { departmentId: deptB.id, userId: hiddenExpert.id, role: "member" },
    ] });

    const [visibleDoc, hiddenDoc] = await Promise.all([
      prisma.document.create({ data: {
        filename: `visible-${suffix}.txt`, content: "shared topic visible material", userId: visibleExpert.id,
        orgId: org.id, departmentId: deptA.id, scope: "repository", lifecycle: "published",
      } }),
      prisma.document.create({ data: {
        filename: `hidden-${suffix}.txt`, content: "shared topic restricted material", userId: hiddenExpert.id,
        orgId: org.id, departmentId: deptB.id, scope: "repository", lifecycle: "published",
      } }),
    ]);

    // Both departments contribute to the same repository topic. This is the
    // important leak case: access to dept A's document must not reveal the
    // hidden expert association created only by dept B activity.
    const topic = await prisma.topic.create({
      data: { orgId: org.id, scope: "repository", name: `Shared Topic ${suffix}` },
    });
    await prisma.topicDocument.createMany({ data: [
      { topicId: topic.id, documentId: visibleDoc.id, confidence: 1 },
      { topicId: topic.id, documentId: hiddenDoc.id, confidence: 1 },
    ] });
    await prisma.topicExpertise.createMany({ data: [
      { topicId: topic.id, userId: visibleExpert.id, score: 2, source: "inferred", lastSignalAt: new Date() },
      { topicId: topic.id, userId: hiddenExpert.id, score: 4, source: "inferred", lastSignalAt: new Date() },
    ] });

    const results = await getAccessibleExpertsWithPrisma(prisma, {
      orgId: org.id,
      userId: viewer.id,
      query: "Shared Topic",
      isSuperAdmin: false,
      limit: 20,
    });

    assert.equal(results.some((row) => row.id === hiddenExpert.id), false, "hidden department expert leaked");
    assert.equal(results.some((row) => row.id === visibleExpert.id), true, "accessible department expert missing");
  } finally {
    if (ids.orgId) await prisma.organization.delete({ where: { id: ids.orgId } }).catch(() => {});
    for (const id of ids.userIds || []) await prisma.user.delete({ where: { id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
