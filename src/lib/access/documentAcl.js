// F1 / A-10: the per-file permission clause (WS_A_M365_CONNECTORS.md §3.2).
//
// A document whose source permissions are known (aclSyncedAt set, e.g. a
// SharePoint file) is visible only if one of its DocumentAcl rows matches the
// user: their Entra object id, their tenant, a group they're in, or a group
// they own. The user's identities and groups are stored on UserIdentity
// (src/lib/identity/entraIdentity.js), so this is plain SQL. A document with
// aclSyncedAt null (manual uploads) is unaffected. super_admin skips it.
//
// It narrows the existing role/department/lifecycle rules, never widens
// them. Only imports Prisma, so plain-Node modules can use it.

import { Prisma } from "@prisma/client";

/** SQL: `alias` (a "Document" row) passes the ACL for this user. */
export function documentAclSql({ userId, isSuperAdmin = false, alias = "d" }) {
  const t = Prisma.raw(`"${alias}"`);
  return Prisma.sql`(
    ${isSuperAdmin}
    OR ${t}.acl_synced_at IS NULL
    OR EXISTS (
      SELECT 1 FROM "DocumentAcl" acc_acl
      JOIN "UserIdentity" acc_ui ON acc_ui."userId" = ${userId}
      WHERE acc_acl.document_id = ${t}.id
        AND (
          (acc_acl.principal_type = 'user' AND acc_acl.principal_id = acc_ui.external_id)
          OR (acc_acl.principal_type = 'tenant' AND acc_acl.principal_id = acc_ui.tenant_id)
          OR (acc_acl.principal_type = 'group' AND acc_acl.principal_id = ANY(acc_ui.group_ids))
          OR (acc_acl.principal_type = 'group_owners' AND acc_acl.principal_id = ANY(acc_ui.owned_group_ids))
        )
    )
  )`;
}

/** The user's principals, for Prisma `where` filters: { userIds, tenantIds, groupIds, ownedGroupIds }. */
export async function getUserPrincipals(db, userId) {
  const identities = await db.userIdentity.findMany({
    where: { userId },
    select: { externalId: true, tenantId: true, groupIds: true, ownedGroupIds: true },
  });
  const uniq = (values) => [...new Set(values)];
  return {
    userIds: uniq(identities.map((i) => i.externalId)),
    tenantIds: uniq(identities.map((i) => i.tenantId)),
    groupIds: uniq(identities.flatMap((i) => i.groupIds)),
    ownedGroupIds: uniq(identities.flatMap((i) => i.ownedGroupIds)),
  };
}

/**
 * Prisma `where` equivalent of documentAclSql. Without `principals` only
 * documents with no source permissions pass (fails closed).
 */
export function documentAclWhere({ principals, isSuperAdmin = false }) {
  if (isSuperAdmin) return {};
  const p = principals || { userIds: [], tenantIds: [], groupIds: [], ownedGroupIds: [] };
  return {
    OR: [
      { aclSyncedAt: null },
      {
        acl: {
          some: {
            OR: [
              { principalType: "user", principalId: { in: p.userIds } },
              { principalType: "tenant", principalId: { in: p.tenantIds } },
              { principalType: "group", principalId: { in: p.groupIds } },
              { principalType: "group_owners", principalId: { in: p.ownedGroupIds } },
            ],
          },
        },
      },
    ],
  };
}

/** Of `documentIds`, the ones that pass the ACL for this user (one query). */
export async function documentIdsPassingAcl(db, documentIds, { userId, isSuperAdmin = false }) {
  const ids = [...new Set(documentIds.filter(Boolean))];
  if (!ids.length || isSuperAdmin) return new Set(ids);
  const rows = await db.$queryRaw`
    SELECT d.id FROM "Document" d
    WHERE d.id = ANY(${ids}::text[]) AND ${documentAclSql({ userId, alias: "d" })}
  `;
  return new Set(rows.map((r) => r.id));
}
