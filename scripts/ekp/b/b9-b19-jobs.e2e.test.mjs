// B-9/B-24 purge job and B-19 stale scan, through the real job code inside
// one rolled-back transaction (S3 is stubbed).   EKP_DB_TESTS=1 npm run ekp:b:e2e
import test from "node:test";
import assert from "node:assert/strict";
import { inRolledBackTransaction, as, call, client } from "./route-harness/db.mjs";

const RUN = process.env.EKP_DB_TESTS === "1";
process.env.KMS_NOTIFICATION_EMAIL_ENABLED = "false";
const DAY = 86400000;
const now = new Date();
const ago = (days) => new Date(now.getTime() - days * DAY);

async function fixtures(db, label) {
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const org = await db.organization.create({ data: { name: `${label}-${tag}` } });
  const dept = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
  const users = {};
  for (const [name, role] of [["super", "super_admin"], ["owner", "employee"], ["reader", "employee"]]) {
    users[name] = await db.user.create({ data: { email: `${name}-${tag}@contoso.test`, emailVerified: true } });
    await db.organizationMember.create({ data: { orgId: org.id, userId: users[name].id, role } });
  }
  const doc = (name, extra = {}) => db.document.create({ data: {
    filename: `${name}.pdf`, userId: users.owner.id, ownerId: users.owner.id, orgId: org.id,
    scope: "repository", departmentId: dept.id, lifecycle: "published", status: "ready", ...extra,
  } });
  return { org, dept, users, doc };
}

