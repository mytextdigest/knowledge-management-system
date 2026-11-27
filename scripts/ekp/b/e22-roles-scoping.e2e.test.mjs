// E22.2/E22.3 end to end through the real route handlers, inside one
// rolled-back transaction: role-based stage approvers (department admins of
// the document's department, owner, stewards) with any/all, and workflows
// scoped to departments/categories.   EKP_DB_TESTS=1 npm run ekp:b:e2e
import test from "node:test";
import assert from "node:assert/strict";
import { inRolledBackTransaction, as, call } from "./route-harness/db.mjs";

const RUN = process.env.EKP_DB_TESTS === "1";
process.env.KMS_NOTIFICATION_EMAIL_ENABLED = "false";

test("role approvers, any/all and department/category scoping", { skip: !RUN }, async () => {
  const workflowsRoute = await import("../../../src/app/api/org/[orgId]/workflows/route.js");
  const definitionRoute = await import("../../../src/app/api/org/[orgId]/workflows/[definitionId]/route.js");
  const workflowRoute = await import("../../../src/app/api/documents/[id]/workflow/route.js");
  const decisionRoute = await import("../../../src/app/api/org/[orgId]/workflow-tasks/[taskId]/decision/route.js");
  const lifecycleRoute = await import("../../../src/app/api/documents/[id]/lifecycle/route.js");

  await inRolledBackTransaction(async (db) => {
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const org = await db.organization.create({ data: { name: `e22-${tag}` } });
    const eng = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
    const fin = await db.department.create({ data: { orgId: org.id, name: `Fin ${tag}` } });
    const users = {};
    for (const [name, role, dept, deptRole] of [
      ["super", "super_admin", null, null], ["author", "employee", eng, "member"], ["finauthor", "employee", fin, "member"],
      ["engA", "dept_admin", eng, "admin"], ["engB", "dept_admin", eng, "admin"], ["finA", "dept_admin", fin, "admin"],
      ["owner", "employee", eng, "member"], ["steward", "employee", eng, "member"],
    ]) {
      const u = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
      await db.organizationMember.create({ data: { orgId: org.id, userId: u.id, role } });
      if (dept) await db.departmentMember.create({ data: { departmentId: dept.id, userId: u.id, role: deptRole } });
      users[name] = u;
    }
    const doc = (name, dept, extra = {}) => db.document.create({ data: {
      filename: `${name}.pdf`, userId: users.author.id, ownerId: users.author.id, orgId: org.id, scope: "repository",
      departmentId: dept.id, category: "SOPs", lifecycle: "draft", status: "ready", summary: "A summary.", ...extra,
    } });
    const lifecycleOf = async (id) => (await db.document.findUnique({ where: { id }, select: { lifecycle: true } })).lifecycle;
    const tasksOf = (documentId, status = "pending") => db.workflowTask.findMany({ where: { status, instance: { documentId } }, orderBy: { assigneeId: "asc" } });
    const assignees = async (documentId) => (await tasksOf(documentId)).map((t) => t.assigneeId).sort();
    const submit = (user, documentId, body = {}) => { as(user.email); return call(workflowRoute.POST, { method: "POST", params: { id: documentId }, body }); };
    const decide = async (user, documentId, action, comment) => {
      const task = (await tasksOf(documentId)).find((t) => t.assigneeId === user.id);
      as(user.email);
      return call(decisionRoute.POST, { method: "POST", params: { orgId: org.id, taskId: task.id }, body: { action, comment } });
    };
    const create = (body) => { as(users.super.email); return call(workflowsRoute.POST, { method: "POST", params: { orgId: org.id }, body }); };
    const sorted = (...us) => us.map((u) => u.id).sort();

    // The "Department admin approval" template: org-wide, one dept_admin stage, any one of them.
    let r = await create({ name: "Department admin approval", kind: "publish", stages: [{ name: "Department admin review", approverType: "dept_admin", approvalMode: "any" }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const orgWide = r.body;
    assert.equal(orgWide.stages[0].approverUserId, null);

    // An Engineering document goes to both Engineering admins, a Finance one only to the Finance admin.
    const e1 = await doc("e1", eng);
    assert.equal((await submit(users.author, e1.id)).status, 201);
    assert.deepEqual(await assignees(e1.id), sorted(users.engA, users.engB));
    assert.equal(await db.notification.count({ where: { userId: { in: [users.engA.id, users.engB.id] }, type: "workflow.task_assigned" } }), 2);
    const f1 = await doc("f1", fin, { userId: users.finauthor.id, ownerId: users.finauthor.id });
    assert.equal((await submit(users.finauthor, f1.id)).status, 201);
    assert.deepEqual(await assignees(f1.id), [users.finA.id]);

    // "any": the first approval settles the stage; the other admin's task is cancelled.
    r = await decide(users.engB, e1.id, "approve");
    assert.equal(r.status, 200);
    assert.equal(r.body.published, true);
    assert.equal(await lifecycleOf(e1.id), "published");
    assert.deepEqual((await tasksOf(e1.id, "cancelled")).map((t) => t.assigneeId), [users.engA.id]);

    // A department admin submitting their own document: only the other admin reviews it.
    const e2 = await doc("e2", eng, { userId: users.engA.id, ownerId: users.engA.id });
    assert.equal((await submit(users.engA, e2.id)).status, 201);
    assert.deepEqual(await assignees(e2.id), [users.engB.id]);

    // Scoping: only departments of this org; an Engineering-only workflow where all admins must approve.
    assert.equal((await create({ name: "x", stages: [{ name: "s", approverType: "owner" }], departmentIds: ["nope"] })).status, 400);
    r = await create({ name: "Engineering sign-off", departmentIds: [eng.id], stages: [{ name: "Both admins", approverType: "dept_admin", approvalMode: "all" }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const engOnly = r.body;

    // The more specific workflow wins for Engineering; Finance still gets the org-wide one.
    const e3 = await doc("e3", eng);
    as(users.author.email);
    const listed = await call(workflowRoute.GET, { params: { id: e3.id } });
    assert.deepEqual(listed.body.definitions.filter((d) => d.kind === "publish").map((d) => d.id), [engOnly.id]);
    assert.equal((await submit(users.author, e3.id, { definitionId: orgWide.id })).status, 400, "can't pick a less specific workflow");
    assert.equal((await submit(users.author, e3.id)).status, 201);
    const e3Instance = await db.workflowInstance.findFirst({ where: { documentId: e3.id } });
    assert.equal(e3Instance.definitionId, engOnly.id);

    // "all": one approval waits for the other; both approve -> published.
    r = await decide(users.engA, e3.id, "approve");
    assert.equal(r.status, 200);
    assert.equal(r.body.waitingForOthers, true);
    assert.equal(await lifecycleOf(e3.id), "in_review");
    assert.deepEqual(await assignees(e3.id), [users.engB.id]);
    r = await decide(users.engB, e3.id, "approve");
    assert.equal(r.body.published, true);
    assert.equal(await lifecycleOf(e3.id), "published");

    // "all": a request for changes from anyone ends it, cancelling the rest.
    const e4 = await doc("e4", eng);
    await submit(users.author, e4.id);
    assert.equal((await decide(users.engA, e4.id, "request_changes", "Add the torque table.")).status, 200);
    assert.equal(await lifecycleOf(e4.id), "draft");
    assert.deepEqual(await assignees(e4.id), []);

    // Owner and steward stages, resolved from the document.
    const ownerWf = await create({ name: "Owner then stewards", departmentIds: [eng.id], categories: ["Policies"], stages: [
      { name: "Owner", approverType: "owner" }, { name: "Stewards", approverType: "steward" },
    ] });
    assert.equal(ownerWf.status, 201, JSON.stringify(ownerWf.body));
    const p1 = await doc("p1", eng, { category: "Policies", ownerId: users.owner.id });
    await db.documentSteward.create({ data: { documentId: p1.id, userId: users.steward.id } });
    assert.equal((await submit(users.author, p1.id)).status, 201);
    assert.deepEqual(await assignees(p1.id), [users.owner.id], "department + category beats department-only");
    await decide(users.owner, p1.id, "approve");
    assert.deepEqual(await assignees(p1.id), [users.steward.id]);
    assert.equal((await decide(users.steward, p1.id, "approve")).body.published, true);

    // Owner stage where the owner submits: falls back to a department admin.
    const p2 = await doc("p2", eng, { category: "Policies" });
    await submit(users.author, p2.id);
    assert.equal((await assignees(p2.id)).length, 1);
    assert.ok([users.engA.id, users.engB.id].includes((await assignees(p2.id))[0]));

    // The direct-publish block follows coverage: re-scope the org-wide workflow to Engineering
    // only and Finance drafts can be published directly again.
    as(users.super.email);
    assert.equal((await call(definitionRoute.PATCH, { method: "PATCH", params: { orgId: org.id, definitionId: orgWide.id }, body: { departmentIds: ["nope"] } })).status, 400);
    r = await call(definitionRoute.PATCH, { method: "PATCH", params: { orgId: org.id, definitionId: orgWide.id }, body: { departmentIds: [eng.id] } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const f2 = await doc("f2", fin);
    const e5 = await doc("e5", eng);
    as(users.super.email);
    assert.equal((await call(lifecycleRoute.PATCH, { method: "PATCH", params: { id: e5.id }, body: { lifecycle: "published" } })).status, 409);
    r = await call(lifecycleRoute.PATCH, { method: "PATCH", params: { id: f2.id }, body: { lifecycle: "published" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, action: "workflow.definition_changed", entityId: orgWide.id } }), 2);

    // Uploads: start as drafts only where an active publish workflow covers them.
    const { initialUploadLifecycle } = await import("../../../src/lib/workflows/publishFlow.js");
    const upload = (departmentId, category, scope = "repository") => initialUploadLifecycle(db, { orgId: org.id, scope, departmentId, category });
    assert.equal(await upload(eng.id, "SOPs"), "draft");
    assert.equal(await upload(fin.id, "SOPs"), "published");
    assert.equal(await upload(eng.id, "SOPs", "project"), "published");
    as(users.super.email);
    for (const d of [orgWide, engOnly, ownerWf.body]) {
      await call(definitionRoute.PATCH, { method: "PATCH", params: { orgId: org.id, definitionId: d.id }, body: { active: false } });
    }
    assert.equal(await upload(eng.id, "SOPs"), "published", "no active workflow: published at once, as before E22");
  });
});
