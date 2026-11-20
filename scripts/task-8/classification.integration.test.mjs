import test from "node:test";
import assert from "node:assert/strict";
import { classifyDocument, detectDocumentDuplicates } from "../../worker/classify.js";

const RUN_DB_TESTS = process.env.TASK8_INTEGRATION_DB === "1";

function fakeOpenAI({ category = "Policies", categoryConfidence = 0.96, suggestedDepartmentId = null, departmentConfidence = 0.91 } = {}) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                category,
                categoryConfidence,
                suggestedDepartmentId,
                departmentConfidence,
                reason: "Task 8 integration test",
              }),
            },
          }],
        }),
      },
    },
  };
}

test("classifyDocument and duplicate detection persist readable Task 8 rows", { skip: !RUN_DB_TESTS }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let user;
  let org;
  let department;
  let original;
  let candidate;

  try {
    user = await prisma.user.create({ data: { email: `task8-${suffix}@example.test`, name: "Task 8 Test" } });
    org = await prisma.organization.create({ data: { name: `Task 8 Org ${suffix}` } });
    department = await prisma.department.create({ data: { orgId: org.id, name: `Operations ${suffix}` } });
    await prisma.organizationMember.create({ data: { orgId: org.id, userId: user.id, role: "super_admin" } });
    await prisma.departmentMember.create({ data: { departmentId: department.id, userId: user.id } });

    original = await prisma.document.create({
      data: {
        filename: "policy-original.txt",
        userId: user.id,
        scope: "repository",
        orgId: org.id,
        content: "Employees must complete annual security training.",
      },
    });
    candidate = await prisma.document.create({
      data: {
        filename: "policy-copy.txt",
        userId: user.id,
        scope: "repository",
        orgId: org.id,
        content: "Employees must complete annual security training.",
      },
    });

    await classifyDocument({
      prisma,
      openai: fakeOpenAI({ suggestedDepartmentId: department.id }),
      documentId: original.id,
      filename: original.filename,
      text: original.content,
      summary: "Annual security training policy.",
    });
    await classifyDocument({
      prisma,
      openai: fakeOpenAI({ suggestedDepartmentId: department.id }),
      documentId: candidate.id,
      filename: candidate.filename,
      text: candidate.content,
      summary: "Annual security training policy copy.",
    });

    const written = await prisma.document.findUnique({ where: { id: original.id } });
    assert.equal(written.category, "Policies");
    assert.equal(written.classificationStatus, "published");
    assert.equal(written.suggestedDepartmentId, department.id);
    assert.ok(written.categoryConfidence >= 0.9);
    assert.ok(written.contentHash);

    // Exact hashes are enough to exercise duplicate persistence without requiring
    // pgvector or embedding generation in this integration fixture.
    const matches = await detectDocumentDuplicates({ prisma, documentId: candidate.id });
    assert.equal(matches.length, 1);
    const duplicateRow = await prisma.documentDuplicate.findUnique({
      where: { documentId_duplicateOfId: { documentId: candidate.id, duplicateOfId: original.id } },
      include: { duplicateOf: { select: { filename: true } } },
    });
    assert.equal(duplicateRow.status, "pending");
    assert.equal(duplicateRow.similarity, 1);
    assert.equal(duplicateRow.duplicateOf.filename, "policy-original.txt");
  } finally {
    if (candidate) await prisma.document.delete({ where: { id: candidate.id } }).catch(() => {});
    if (original) await prisma.document.delete({ where: { id: original.id } }).catch(() => {});
    if (department) await prisma.department.delete({ where: { id: department.id } }).catch(() => {});
    if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    if (user) await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
