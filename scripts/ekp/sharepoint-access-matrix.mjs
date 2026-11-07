// Dev tool (WS-A testing): which SharePoint documents and pages each member
// of an org can see in KMS right now, computed with the real F1 access SQL
// and each user's current Entra groups (read from Graph). Read-only: writes
// nothing to KMS or SharePoint.
//   node --import ./scripts/task-12/register-alias-hook.mjs scripts/ekp/sharepoint-access-matrix.mjs --org <orgId>
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { searchAccessSql, repositoryAccessWhere } from "../../src/lib/access/documentAccess.js";
import { getCachedAppOnlyToken, getUserGroupIds } from "../../src/lib/msGraph.js";
import { getCachedGroups, setCachedGroups } from "../../src/lib/identity/groupCache.js";

const orgId = process.argv[process.argv.indexOf("--org") + 1];
if (!orgId || orgId.startsWith("--")) {
  console.error("Usage: ... sharepoint-access-matrix.mjs --org <orgId>");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const integration = await prisma.orgIntegration.findUnique({ where: { orgId_provider: { orgId, provider: "sharepoint" } } });
  const tenantId = integration?.scopeConfig?.tenantId;
  const accessToken = tenantId ? await getCachedAppOnlyToken(tenantId) : null;

  const docs = await prisma.document.findMany({
    where: { orgId, sourceProvider: "sharepoint" },
    select: { id: true, filename: true, lifecycle: true, contentType: true, aclSyncedAt: true, filePath: true, externalUrl: true, _count: { select: { acl: true } } },
    orderBy: [{ contentType: "asc" }, { filename: "asc" }],
  });
  console.log(`\nSharePoint documents in KMS (${docs.length}):`);
  for (const d of docs) {
    console.log(
      `  ${d.contentType === "page" ? "page" : "file"}  ${d.filename}  [${d.lifecycle}]` +
        `  permissions: ${d.aclSyncedAt ? `${d._count.acl} rows` : "not read"}` +
        `  copy in KMS: ${d.filePath ? "yes" : "no"}  link: ${d.externalUrl ? "yes" : "no"}`
    );
  }

  const members = await prisma.organizationMember.findMany({
    where: { orgId },
    select: { role: true, user: { select: { id: true, email: true, identities: { where: { tenantId }, select: { source: true, externalId: true } } } } },
  });
  console.log("\nWho sees what (search, chat and repository rule; published documents only for non-admins):");
  for (const { role, user } of members) {
    const identity = user.identities[0];
    let groups = "—";
    if (identity && accessToken) {
      const g = (await getUserGroupIds({ accessToken, userId: identity.externalId })) || { groupIds: [], ownedGroupIds: [] };
      setCachedGroups(user.id, g);
      groups = `${g.groupIds.length} groups, owns ${g.ownedGroupIds.length}`;
    }
    const rows = await prisma.$queryRaw`
      SELECT d.id FROM "Document" d
      WHERE d."orgId" = ${orgId} AND d.source_provider = 'sharepoint'
        AND ${searchAccessSql({ userId: user.id, orgId, isSuperAdmin: role === "super_admin" })}`;
    const memberships = await prisma.departmentMember.findMany({ where: { userId: user.id }, select: { departmentId: true, role: true } });
    const repo = await prisma.document.findMany({
      where: {
        sourceProvider: "sharepoint",
        ...repositoryAccessWhere({
          orgId,
          role,
          userDeptIds: memberships.map((m) => m.departmentId),
          adminDeptIds: memberships.filter((m) => m.role === "admin").map((m) => m.departmentId),
          principals: {
            userIds: identity ? [identity.externalId] : [],
            tenantIds: identity ? [tenantId] : [],
            ...getCachedGroups(user.id),
          },
        }),
      },
      select: { id: true },
    });
    const seen = new Set(rows.map((r) => r.id));
    const names = docs.filter((d) => seen.has(d.id)).map((d) => d.filename);
    const mismatch = repo.length !== rows.length && role !== "super_admin" ? `  (repository rule: ${repo.length})` : "";
    console.log(`\n  ${user.email}  [${role}]  Microsoft: ${identity ? identity.source : "not linked"}, ${groups}`);
    console.log(`    ${names.length ? names.join("\n    ") : "(none)"}${mismatch}`);
  }
} finally {
  await prisma.$disconnect();
}
