// Suggestion doc Test 10 - "Cross-topic contamination": someone extremely
// active in one department's topic should not become an expert in an
// unrelated department's topic just by being generally active in KMS. The
// only legitimate cross-over is the small, explicit department-overlap
// signal, and only when the topic's own document actually belongs to a
// department the person is in. Throwaway DB rows only - no signup, no
// login, no real accounts.
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { refreshTopicExpertise } from "../../worker/knowledgeContext.js";
import { makeSandbox } from "./expertTestHarness.mjs";

const enabled = process.env.RUN_TIER2_DB_TESTS === "1" && process.env.DATABASE_URL;

test("a heavily active Finance employee is not an expert in unrelated Software Architecture", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const sandbox = makeSandbox(prisma, "cross-contamination");
  try {
    await sandbox.createOrg();
    const financeEmployee = await sandbox.createUser("finance-employee");
    const financeDept = await sandbox.createDepartment("Finance");
    const marketingDept = await sandbox.createDepartment("Marketing");
    // Also a member of an unrelated second department, to prove membership
    // *anywhere* isn't enough - only overlap with the topic's own document matters.
    await sandbox.addDeptMember(financeDept.id, financeEmployee.id);
    await sandbox.addDeptMember(marketingDept.id, financeEmployee.id);

    const financeTopic = await sandbox.createTopic("Finance Reporting");
    for (let i = 0; i < 100; i++) {
      const doc = await sandbox.createDocument({ userId: financeEmployee.id, departmentId: financeDept.id });
      await sandbox.linkTopicDocument(financeTopic.id, doc.id);
    }

    const swDept = await sandbox.createDepartment("Software Architecture Dept");
    const swArchitect = await sandbox.createUser("sw-architect");
    const swTopic = await sandbox.createTopic("Software Architecture");
    const swDoc = await sandbox.createDocument({ userId: swArchitect.id, departmentId: swDept.id });
    await sandbox.linkTopicDocument(swTopic.id, swDoc.id);

    await refreshTopicExpertise(financeTopic.id, sandbox.state.orgId);
    await refreshTopicExpertise(swTopic.id, sandbox.state.orgId);

    const financeRow = await prisma.topicExpertise.findFirst({ where: { topicId: financeTopic.id, userId: financeEmployee.id } });
    const leakRow = await prisma.topicExpertise.findFirst({ where: { topicId: swTopic.id, userId: financeEmployee.id } });

    assert.ok(financeRow && financeRow.score > 0, "the Finance employee should have real expertise on the Finance topic");
    assert.equal(leakRow, null, "general KMS activity elsewhere must not leak into the unrelated Software Architecture topic");
  } finally {
    await sandbox.cleanup();
    await prisma.$disconnect();
  }
});
