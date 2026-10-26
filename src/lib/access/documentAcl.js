// F1 / A-10: the per-file permission clause (WS_A_M365_CONNECTORS.md §3.2).
//
// A document whose source permissions are known (aclSyncedAt set, e.g. a
// SharePoint file) is visible only if one of its DocumentAcl rows matches the
// user: their Entra object id or tenant (UserIdentity, joined in SQL), or a
// group they're in or own (read from Graph into the in-memory group cache,
// src/lib/identity/groupCache.js, and passed as parameters). A document with
// aclSyncedAt null (manual uploads) is unaffected. super_admin skips it.
//
// It narrows the existing role/department/lifecycle rules, never widens
// them. Only plain imports, so plain-Node modules can use it.

import { Prisma } from "@prisma/client";
import { getCachedGroups } from "../identity/groupCache.js";

/** SQL: `alias` (a "Document" row) passes the ACL for this user. */
export function documentAclSql({ userId, isSuperAdmin = false, alias = "d" }) {
  const t = Prisma.raw(`"${alias}"`);
  const { groupIds, ownedGroupIds } = getCachedGroups(userId);
  return Prisma.sql`(
    ${isSuperAdmin}
    OR ${t}.acl_synced_at IS NULL
    OR EXISTS (
      SELECT 1 FROM "DocumentAcl" acc_acl
      WHERE acc_acl.document_id = ${t}.id
        AND (
          (acc_acl.principal_type = 'group' AND acc_acl.principal_id = ANY(${groupIds}::text[]))
          OR (acc_acl.principal_type = 'group_owners' AND acc_acl.principal_id = ANY(${ownedGroupIds}::text[]))
          OR EXISTS (
            -- The user's identity in the tenant this document came from (the
            -- SharePoint tenant connected to the document's org).
            SELECT 1 FROM "UserIdentity" acc_ui
            JOIN "OrgIntegration" acc_oi
              ON acc_oi."orgId" = ${t}."orgId" AND acc_oi.provider = 'sharepoint'
             AND acc_oi.scope_config->>'tenantId' = acc_ui.tenant_id
            WHERE acc_ui."userId" = ${userId}
              AND ((acc_acl.principal_type = 'user' AND acc_acl.principal_id = acc_ui.external_id)
                OR (acc_acl.principal_type = 'tenant' AND acc_acl.principal_id = acc_ui.tenant_id))
          )
        )
    )
  )`;
}

/**
 * The user's principals in an org's SharePoint tenant, for Prisma `where`
 * filters: { userIds, tenantIds, groupIds, ownedGroupIds }.
 */
export async function getUserPrincipals(db, userId, { orgId }) {
  const integration = await db.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "sharepoint" } },
    select: { scopeConfig: true },
  });
  const tenantId = integration?.scopeConfig?.tenantId;
  const identities = tenantId
    ? await db.userIdentity.findMany({ where: { userId, tenantId }, select: { externalId: true, tenantId: true } })
    : [];
  const uniq = (values) => [...new Set(values)];
  const { groupIds, ownedGroupIds } = getCachedGroups(userId);
  return {
    userIds: uniq(identities.map((i) => i.externalId)),
    tenantIds: uniq(identities.map((i) => i.tenantId)),
    groupIds: [...groupIds],
    ownedGroupIds: [...ownedGroupIds],
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
