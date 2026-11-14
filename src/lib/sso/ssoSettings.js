// EKP Workstream A, A1 (A-5): the editable part of an org's Microsoft sign-in
// settings, validated in one place (used by PATCH /api/org/[orgId]/sso).

import { validateGroupRoleMap } from "@/lib/sso/groupMapping";

export const PROVISIONING = ["auto", "invite_only"];
export const PASSWORD_LOGIN = ["admins_only", "all"];

// State older than this can't complete a connect (Microsoft round-trip).
export const CONNECT_STATE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Validate a settings patch against the stored config. `departmentIds` are
 * the org's departments (for the group mapping).
 * Returns { data } with only the changed, valid fields, or { error }.
 */
export function validateSsoSettingsPatch(body, config, { departmentIds = [] } = {}) {
  const data = {};

  if (body.allowedDomains !== undefined) {
    if (!Array.isArray(body.allowedDomains)) return { error: "allowedDomains must be a list" };
    const domains = [...new Set(body.allowedDomains.map((d) => String(d).trim().toLowerCase()).filter(Boolean))];
    const verified = new Set(config.verifiedDomains || []);
    const unverified = domains.filter((d) => !verified.has(d));
    if (unverified.length) return { error: `Not a verified domain of this Microsoft organization: ${unverified.join(", ")}` };
    data.allowedDomains = domains;
  }
  if (body.provisioning !== undefined) {
    if (!PROVISIONING.includes(body.provisioning)) return { error: "Invalid provisioning" };
    data.provisioning = body.provisioning;
  }
  if (body.passwordLogin !== undefined) {
    if (!PASSWORD_LOGIN.includes(body.passwordLogin)) return { error: "Invalid passwordLogin" };
    data.passwordLogin = body.passwordLogin;
  }
  if (body.groupRoleMap !== undefined) {
    const { map, error } = validateGroupRoleMap(body.groupRoleMap, { departmentIds });
    if (error) return { error };
    data.groupRoleMap = map;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { error: "enabled must be true or false" };
    data.enabled = body.enabled;
  }

  const enabledAfter = data.enabled ?? config.enabled;
  const domainsAfter = data.allowedDomains ?? config.allowedDomains ?? [];
  if (enabledAfter && domainsAfter.length === 0) {
    return { error: "Choose at least one domain before turning Microsoft sign-in on" };
  }
  return { data };
}

// What the admin page sees (no internal ids beyond the tenant).
export function serializeSsoConfig(config) {
  if (!config) return { connected: false };
  return {
    connected: true,
    tenantId: config.tenantId,
    tenantName: config.tenantName,
    protocol: config.protocol,
    enabled: config.enabled,
    verifiedDomains: config.verifiedDomains,
    allowedDomains: config.allowedDomains,
    provisioning: config.provisioning,
    passwordLogin: config.passwordLogin,
    groupRoleMap: Array.isArray(config.groupRoleMap) ? config.groupRoleMap : [],
    updatedAt: config.updatedAt,
  };
}
