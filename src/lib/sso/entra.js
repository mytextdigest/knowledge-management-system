// EKP Workstream A, A1: Microsoft (Entra ID) sign-in.
// Turns the claims of a verified Microsoft ID token into a KMS user who is a
// member of the org that connected that tenant. Design and rules:
// docs/ekp/phase1/WS_A_M365_CONNECTORS.md, A1 step 5.
//
// Called from the NextAuth signIn callback (src/lib/auth.js). The token's
// signature, audience and issuer are already checked by openid-client.

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { applyGroupGrants, computeGroupGrants, hasGroupOverage } from "@/lib/sso/groupMapping";
import { getUserGroupIds } from "@/lib/sso/entraGraph";

// Error codes shown on the sign-in page (?error=<code>).
export const SSO_ERRORS = {
  NOT_CONFIGURED: "SsoNotConfigured",
  NO_EMAIL: "SsoNoEmail",
  DOMAIN_NOT_ALLOWED: "SsoDomainNotAllowed",
  NOT_INVITED: "SsoNotInvited",
};

export class SsoError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// The email to use for a Microsoft account: the `email` claim, else the UPN
// unless it's a B2B guest UPN (`..#EXT#@...`), which isn't a real address.
export function emailFromClaims(claims) {
  const candidates = [claims.email, claims.preferred_username];
  for (const value of candidates) {
    const email = String(value || "").trim().toLowerCase();
    if (email && email.includes("@") && !email.includes("#ext#")) return email;
  }
  return null;
}

export function emailDomain(email) {
  return email.slice(email.lastIndexOf("@") + 1);
}

/**
 * Resolve (and if needed create) the KMS user for a Microsoft sign-in.
 * Throws SsoError with a SSO_ERRORS code when sign-in must be refused.
 * Returns { user, orgId, created }.
 */
export async function resolveEntraSignIn(
  claims,
  { db = prisma, audit = logAudit, fetchGroupIds = getUserGroupIds } = {}
) {
  const tenantId = claims.tid;
  const objectId = claims.oid;
  if (!tenantId || !objectId) throw new SsoError(SSO_ERRORS.NOT_CONFIGURED);

  // Only tenants an org has connected may sign in.
  const config = await db.orgSsoConfig.findUnique({ where: { tenantId } });
  if (!config || !config.enabled) throw new SsoError(SSO_ERRORS.NOT_CONFIGURED);

  const email = emailFromClaims(claims);
  if (!email) throw new SsoError(SSO_ERRORS.NO_EMAIL);

  // The email must be on one of the org's verified domains. Entra's email
  // attribute can be set to anything by a tenant admin, so trusting it
  // outside verified domains would allow account takeover ("nOAuth").
  const allowed = (config.allowedDomains || []).map((d) => d.toLowerCase());
  if (!allowed.includes(emailDomain(email))) throw new SsoError(SSO_ERRORS.DOMAIN_NOT_ALLOWED);

  const identityKey = { provider: "entra", tenantId, externalId: objectId };
  const identity = await db.userIdentity.findUnique({
    where: { provider_tenantId_externalId: identityKey },
    include: { user: true },
  });

  let user = identity?.user ?? (await db.user.findUnique({ where: { email } }));
  const membership = user
    ? await db.organizationMember.findUnique({ where: { orgId_userId: { orgId: config.orgId, userId: user.id } } })
    : null;

  const invite = membership
    ? null
    : await db.organizationInvite.findFirst({
        where: { orgId: config.orgId, email, acceptedAt: null, declinedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });

  if (!membership && !invite && config.provisioning === "invite_only") {
    throw new SsoError(SSO_ERRORS.NOT_INVITED);
  }

  let created = false;
  if (!user) {
    user = await db.user.create({
      data: { email, name: claims.name || null, emailVerified: true },
    });
    created = true;
  } else if (!user.emailVerified) {
    // Microsoft has verified this address for a domain the org owns.
    user = await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  }

  if (!membership) {
    const role = invite?.role || "employee";
    await db.organizationMember.create({ data: { orgId: config.orgId, userId: user.id, role } });
    if (invite) {
      const departmentRole = invite.role === "dept_admin" ? "admin" : "member";
      for (const departmentId of invite.departmentIds) {
        await db.departmentMember.upsert({
          where: { departmentId_userId: { departmentId, userId: user.id } },
          update: { role: departmentRole },
          create: { departmentId, userId: user.id, role: departmentRole },
        });
      }
      await db.organizationInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    }
  }

  // A-6: Entra group → role/department mapping, applied at every sign-in.
  // Also runs when the map is now empty, to take back earlier grants.
  const groupRoleMap = Array.isArray(config.groupRoleMap) ? config.groupRoleMap : [];
  const previousGrants = identity?.userId === user.id ? identity.groupGrants : null;
  let groupGrants = previousGrants ?? undefined;
  let groupChanges = null;
  if (groupRoleMap.length || previousGrants) {
    let groupIds = Array.isArray(claims.groups) ? claims.groups : [];
    let groupsKnown = true;
    if (groupRoleMap.length && hasGroupOverage(claims)) {
      try {
        groupIds = await fetchGroupIds(tenantId, objectId);
      } catch (err) {
        // Don't block sign-in; keep the previous grants until groups can be read.
        console.error("Couldn't read the user's Microsoft groups:", err.message);
        groupsKnown = false;
      }
    }
    if (groupsKnown) {
      const result = await applyGroupGrants(db, {
        orgId: config.orgId,
        userId: user.id,
        grants: computeGroupGrants(groupIds, groupRoleMap),
        previous: previousGrants,
      });
      groupGrants = result.stored;
      groupChanges = result.changes;
    }
  }

  // Link (or refresh) the identity. An existing email_match identity for the
  // same object id becomes "sso".
  await db.userIdentity.upsert({
    where: { provider_tenantId_externalId: identityKey },
    update: { userId: user.id, source: "sso", email, lastLoginAt: new Date(), groupGrants },
    create: { ...identityKey, userId: user.id, source: "sso", email, lastLoginAt: new Date(), groupGrants },
  });

  if (groupChanges && (groupChanges.roleTo || groupChanges.joined.length || groupChanges.left.length)) {
    await audit({
      orgId: config.orgId,
      actorUserId: user.id,
      targetUserId: user.id,
      action: "auth.sso_group_mapping_applied",
      metadata: groupChanges,
    });
  }

  await audit({
    orgId: config.orgId,
    actorUserId: user.id,
    action: created ? "auth.sso_user_created" : "auth.sso_login",
    metadata: { provider: "entra", tenantId, protocol: config.protocol, joined: !membership },
  });

  return { user, orgId: config.orgId, created };
}
