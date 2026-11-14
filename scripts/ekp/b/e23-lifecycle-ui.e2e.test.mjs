// E23/E19 document-page actions through the real routes, in a rolled-back
// transaction: Recently deleted (list by role, restore), supersede candidates
// and permission, and the AI-summary status on the document response.
//   EKP_DB_TESTS=1 npm run ekp:b:e2e
import test from "node:test";
import assert from "node:assert/strict";
import { inRolledBackTransaction, as, call } from "./route-harness/db.mjs";

const RUN = process.env.EKP_DB_TESTS === "1";

test("recently deleted, restore, supersede picker, AI summary status", { skip: !RUN }, async () => {
  const deletedRoute = await import("../../../src/app/api/org/[orgId]/deleted-documents/route.js");
  const documentRoute = await import("../../../src/app/api/documents/[id]/route.js");
  const restoreRoute = await import("../../../src/app/api/documents/[id]/restore/route.js");
  const supersedeRoute = await import("../../../src/app/api/documents/[id]/supersede/route.js");
  const { summaryHash } = await import("../../../src/lib/governance/summaryReview.mjs");

  await inRolledBackTransaction(async (db) => {
    const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const org = await db.organization.create({ data: { name: `e23-${tag}` } });
    const eng = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
    const fin = await db.department.create({ data: { orgId: org.id, name: `Fin ${tag}` } });
    const users = {};
    for (const [name, role, dept, deptRole] of [
      ["super", "super_admin", null, null], ["engAdmin", "dept_admin", eng, "admin"],
      ["author", "employee", eng, "member"], ["other", "employee", eng, "member"],
    ]) {
      users[name] = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
      await db.organizationMember.create({ data: { orgId: org.id, userId: users[name].id, role } });
      if (dept) await db.departmentMember.create({ data: { departmentId: dept.id, userId: users[name].id, role: deptRole } });
    }
    const doc = (name, dept, extra = {}) => db.document.create({ data: {
      filename: `${name}.pdf`, userId: users.author.id, ownerId: users.author.id, orgId: org.id, scope: "repository",
      departmentId: dept.id, lifecycle: "published", status: "ready", visibility: "org", ...extra,
    } });
    const listAs = async (user) => { as(user.email); return (await call(deletedRoute.GET, { params: { orgId: org.id } })).body.items.map((d) => d.filename).sort(); };

    const engDoc = await doc("eng-a", eng);
    const finDoc = await doc("fin-a", fin, { userId: users.super.id, ownerId: users.super.id });
    // Delete through the real route: the uploader may delete their own document.
    as(users.author.email);
    let r = await call(documentRoute.DELETE, { method: "DELETE", params: { id: engDoc.id } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    as(users.super.email);
    assert.equal((await call(documentRoute.DELETE, { method: "DELETE", params: { id: finDoc.id } })).status, 200);

    // Recently deleted: super admin sees both, the Engineering admin and the uploader only Engineering's, others nothing.
    assert.deepEqual(await listAs(users.super), ["eng-a.pdf", "fin-a.pdf"]);
    assert.deepEqual(await listAs(users.engAdmin), ["eng-a.pdf"]);
    assert.deepEqual(await listAs(users.author), ["eng-a.pdf"]);
    assert.deepEqual(await listAs(users.other), []);
    as(users.super.email);
    const row = (await call(deletedRoute.GET, { params: { orgId: org.id } })).body.items.find((d) => d.filename === "eng-a.pdf");
    assert.equal(row.deletedBy.email, users.author.email);
    assert.ok(row.purgeAfter, "default retention sets a purge date");

    // Restore: not by a plain member, yes by the department admin.
    as(users.other.email);
    assert.equal((await call(restoreRoute.POST, { method: "POST", params: { id: engDoc.id } })).status, 403);
    as(users.engAdmin.email);
    assert.equal((await call(restoreRoute.POST, { method: "POST", params: { id: engDoc.id } })).status, 200);
    assert.deepEqual(await listAs(users.engAdmin), []);

    // Supersede picker: same department, published, not superseded, not itself; admins only.
    const v2 = await doc("eng-a-v2", eng);
    await doc("eng-draft", eng, { lifecycle: "draft" });
    await doc("fin-b", fin);
    as(users.author.email);
    let page = (await call(documentRoute.GET, { params: { id: engDoc.id } })).body;
    assert.equal(page.permissions.canSupersede, false, "the uploader isn't a department admin");
    assert.equal((await call(supersedeRoute.GET, { params: { id: engDoc.id } })).status, 403);
    as(users.engAdmin.email);
    page = (await call(documentRoute.GET, { params: { id: engDoc.id } })).body;
    assert.equal(page.permissions.canSupersede, true);
    r = await call(supersedeRoute.GET, { params: { id: engDoc.id } });
    assert.deepEqual(r.body.items.map((d) => d.filename), ["eng-a-v2.pdf"]);
    r = await call(supersedeRoute.POST, { method: "POST", params: { id: engDoc.id }, body: { successorDocumentId: v2.id } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await db.document.findUnique({ where: { id: engDoc.id } })).supersededById, v2.id);

    // AI summary status: pending until the current text is approved.
    const summary = JSON.stringify({ overview: "Torque values for the turbine.", keyPoints: [] });
    const s1 = await doc("summarised", eng, { summary });
    as(users.other.email);
    assert.equal((await call(documentRoute.GET, { params: { id: s1.id } })).body.summaryStatus, "pending");
    await db.documentSummaryReview.create({ data: { documentId: s1.id, orgId: org.id, status: "approved", summaryHash: summaryHash(summary), reviewedById: users.engAdmin.id } });
    page = (await call(documentRoute.GET, { params: { id: s1.id } })).body;
    assert.equal(page.summaryStatus, "approved");
    assert.equal(page.summaryReview, undefined, "raw review row isn't exposed");
  });
});
