// EKP B-10 (E24): give every document without an owner its accountable owner,
// using the same rules as new documents (src/lib/governance/defaultOwner.js):
// connector documents -> department default owner, else the connecting admin;
// uploads -> the uploader (or the department default owner when the org's
// ownership.default is "department_owner"). Each change is audited
// (document.owner_changed, actor null = system).
//
//   node --env-file=.env scripts/ekp/b/backfill-document-owners.mjs            # dry run: prints the plan
//   node --env-file=.env scripts/ekp/b/backfill-document-owners.mjs --apply    # writes it
//
// Idempotent: only documents with ownerId null are touched.
import { PrismaClient } from "@prisma/client";
import { defaultOwnerId } from "../../../src/lib/governance/defaultOwner.js";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

try {
  const docs = await prisma.document.findMany({
    where: { ownerId: null },
    select: { id: true, orgId: true, departmentId: true, userId: true, sourceProvider: true, scope: true, filename: true },
    orderBy: { createdAt: "asc" },
  });
  const plan = [];
  for (const doc of docs) {
    const ownerId = await defaultOwnerId(prisma, {
      orgId: doc.orgId, departmentId: doc.departmentId, uploaderId: doc.userId, sourceProvider: doc.sourceProvider,
    });
    if (ownerId) plan.push({ ...doc, ownerId });
  }

  const byRule = {};
  for (const p of plan) {
    const rule = p.ownerId === p.userId ? "uploader / connecting admin" : "department default owner";
    byRule[rule] = (byRule[rule] || 0) + 1;
  }
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN", withoutOwner: docs.length, toAssign: plan.length,
    byRule, byScope: plan.reduce((m, p) => ({ ...m, [p.scope]: (m[p.scope] || 0) + 1 }), {}),
  }, null, 2));

  if (apply) {
    let updated = 0;
    for (const p of plan) {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.document.updateMany({ where: { id: p.id, ownerId: null }, data: { ownerId: p.ownerId } });
        if (changed.count !== 1) return;
        updated++;
        if (p.orgId) await tx.auditLog.create({ data: {
          orgId: p.orgId, actorUserId: null, action: "document.owner_changed",
          entityType: "document", entityId: p.id,
          before: { ownerId: null }, after: { ownerId: p.ownerId }, metadata: { reason: "b10_backfill" },
        } });
      });
    }
    console.log(`Updated ${updated} document(s).`);
  }
} finally {
  await prisma.$disconnect();
}
