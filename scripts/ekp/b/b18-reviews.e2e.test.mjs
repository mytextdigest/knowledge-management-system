// B-18 (E25): review policies, the periodic review scan, the reviewer's inbox
// and the three outcomes, through the real routes and job code inside one
// rolled-back transaction.   EKP_DB_TESTS=1 npm run ekp:b:e2e
import test from "node:test";
import assert from "node:assert/strict";
import { inRolledBackTransaction, as, call, client } from "./route-harness/db.mjs";

const RUN = process.env.EKP_DB_TESTS === "1";
process.env.KMS_NOTIFICATION_EMAIL_ENABLED = "false";
const DAY = 86400000;
const now = new Date();
const ago = (d) => new Date(now.getTime() - d * DAY);

test("review policies, scan, inbox and outcomes", { skip: !RUN }, async () => {
  const policiesRoute = await import("../../../src/app/api/org/[orgId]/review-policies/route.js");
  const policyRoute = await import("../../../src/app/api/org/[orgId]/review-policies/[policyId]/route.js");
  const reviewsRoute = await import("../../../src/app/api/org/[orgId]/reviews/route.js");
  const outcomeRoute = await import("../../../src/app/api/org/[orgId]/reviews/[reviewId]/outcome/route.js");
  const { scanDueReviews } = await import("../../../src/lib/governance/reviewScan.js");
  const countsRoute = await import("../../../src/app/api/org/[orgId]/task-counts/route.js");

  await inRolledBackTransaction(async (db) => {
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const org = await db.organization.create({ data: { name: `b18-${tag}` } });
    const eng = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
    const fin = await db.department.create({ data: { orgId: org.id, name: `Fin ${tag}` } });
    const otherOrgDept = await db.department.create({ data: { orgId: (await db.organization.create({ data: { name: `x-${tag}` } })).id, name: "X" } });
    const users = {};
    for (const [name, role] of [["super", "super_admin"], ["owner", "employee"], ["other", "employee"], ["deptadmin", "dept_admin"]]) {
      users[name] = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
      await db.organizationMember.create({ data: { orgId: org.id, userId: users[name].id, role } });
    }
    const doc = (name, departmentId, extra = {}) => db.document.create({ data: {
      filename: `${name}.pdf`, userId: users.owner.id, ownerId: users.owner.id, orgId: org.id, scope: "repository",
      departmentId, lifecycle: "published", status: "ready", createdAt: ago(400), ...extra,
    } });
    const engDoc = await doc("eng", eng.id);
    const engDoc2 = await doc("eng2", eng.id);
    const engDoc3 = await doc("eng3", eng.id);
    const finDoc = await doc("fin", fin.id);

    // Only super admins create policies; departments must belong to the org.
    const policyBody = { name: "Engineering annual", intervalDays: 365, reviewerType: "owner", escalateAfterDays: 7, departmentIds: [eng.id], categories: [] };
    as(users.deptadmin.email);
    assert.equal((await call(policiesRoute.POST, { method: "POST", params: { orgId: org.id }, body: policyBody })).status, 403);
    as(users.super.email);
    assert.equal((await call(policiesRoute.POST, { method: "POST", params: { orgId: org.id }, body: { ...policyBody, departmentIds: [otherOrgDept.id] } })).status, 400);
    const created = await call(policiesRoute.POST, { method: "POST", params: { orgId: org.id }, body: policyBody });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const policyId = created.body.id;

    // Turned off: the scan creates nothing.
    assert.equal((await call(policyRoute.PATCH, { method: "PATCH", params: { orgId: org.id, policyId }, body: { active: false } })).status, 200);
    assert.equal((await scanDueReviews({ db: client, orgId: org.id, now })).created, 0);
    // Back on: only the Engineering documents (scoped policy) get a review, for their owner.
    assert.equal((await call(policyRoute.PATCH, { method: "PATCH", params: { orgId: org.id, policyId }, body: { active: true, intervalDays: 180 } })).status, 200);
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, action: "review.policy_changed", entityId: policyId } }), 3);
    const scan = await scanDueReviews({ db: client, orgId: org.id, now });
    assert.equal(scan.created, 3, JSON.stringify(scan));
    assert.equal(await db.reviewRecord.count({ where: { documentId: finDoc.id } }), 0);
    assert.equal((await scanDueReviews({ db: client, orgId: org.id, now })).created, 0, "never a second open review");

    // Sidebar badges: the owner has 3 reviews waiting; Needs Review counts are for super admins only.
    as(users.owner.email);
    const counts = (await call(countsRoute.GET, { params: { orgId: org.id } })).body;
    assert.deepEqual(counts, { approvals: 0, reviews: 3, needsReview: 0 });

    // Inbox: mine=1 shows only the caller's reviews, even for an admin; documentId narrows to one.
    as(users.owner.email);
    let r = await call(reviewsRoute.GET, { params: { orgId: org.id } });
    assert.equal(r.body.items.length, 3);
    as(users.super.email);
    assert.equal((await call(reviewsRoute.GET, { params: { orgId: org.id } })).body.items.length, 3, "admins see all by default");
    // (the harness Request URL has no query, so mine/documentId are checked with a direct request below)
    const get = (email, query) => { as(email); return reviewsRoute.GET(new Request(`http://localhost/x?${query}`), { params: Promise.resolve({ orgId: org.id }) }).then((res) => res.json()); };
    assert.equal((await get(users.super.email, "mine=1")).items.length, 0);
    const one = await get(users.owner.email, `mine=1&documentId=${engDoc.id}`);
    assert.equal(one.items.length, 1);
    const reviewId = one.items[0].id;

    // Outcomes: only the reviewer (or a super admin); a reason is required except for "still valid".
    as(users.other.email);
    assert.equal((await call(outcomeRoute.POST, { method: "POST", params: { orgId: org.id, reviewId }, body: { outcome: "valid" } })).status, 403);
    as(users.owner.email);
    assert.equal((await call(outcomeRoute.POST, { method: "POST", params: { orgId: org.id, reviewId }, body: { outcome: "update" } })).status, 400);
    assert.equal((await call(outcomeRoute.POST, { method: "POST", params: { orgId: org.id, reviewId }, body: { outcome: "valid" } })).status, 200);
    const valid = await db.document.findUnique({ where: { id: engDoc.id } });
    assert.ok(valid.lastReviewedAt && valid.nextReviewAt > now, "still valid sets the next review date");

    const [rUpdate] = (await get(users.owner.email, `mine=1&documentId=${engDoc2.id}`)).items;
    as(users.owner.email);
    assert.equal((await call(outcomeRoute.POST, { method: "POST", params: { orgId: org.id, reviewId: rUpdate.id }, body: { outcome: "update", note: "Section 3 is out of date." } })).status, 200);
    assert.equal((await db.document.findUnique({ where: { id: engDoc2.id } })).lifecycle, "draft", "needs update returns the document to draft");

    const [rRetire] = (await get(users.owner.email, `mine=1&documentId=${engDoc3.id}`)).items;
    as(users.owner.email);
    assert.equal((await call(outcomeRoute.POST, { method: "POST", params: { orgId: org.id, reviewId: rRetire.id }, body: { outcome: "retire", note: "Replaced by the new SOP." } })).status, 200);
    assert.equal((await db.document.findUnique({ where: { id: engDoc3.id } })).lifecycle, "published", "retire only recommends; a decommission workflow decides");
    assert.equal(await db.reviewRecord.count({ where: { orgId: org.id, status: "pending" } }), 0);
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, action: "review.completed" } }), 3);
  });
});
