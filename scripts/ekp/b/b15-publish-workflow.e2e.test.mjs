// B-15/B-16/B-17 (E22, E23.6) end to end through the real route handlers,
// inside one rolled-back transaction (nothing is written to the database).
//   EKP_DB_TESTS=1 npm run ekp:b:e2e
import test from "node:test";
import assert from "node:assert/strict";
import { inRolledBackTransaction, as, call } from "./route-harness/db.mjs";

const RUN = process.env.EKP_DB_TESTS === "1";
process.env.KMS_NOTIFICATION_EMAIL_ENABLED = "false"; // in-app rows only, never email

test("publishing workflow: submit, stages, self-approval fallback, reject, publish, withdraw, decommission, confirm", { skip: !RUN }, async () => {
  const workflowRoute = await import("../../../src/app/api/documents/[id]/workflow/route.js");
  const decisionRoute = await import("../../../src/app/api/org/[orgId]/workflow-tasks/[taskId]/decision/route.js");
  const lifecycleRoute = await import("../../../src/app/api/documents/[id]/lifecycle/route.js");
  const confirmRoute = await import("../../../src/app/api/org/[orgId]/needs-review/[docId]/confirm/route.js");
  const { canViewDocument, repositoryAccessWhere } = await import("../../../src/lib/access/documentAccess.js");

  await inRolledBackTransaction(async (db) => {
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const org = await db.organization.create({ data: { name: `b15-${tag}` } });
    const dept = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
    const users = {};
    for (const [name, role, deptRole] of [
      ["super", "super_admin", null], ["author", "employee", "member"], ["rev1", "employee", "member"],
      ["deptadmin", "dept_admin", "admin"], ["member", "employee", "member"],
    ]) {
      const u = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
      await db.organizationMember.create({ data: { orgId: org.id, userId: u.id, role } });
      if (deptRole) await db.departmentMember.create({ data: { departmentId: dept.id, userId: u.id, role: deptRole } });
      users[name] = u;
    }
    const doc = (name, extra = {}) => db.document.create({ data: {
      filename: `${name}.pdf`, userId: users.author.id, ownerId: users.author.id, orgId: org.id,
      scope: "repository", departmentId: dept.id, lifecycle: "draft", status: "ready", summary: "A summary.", ...extra,
    } });
    const lifecycleOf = async (id) => (await db.document.findUnique({ where: { id }, select: { lifecycle: true } })).lifecycle;
    const pendingTask = async (documentId) => db.workflowTask.findFirst({ where: { status: "pending", instance: { documentId } } });
    const decideAs = (user, task, action, comment) => { as(user.email); return call(decisionRoute.POST, { method: "POST", params: { orgId: org.id, taskId: task.id }, body: { action, comment } }); };

    // Two stages; stage 2's approver is the author, so it must fall back to the department admin.
    const publishWf = await db.workflowDefinition.create({ data: {
      orgId: org.id, name: "Publish", kind: "publish",
      stages: { create: [
        { position: 1, name: "Peer review", approverUserId: users.rev1.id },
        { position: 2, name: "Sign-off", approverUserId: users.author.id },
      ] },
    } });

    const d1 = await doc("d1");

    // Direct publish is refused while a publish workflow is active, even for a super admin.
    as(users.super.email);
    let r = await call(lifecycleRoute.PATCH, { method: "PATCH", params: { id: d1.id }, body: { lifecycle: "published" } });
    assert.equal(r.status, 409, "direct publish blocked");

    // Only the uploader/owner (or a super admin) submits; others can't see the workflow.
    as(users.member.email);
    assert.equal((await call(workflowRoute.POST, { method: "POST", params: { id: d1.id }, body: {} })).status, 403);
    assert.equal((await call(workflowRoute.GET, { params: { id: d1.id } })).status, 403);

    // Submit: draft -> in_review, stage 1 task for rev1, rev1 notified.
    as(users.author.email);
    r = await call(workflowRoute.POST, { method: "POST", params: { id: d1.id }, body: {} });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(await lifecycleOf(d1.id), "in_review");
    let task = await pendingTask(d1.id);
    assert.equal(task.assigneeId, users.rev1.id);
    assert.equal(await db.notification.count({ where: { userId: users.rev1.id, type: "workflow.task_assigned" } }), 1);
    assert.equal((await call(workflowRoute.POST, { method: "POST", params: { id: d1.id }, body: {} })).status, 409, "one running workflow per document");

    // in_review is hidden like a draft: not for members, yes for the assigned reviewer and the dept admin.
    const docRow = await db.document.findUnique({ where: { id: d1.id }, include: { project: true } });
    assert.equal(await canViewDocument(docRow, { userId: users.member.id, role: "employee", db }), false);
    assert.equal(await canViewDocument(docRow, { userId: users.rev1.id, role: "employee", db }), true);
    assert.equal(await canViewDocument(docRow, { userId: users.deptadmin.id, role: "dept_admin", db }), true);
    const memberRepo = await db.document.findMany({ where: repositoryAccessWhere({ orgId: org.id, role: "employee", userId: users.member.id, userDeptIds: [dept.id] }), select: { id: true } });
    assert.ok(!memberRepo.some((d) => d.id === d1.id), "repository listing hides in_review from members");
    as(users.super.email);
    assert.equal((await call(lifecycleRoute.PATCH, { method: "PATCH", params: { id: d1.id }, body: { lifecycle: "published" } })).status, 400, "no manual transition out of in_review");

    // Stage 1 approve -> stage 2 goes to the dept admin (never the submitter).
    assert.equal((await decideAs(users.author, task, "approve")).status, 403, "submitter can't act on someone else's task");
    assert.equal((await decideAs(users.rev1, task, "approve")).status, 200);
    task = await pendingTask(d1.id);
    assert.equal(task.assigneeId, users.deptadmin.id, "self-approval fallback to department admin");
    assert.equal(await lifecycleOf(d1.id), "in_review");

    // Request changes needs a comment, then returns the document to draft and notifies the submitter.
    assert.equal((await decideAs(users.deptadmin, task, "request_changes")).status, 400);
    assert.equal((await decideAs(users.deptadmin, task, "request_changes", "Add the revision table.")).status, 200);
    assert.equal(await lifecycleOf(d1.id), "draft");
    assert.equal(await db.notification.count({ where: { userId: users.author.id, type: "workflow.decided" } }), 1);

    // Resubmit and approve both stages -> published, audited.
    as(users.author.email);
    assert.equal((await call(workflowRoute.POST, { method: "POST", params: { id: d1.id }, body: { definitionId: publishWf.id } })).status, 201);
    assert.equal((await decideAs(users.rev1, await pendingTask(d1.id), "approve")).status, 200);
    r = await decideAs(users.deptadmin, await pendingTask(d1.id), "approve");
    assert.equal(r.status, 200);
    assert.equal(r.body.published, true);
    assert.equal(await lifecycleOf(d1.id), "published");
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, entityId: d1.id, action: "document.published" } }), 1);
    as(users.author.email);
    r = await call(workflowRoute.GET, { params: { id: d1.id } });
    assert.equal(r.body.items.length, 2, "timeline shows both runs");
    assert.equal(r.body.items[0].status, "approved");
    assert.equal(r.body.items[1].decisions.find((d) => d.action === "request_changes").comment, "Add the revision table.");

    // Reject also returns to draft.
    const d2 = await doc("d2");
    as(users.author.email);
    await call(workflowRoute.POST, { method: "POST", params: { id: d2.id }, body: {} });
    assert.equal((await decideAs(users.rev1, await pendingTask(d2.id), "reject", "Out of scope.")).status, 200);
    assert.equal(await lifecycleOf(d2.id), "draft");

    // Withdraw by the submitter: back to draft, tasks cancelled. Others can't withdraw.
    as(users.author.email);
    await call(workflowRoute.POST, { method: "POST", params: { id: d2.id }, body: {} });
    as(users.rev1.email);
    assert.equal((await call(workflowRoute.DELETE, { method: "DELETE", params: { id: d2.id } })).status, 403);
    as(users.author.email);
    assert.equal((await call(workflowRoute.DELETE, { method: "DELETE", params: { id: d2.id } })).status, 200);
    assert.equal(await lifecycleOf(d2.id), "draft");
    assert.equal(await pendingTask(d2.id), null);

    // Needs-Review confirm runs the same path: the draft goes to in_review, the confirming admin is the submitter.
    const d3 = await doc("d3", { classificationStatus: "needs_review", userId: users.super.id, ownerId: users.super.id });
    as(users.super.email);
    r = await call(confirmRoute.POST, { method: "POST", params: { orgId: org.id, docId: d3.id }, body: {} });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await lifecycleOf(d3.id), "in_review");
    const d3Instance = await db.workflowInstance.findFirst({ where: { documentId: d3.id } });
    assert.equal(d3Instance.submittedById, users.super.id);

    // Decommission (E23.6): submit works (B-17 bug) and the approval archives the document.
    const decommissionWf = await db.workflowDefinition.create({ data: {
      orgId: org.id, name: "Retire", kind: "decommission",
      stages: { create: [{ position: 1, name: "KM review", approverUserId: users.rev1.id }] },
    } });
    as(users.author.email);
    r = await call(workflowRoute.POST, { method: "POST", params: { id: d1.id }, body: { definitionId: decommissionWf.id, targetLifecycle: "archived" } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(await lifecycleOf(d1.id), "published", "stays published until approved");
    assert.equal((await decideAs(users.rev1, await pendingTask(d1.id), "approve")).status, 200);
    assert.equal(await lifecycleOf(d1.id), "archived");

    // With no publish workflow active, direct publish works exactly as before E22.
    await db.workflowDefinition.update({ where: { id: publishWf.id }, data: { active: false } });
    const d4 = await doc("d4");
    as(users.super.email);
    r = await call(lifecycleRoute.PATCH, { method: "PATCH", params: { id: d4.id }, body: { lifecycle: "published" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await lifecycleOf(d4.id), "published");
  });
});
