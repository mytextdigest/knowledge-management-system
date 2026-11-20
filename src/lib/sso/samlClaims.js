// EKP Workstream E, E-12 (WS-A A-16): SAML 2.0 sign-in with Microsoft Entra.
// Pure helpers, no database or Jackson: the SAML attributes Entra sends, the
// addresses KMS gives the customer's Entra admin, and the checks on uploaded
// metadata. Design: docs/ekp/phase1/WS_A_M365_CONNECTORS.md, A1 step 9.
//
// SAML ends in the same resolveEntraSignIn as OIDC (src/lib/sso/entra.js):
// the SAML attributes are turned into the claims an OIDC token carries
// (tid, oid, email, name, groups), so the same person lands on the same KMS
// user whichever protocol they used.
//
// Relative imports only: also used by scripts.

/** Jackson's `product` for every KMS connection. Its `tenant` is the Microsoft tenant id. */
export const SAML_PRODUCT = "kms";

/** NextAuth's id for the SAML provider (BoxyHQSAMLProvider). */
export const SAML_PROVIDER_ID = "boxyhq-saml";

/** Where Microsoft posts the signed SAML response (the Reply URL in Entra). */
export const SAML_ACS_PATH = "/api/oauth/saml";

/** Largest metadata file accepted (Entra's is about 5 KB). */
export const MAX_METADATA_BYTES = 256 * 1024;

// The attribute names Entra uses in a SAML token.
export const ENTRA_SAML_CLAIMS = {
  tenantId: "http://schemas.microsoft.com/identity/claims/tenantid",
  objectId: "http://schemas.microsoft.com/identity/claims/objectidentifier",
  email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  upn: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  displayName: "http://schemas.microsoft.com/identity/claims/displayname",
  givenName: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  surname: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  groups: "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
  // Sent instead of `groups` when the user is in more than 150 groups.
  groupsLink: "http://schemas.microsoft.com/claims/groups.link",
};

const first = (value) => (Array.isArray(value) ? value[0] : value);
const list = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);
const text = (value) => {
  const v = first(value);
  return v == null ? undefined : String(v).trim() || undefined;
};

/**
 * The OIDC-shaped claims for a SAML sign-in, from the profile Jackson returns
 * (`raw` holds the SAML attributes). The result is what resolveEntraSignIn
 * reads: { tid, oid, email, preferred_username, name, groups, hasgroups }.
 */
export function claimsFromSamlProfile(profile) {
  const raw = profile?.raw || {};
  const c = ENTRA_SAML_CLAIMS;
  const name =
    text(raw[c.displayName]) ||
    [text(raw[c.givenName]) ?? profile?.firstName, text(raw[c.surname]) ?? profile?.lastName].filter(Boolean).join(" ") ||
    undefined;
  return {
    tid: text(raw[c.tenantId]),
    oid: text(raw[c.objectId]),
    email: text(raw[c.email]) || text(profile?.email),
    preferred_username: text(raw[c.upn]),
    name,
    groups: list(raw[c.groups]).map(String),
    // hasGroupOverage (groupMapping.js) reads `hasgroups`, as for OIDC.
    hasgroups: raw[c.groupsLink] != null || undefined,
  };
}

/**
 * Was this SAML sign-in started for the tenant whose IdP answered? Jackson's
 * `requested.tenant` is the tenant KMS asked for; `claims.tid` is the tenant
 * in the signed assertion. They must match, so one org's SAML connection can
 * never sign someone into another org.
 */
export function samlTenantMatches(profile, claims) {
  const requested = profile?.requested?.tenant;
  return Boolean(requested && claims?.tid && requested.toLowerCase() === claims.tid.toLowerCase());
}

/** The tenant id in an Entra IdP entity id (`https://sts.windows.net/<tenant>/`), or null. */
export function tenantIdFromEntraEntityId(entityId) {
  const match = /^https:\/\/sts\.windows\.net\/([0-9a-f-]{36})\/?$/i.exec(String(entityId || "").trim());
  return match ? match[1].toLowerCase() : null;
}

/** The IdP entity id in a metadata XML document, or null. */
export function entityIdFromMetadata(xml) {
  const match = /<(?:[\w-]+:)?EntityDescriptor\b[^>]*\bentityID\s*=\s*"([^"]+)"/.exec(String(xml || ""));
  return match ? match[1] : null;
}

/**
 * Checks uploaded IdP metadata before it's stored: it must be Entra
 * federation metadata for the org's connected tenant. Returns { error } or {}.
 */
export function checkSamlMetadata(xml, tenantId) {
  const body = String(xml || "").trim();
  if (!body) return { error: "Upload the Federation Metadata XML from your Microsoft Entra SAML application." };
  if (Buffer.byteLength(body, "utf8") > MAX_METADATA_BYTES) return { error: "That file is too large to be SAML metadata." };
  const entityId = entityIdFromMetadata(body);
  if (!entityId) return { error: "That file isn't SAML metadata (no EntityDescriptor found)." };
  const metadataTenant = tenantIdFromEntraEntityId(entityId);
  if (!metadataTenant) {
    return { error: "That metadata isn't from Microsoft Entra. Download Federation Metadata XML from the Entra enterprise application." };
  }
  if (metadataTenant !== String(tenantId || "").toLowerCase()) {
    return { error: "That metadata is for a different Microsoft organization than the one connected to KMS." };
  }
  return {};
}

const trimSlash = (url) => String(url || "").replace(/\/+$/, "");

/**
 * The two values the customer's Entra admin pastes into the SAML app:
 * Identifier (Entity ID) and Reply URL (Assertion Consumer Service URL).
 */
export function samlServiceProviderUrls({ baseUrl, audience } = {}) {
  const base = trimSlash(baseUrl);
  return {
    entityId: audience || base,
    acsUrl: `${base}${SAML_ACS_PATH}`,
  };
}

/**
 * Jackson's database URL: its own `jackson` schema (so Prisma never sees its
 * tables) and a small pool. Needs Neon's direct (unpooled) URL: the pooler
 * rejects the search_path startup option.
 */
/**
 * Do two Postgres URLs reach the same database? Neon's pooled host
 * ("ep-x-pooler.…") and direct host ("ep-x.…") count as one.
 */
export function sameDatabase(a, b) {
  const key = (url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.");
      return `${host}:${u.port || "5432"}${u.pathname}`;
    } catch {
      return null;
    }
  };
  const ka = key(a);
  return Boolean(ka) && ka === key(b);
}

export function jacksonDatabaseUrl(url, { maxConnections = 2 } = {}) {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c search_path=jackson");
  if (!parsed.searchParams.has("max_conns")) parsed.searchParams.set("max_conns", String(maxConnections));
  return parsed.toString();
}
