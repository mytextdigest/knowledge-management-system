// B-10 (E24): default owners and bulk reassignment, through the real code,
// inside one rolled-back transaction.   EKP_DB_TESTS=1 npm run ekp:b:e2e
import test from "node:test";
import assert from "node:assert/strict";
import { inRolledBackTransaction, as, call } from "./route-harness/db.mjs";

const RUN = process.env.EKP_DB_TESTS === "1";
process.env.KMS_NOTIFICATION_EMAIL_ENABLED = "false";

test("default owner rules; bulk reassign moves documents, open tasks and reviews", { skip: !RUN }, async () => {
  const { defaultOwnerId } = await import("../../../src/lib/governance/defaultOwner.js");
  const bulkRoute = await import("../../../src/app/api/org/[orgId]/ownership/bulk-reassign/route.js");

  await inRolledBackTransaction(async (db) => {
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const mkOrg = (n) => db.organization.create({ data: { name: `b10-${n}-${tag}` } });
    const org = await mkOrg("a");
    const orgDeptOwner = await mkOrg("b"); // ownership.default = department_owner
    const users = {};
    for (const name of ["super", "uploader", "deptowner", "leaver", "heir", "member", "outsider"]) {
      users[name] = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
    }
    for (const o of [org, orgDeptOwner]) {
      for (const [name, role] of [["super", "super_admin"], ["uploader", "employee"], ["deptowner", "employee"], ["heir", "employee"], ["member", "employee"]]) {
        await db.organizationMember.create({ data: { orgId: o.id, userId: users[name].id, role } });
      }
    }
    const dept = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}`, defaultOwnerId: users.deptowner.id } });
    const dept2 = await db.department.create({ data: { orgId: orgDeptOwner.id, name: `Ops ${tag}`, defaultOwnerId: users.deptowner.id } });
    const deptGone = await db.department.create({ data: { orgId: org.id, name: `Gone ${tag}`, defaultOwnerId: users.outsider.id } });
    await db.orgSetting.create({ data: { orgId: orgDeptOwner.id, key: "ownership.default", value: "department_owner" } });

    // Uploads: the uploader by default; the department owner when the org says so.
    assert.equal(await defaultOwnerId(db, { orgId: org.id, departmentId: dept.id, uploaderId: users.uploader.id }), users.uploader.id);
    assert.equal(await defaultOwnerId(db, { orgId: orgDeptOwner.id, departmentId: dept2.id, uploaderId: users.uploader.id }), users.deptowner.id);
    // Connector documents: the department owner, else the connecting admin; never someone outside the org.
    assert.equal(await defaultOwnerId(db, { orgId: org.id, departmentId: dept.id, uploaderId: users.super.id, sourceProvider: "sharepoint" }), users.deptowner.id);
    assert.equal(await defaultOwnerId(db, { orgId: org.id, departmentId: deptGone.id, uploaderId: users.super.id, sourceProvider: "servicenow" }), users.super.id);
    assert.equal(await defaultOwnerId(db, { orgId: org.id, departmentId: null, uploaderId: users.uploader.id, sourceProvider: "sharepoint" }), users.uploader.id);

    // The leaver owns 2 documents and has open work on them, then leaves the org.
    const doc = (name) => db.document.create({ data: {
      filename: `${name}.pdf`, userId: users.uploader.id, ownerId: users.leaver.id, orgId: org.id,
      scope: "repository", departmentId: dept.id, lifecycle: "in_review", status: "ready",
    } });
    const d1 = await doc("d1");
    const d2 = await doc("d2");
    const wf = await db.workflowDefinition.create({ data: { orgId: org.id, name: "P", kind: "publish",
      stages: { create: [{ position: 1, name: "Review", approverUserId: users.leaver.id }] } } });
    const stageId = (await db.workflowStage.findFirst({ where: { definitionId: wf.id } })).id;
    const i1 = await db.workflowInstance.create({ data: { orgId: org.id, documentId: d1.id, definitionId: wf.id, submittedById: users.uploader.id,
      tasks: { create: { stageId, assigneeId: users.leaver.id } } } });
    // The heir submitted this one, so moving its task to the heir would be self-approval: it stays.
    await db.workflowInstance.create({ data: { orgId: org.id, documentId: d2.id, definitionId: wf.id, submittedById: users.heir.id,
      tasks: { create: { stageId, assigneeId: users.leaver.id } } } });
    const policy = await db.reviewPolicy.create({ data: { orgId: org.id, name: "Annual", intervalDays: 365 } });
    await db.reviewRecord.create({ data: { orgId: org.id, documentId: d2.id, policyId: policy.id, reviewerId: users.leaver.id, dueAt: new Date() } });

    // Only admins reassign.
    as(users.member.email);
    let r = await call(bulkRoute.POST, { method: "POST", params: { orgId: org.id }, body: { fromUserId: users.leaver.id, toUserId: users.heir.id } });
    assert.equal(r.status, 403);

    // A departed owner is a valid source.
    as(users.super.email);
    r = await call(bulkRoute.POST, { method: "POST", params: { orgId: org.id }, body: { fromUserId: users.leaver.id, toUserId: users.heir.id } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reassigned, 2);
    assert.equal(r.body.tasksMoved, 1);
    assert.equal(r.body.tasksLeft, 1, "never assigns a reviewer their own submission");
    assert.equal(r.body.reviewsMoved, 1);
    assert.equal((await db.document.count({ where: { ownerId: users.heir.id } })), 2);
    assert.equal((await db.workflowTask.findFirst({ where: { instanceId: i1.id } })).assigneeId, users.heir.id);
    assert.equal(await db.reviewRecord.count({ where: { reviewerId: users.heir.id, status: "pending" } }), 1);
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, action: "document.owner_changed" } }), 2);
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, action: "workflow.reassigned" } }), 1);
    assert.equal(await db.notification.count({ where: { userId: users.heir.id, type: "ownership.assigned" } }), 1);
  });
});
