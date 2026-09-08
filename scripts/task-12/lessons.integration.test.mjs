import test from "node:test";
import assert from "node:assert/strict";
import { getLessonEvidence, isLessonQuestion } from "../../src/lib/lessonsIntelligence.js";
import { canEditLesson } from "../../src/lib/lessonAccess.js";
import { isRetrospectiveShaped } from "../../worker/summarize.js";

const RUN_DB_TESTS = process.env.TASK12_INTEGRATION_DB === "1";

// Closes Task 12-G (RBAC Verification): a real DB-backed test, not a
// source-pattern assertion, seeding cross-department data and proving a
// low-privilege user gets zero results for a lesson they have no access to —
// the same standard REQUIREMENTS_EXPERT_DISCOVERY.md's FR-5 calls for on
// Rank 9's equivalent gap (Task 9-G).
test("getLessonEvidence enforces RBAC and published-only visibility", { skip: !RUN_DB_TESTS }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let org, department, member, admin, outsider, project, publishedLesson, draftLesson;

  try {
    org = await prisma.organization.create({ data: { name: `Task 12 Org ${suffix}` } });
    department = await prisma.department.create({ data: { orgId: org.id, name: `Dept ${suffix}` } });

    member = await prisma.user.create({ data: { email: `task12-member-${suffix}@example.test`, name: "Member" } });
    admin = await prisma.user.create({ data: { email: `task12-admin-${suffix}@example.test`, name: "Admin" } });
    outsider = await prisma.user.create({ data: { email: `task12-outsider-${suffix}@example.test`, name: "Outsider" } });

    await prisma.organizationMember.create({ data: { orgId: org.id, userId: member.id, role: "member" } });
    await prisma.organizationMember.create({ data: { orgId: org.id, userId: admin.id, role: "dept_admin" } });
    await prisma.organizationMember.create({ data: { orgId: org.id, userId: outsider.id, role: "member" } });

    await prisma.departmentMember.create({ data: { departmentId: department.id, userId: member.id, role: "member" } });
    await prisma.departmentMember.create({ data: { departmentId: department.id, userId: admin.id, role: "admin" } });
    // outsider is an org member but NOT a member of `department` — this is
    // the exact leakage scenario Rank 8's own RBAC bug hit (isOrgAdmin vs
    // isSuperAdmin): outsider must get zero results, not "any org member".

    project = await prisma.project.create({
      data: { name: `Project ${suffix}`, orgId: org.id, departmentId: department.id, userId: member.id },
    });

    const keyword = `zephyrflux${suffix.replace(/[^a-z0-9]/gi, "")}`;

    publishedLesson = await prisma.lesson.create({
      data: {
        orgId: org.id,
        departmentId: department.id,
        projectId: project.id,
        authorUserId: member.id,
        whatHappened: `The ${keyword} rollout was delayed by two weeks.`,
        whatWorked: "Early stakeholder sign-off.",
        whatDidntWork: "Underestimated integration testing time.",
        recommendation: "Budget 2x testing time for integrations.",
        status: "published",
        source: "manual",
      },
    });

    draftLesson = await prisma.lesson.create({
      data: {
        orgId: org.id,
        departmentId: department.id,
        authorUserId: member.id,
        whatHappened: `Draft note about ${keyword} that should never leak.`,
        status: "draft",
        source: "manual",
      },
    });

    const question = `What did we learn about ${keyword}?`;
    assert.equal(isLessonQuestion(question), true);
    assert.equal(isLessonQuestion("What is the weather today?"), false);

    // Department member: sees the published lesson.
    const memberResults = await getLessonEvidence({ question, orgId: org.id, userId: member.id, isSuperAdmin: false });
    assert.equal(memberResults.length, 1);
    assert.equal(memberResults[0].id, publishedLesson.id);

    // RBAC-critical: an org member with NO department membership must get
    // zero results, never the published lesson — this is the assertion this
    // test exists to make (Task 12-G).
    const outsiderResults = await getLessonEvidence({ question, orgId: org.id, userId: outsider.id, isSuperAdmin: false });
    assert.equal(outsiderResults.length, 0);

    // super_admin bypasses department scoping entirely, same as every other
    // RBAC-scoped query in this codebase.
    const superAdminResults = await getLessonEvidence({ question, orgId: org.id, userId: outsider.id, isSuperAdmin: true });
    assert.equal(superAdminResults.length, 1);

    // The draft lesson must never surface as chat grounding, even to its own
    // author or a super_admin — only `published` lessons are eligible (FR-6).
    const draftKeywordQuestion = `Tell me lessons learned about draft note ${keyword}`;
    const authorDraftResults = await getLessonEvidence({
      question: draftKeywordQuestion,
      orgId: org.id,
      userId: member.id,
      isSuperAdmin: false,
    });
    assert.ok(!authorDraftResults.some((r) => r.id === draftLesson.id));

    // canEditLesson: author, project owner, and department admin can edit;
    // a regular non-author department member cannot.
    assert.equal(await canEditLesson({ lesson: publishedLesson, userId: member.id, role: "member" }), true);
    assert.equal(
      await canEditLesson({ lesson: publishedLesson, userId: admin.id, role: "dept_admin" }),
      true
    );
    const randomMember = await prisma.user.create({ data: { email: `task12-random-${suffix}@example.test`, name: "Random" } });
    await prisma.organizationMember.create({ data: { orgId: org.id, userId: randomMember.id, role: "member" } });
    await prisma.departmentMember.create({ data: { departmentId: department.id, userId: randomMember.id, role: "member" } });
    assert.equal(
      await canEditLesson({ lesson: publishedLesson, userId: randomMember.id, role: "member" }),
      false
    );
    await prisma.departmentMember.delete({ where: { departmentId_userId: { departmentId: department.id, userId: randomMember.id } } });
    await prisma.organizationMember.delete({ where: { orgId_userId: { orgId: org.id, userId: randomMember.id } } });
    await prisma.user.delete({ where: { id: randomMember.id } });

    // isRetrospectiveShaped: cheap pre-filter, checked on filename/first summary.
    assert.equal(isRetrospectiveShaped("Q1-Project-Retrospective.docx", ["Team debrief"]), true);
    assert.equal(isRetrospectiveShaped("vendor-invoice.pdf", ["Invoice for services rendered"]), false);
  } finally {
    if (publishedLesson) await prisma.lesson.delete({ where: { id: publishedLesson.id } }).catch(() => {});
    if (draftLesson) await prisma.lesson.delete({ where: { id: draftLesson.id } }).catch(() => {});
    if (project) await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
    if (department) await prisma.department.delete({ where: { id: department.id } }).catch(() => {});
    if (member) await prisma.user.delete({ where: { id: member.id } }).catch(() => {});
    if (admin) await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
    if (outsider) await prisma.user.delete({ where: { id: outsider.id } }).catch(() => {});
    if (org) await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