test("purge job: expired deletions only, files and dependents removed, successor and S3 failures kept, never-purge honoured", { skip: !RUN }, async () => {
  const { purgeDeletedDocuments } = await import("../../../src/lib/lifecycle/purgeDeleted.js");
  const deleteRoute = await import("../../../src/app/api/documents/[id]/route.js");
  const restoreRoute = await import("../../../src/app/api/documents/[id]/restore/route.js");

  await inRolledBackTransaction(async (db) => {
    const { org, users, doc } = await fixtures(db, "b9");
    const deleted = (name, extra) => doc(name, { deletedAt: ago(40), purgeAfter: ago(10), ...extra });

    const expired = await deleted("expired", { filePath: "orgs/x/current.pdf" });
    await db.documentVersion.create({ data: { documentId: expired.id, versionNumber: 1, filePath: "orgs/x/v1.pdf" } });
    await db.chunk.create({ data: { documentId: expired.id, chunkIndex: 0, text: "t" } });
    const conv = await db.conversation.create({ data: { userId: users.owner.id, documentId: expired.id } });
    await db.message.create({ data: { conversationId: conv.id, role: "user", content: "q" } });

    const notYet = await doc("not-yet", { deletedAt: ago(5), purgeAfter: new Date(now.getTime() + 25 * DAY) });
    const successor = await deleted("successor");
    await doc("live-old", { supersededById: successor.id }); // purging the successor would un-supersede this
    const s3Fails = await deleted("s3-fails", { filePath: "orgs/x/locked.pdf" });

    const removed = [];
    const deleteObject = async (key) => { if (key.includes("locked")) throw new Error("AccessDenied"); removed.push(key); };
    const result = await purgeDeletedDocuments({ db: client, orgId: org.id, now, deleteObject, adjustTopic: async () => {} });

    assert.equal(result.purged, 1, JSON.stringify(result));
    assert.equal(result.blocked, 1);
    assert.equal(result.failed, 1);
    assert.deepEqual(removed.sort(), ["orgs/x/current.pdf", "orgs/x/v1.pdf"]);
    assert.equal(await db.document.count({ where: { id: expired.id } }), 0);
    assert.equal(await db.chunk.count({ where: { documentId: expired.id } }), 0);
    assert.equal(await db.conversation.count({ where: { id: conv.id } }), 0);
    assert.equal(await db.documentVersion.count({ where: { documentId: expired.id } }), 0);
    for (const kept of [notYet, successor, s3Fails]) assert.equal(await db.document.count({ where: { id: kept.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { orgId: org.id, action: "document.purged", entityId: expired.id } }), 1);

    // Never purge (B-24): nothing is removed, even past an old deadline; restore still works.
    const { org: keepOrg, users: keepUsers, doc: keepDoc } = await fixtures(db, "b24");
    await db.orgSetting.create({ data: { orgId: keepOrg.id, key: "retention.deletedDays", value: null } });
    const old = await keepDoc("old", { deletedAt: ago(400), purgeAfter: ago(370) });
    const none = await purgeDeletedDocuments({ db: client, orgId: keepOrg.id, now, deleteObject, adjustTopic: async () => {} });
    assert.equal(none.purged, 0);
    assert.match(none.skipped, /never purge/);
    assert.equal(await db.document.count({ where: { id: old.id } }), 1);
    as(keepUsers.super.email);
    assert.equal((await call(restoreRoute.POST, { method: "POST", params: { id: old.id } })).status, 200);

    // Deleting with never-purge leaves no deadline; a pending review is cancelled so it can't block a later purge.
    const fresh = await keepDoc("fresh");
    const policy = await db.reviewPolicy.create({ data: { orgId: keepOrg.id, name: "Annual", intervalDays: 365 } });
    await db.reviewRecord.create({ data: { orgId: keepOrg.id, documentId: fresh.id, policyId: policy.id, reviewerId: keepUsers.owner.id, dueAt: now } });
    as(keepUsers.super.email);
    const del = await call(deleteRoute.DELETE, { method: "DELETE", params: { id: fresh.id } });
    assert.equal(del.status, 200, JSON.stringify(del.body));
    assert.equal(del.body.purgeAfter, null);
    assert.equal(await db.reviewRecord.count({ where: { documentId: fresh.id, status: "pending" } }), 0);
  });
});

test("stale scan: rules from settings, views and citations count as use, one review per document, owner notified", { skip: !RUN }, async () => {
  const { scanStaleContent } = await import("../../../src/lib/governance/staleScan.js");

  await inRolledBackTransaction(async (db) => {
    const { org, users, doc } = await fixtures(db, "b19");
    await db.orgSetting.create({ data: { orgId: org.id, key: "stale.rules", value: { noUpdateDays: 365, noViewDays: 90 } } });
    const policy = await db.reviewPolicy.create({ data: { orgId: org.id, name: "Stale review", intervalDays: 365, reviewerType: "steward" } });

    const unused = await doc("unused", { createdAt: ago(200) });                      // no view for 200 days
    const viewed = await doc("viewed", { createdAt: ago(200) });
    await db.documentInteraction.create({ data: { documentId: viewed.id, userId: users.reader.id, orgId: org.id, type: "view", createdAt: ago(10) } });
    const cited = await doc("cited", { createdAt: ago(200) });
    await db.chatAuditLog.create({ data: { orgId: org.id, userId: users.reader.id, question: "q", citedDocIds: [cited.id], createdAt: ago(20) } });
    const oldContent = await doc("old-content", { createdAt: ago(500) });            // viewed recently, but not updated in 500 days
    await db.documentInteraction.create({ data: { documentId: oldContent.id, userId: users.reader.id, orgId: org.id, type: "view", createdAt: ago(1) } });
    const replaced = await doc("replaced", { createdAt: ago(500) });                 // a new version 30 days ago counts as an update
    await db.documentVersion.create({ data: { documentId: replaced.id, versionNumber: 1, createdAt: ago(30) } });
    await db.documentInteraction.create({ data: { documentId: replaced.id, userId: users.reader.id, orgId: org.id, type: "view", createdAt: ago(1) } });
    const young = await doc("young", { createdAt: ago(30) });
    const draft = await doc("draft", { createdAt: ago(400), lifecycle: "draft" });

    const first = await scanStaleContent({ db: client, orgId: org.id, now });
    const flaggedIds = (await db.document.findMany({ where: { orgId: org.id, lifecycleSuggestion: "archived" }, select: { id: true } })).map((d) => d.id).sort();
    assert.deepEqual(flaggedIds, [unused.id, oldContent.id].sort(), JSON.stringify(first));
    const reason = (await db.document.findUnique({ where: { id: oldContent.id } })).lifecycleSuggestionReason;
    assert.match(reason, /Not updated for at least 365 days/);
    for (const d of [viewed, cited, replaced, young, draft]) {
      assert.equal((await db.document.findUnique({ where: { id: d.id } })).lifecycleSuggestion, null);
    }
    // Steward policy, no stewards -> the owner reviews. Exactly one open review each.
    assert.equal(await db.reviewRecord.count({ where: { orgId: org.id, status: "pending", reviewerId: users.owner.id, policyId: policy.id } }), 2);
    assert.equal(await db.notification.count({ where: { userId: users.owner.id, type: "content.stale" } }), 2);

    // A second run adds nothing (already flagged; one review per document).
    const second = await scanStaleContent({ db: client, orgId: org.id, now });
    assert.equal(second.flagged, 0);
    assert.equal(await db.reviewRecord.count({ where: { orgId: org.id, status: "pending" } }), 2);

    // Both rules off: nothing is scanned.
    await db.orgSetting.update({ where: { orgId_key: { orgId: org.id, key: "stale.rules" } }, data: { value: { noUpdateDays: 0, noViewDays: 0 } } });
    const off = await scanStaleContent({ db: client, orgId: org.id, now, rules: { noUpdateDays: 0, noViewDays: 0 } });
    assert.match(off.skipped, /off/);
  });
});
