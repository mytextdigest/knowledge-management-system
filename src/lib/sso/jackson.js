// EKP Workstream E, E-12 (WS-A A-16): SAML Jackson, embedded as a library.
// It turns a SAML login into an OAuth code flow that NextAuth's
// BoxyHQSAMLProvider understands, so SAML reuses Microsoft sign-in's signIn
// callback. Its routes are under src/app/api/oauth/*.
//
// Storage: Jackson's own tables (jackson_store, jackson_index, jackson_ttl) in
// the `jackson` Postgres schema, outside Prisma. They're created once by
// scripts/ekp/e12-jackson-setup.mjs; the app never changes them
// (manualMigration), so a cold start doesn't alter the shared database.
//
// Env:
//   SAML_JACKSON_DB_URL                 direct (unpooled) Postgres URL
//   SAML_JACKSON_CLIENT_SECRET_VERIFIER random string; NextAuth's client secret
//   SAML_JACKSON_ENCRYPTION_KEY         32 characters; encrypts stored data
//   SAML_AUDIENCE (optional)            Identifier (Entity ID); default NEXTAUTH_URL
//
// Relative imports only: also used by the setup script.

import { jacksonDatabaseUrl, samlServiceProviderUrls, SAML_ACS_PATH, SAML_PRODUCT, SAML_PROVIDER_ID } from "./samlClaims.js";

/** SAML isn't configured on this deployment (env missing). */
export class SamlUnavailable extends Error {}

const REQUIRED_ENV = ["SAML_JACKSON_DB_URL", "SAML_JACKSON_CLIENT_SECRET_VERIFIER", "SAML_JACKSON_ENCRYPTION_KEY", "NEXTAUTH_URL"];

/** Is SAML set up on this deployment? */
export function isSamlAvailable(env = process.env) {
  return REQUIRED_ENV.every((name) => Boolean(env[name]));
}

/** Identifier and Reply URL for this deployment. */
export function serviceProviderUrls(env = process.env) {
  return samlServiceProviderUrls({ baseUrl: env.NEXTAUTH_URL, audience: env.SAML_AUDIENCE });
}

/** Jackson's options. `manualMigration: false` only from the setup script. */
export function jacksonOptions({ env = process.env, manualMigration = true } = {}) {
  if (!isSamlAvailable(env)) throw new SamlUnavailable("SAML sign-in isn't configured on this KMS deployment");
  if (env.SAML_JACKSON_ENCRYPTION_KEY.length !== 32) {
    throw new SamlUnavailable("SAML_JACKSON_ENCRYPTION_KEY must be 32 characters");
  }
  const { entityId } = serviceProviderUrls(env);
  return {
    externalUrl: env.NEXTAUTH_URL.replace(/\/+$/, ""),
    samlPath: SAML_ACS_PATH,
    samlAudience: entityId,
    db: {
      engine: "sql",
      type: "postgres",
      url: jacksonDatabaseUrl(env.SAML_JACKSON_DB_URL),
      encryptionKey: env.SAML_JACKSON_ENCRYPTION_KEY,
      manualMigration,
      // Sign-in sessions and codes expire; clean up a few at a time.
      ttl: 300,
      cleanupLimit: 100,
    },
    clientSecretVerifier: env.SAML_JACKSON_CLIENT_SECRET_VERIFIER,
    // Only logins started from KMS (SP-initiated). Decided (Johurul, 2026-11-18).
    idpEnabled: false,
    // Jackson's default sends anonymous usage data to BoxyHQ.
    noAnalytics: true,
    // Failed-login traces are kept for debugging without the user's details.
    ssoTraces: { redact: true, ttl: 7 * 24 * 3600 },
    openid: {},
  };
}

/**
 * The Jackson controllers ({ oauthController, connectionAPIController, ... }),
 * started once per server process.
 */
export async function getJackson() {
  const cache = globalThis;
  if (!cache.__kmsJackson) {
    const options = jacksonOptions(); // throws SamlUnavailable before caching
    cache.__kmsJackson = import("@boxyhq/saml-jackson")
      .then((mod) => (mod.default?.default ?? mod.default ?? mod)(options))
      .catch((err) => {
        cache.__kmsJackson = null; // try again on the next request
        throw err;
      });
  }
  return cache.__kmsJackson;
}

/** A Jackson error as { status, message } for a route response. */
export function jacksonError(err) {
  const status = Number(err?.statusCode) || 500;
  return { status, message: status >= 500 ? "SAML sign-in failed" : err.message || "SAML sign-in failed" };
}

// ---- An org's SAML connection (one per Microsoft tenant) ----

/** NextAuth's callback for the SAML provider on this deployment. */
export function samlCallbackUrl(env = process.env) {
  return `${env.NEXTAUTH_URL.replace(/\/+$/, "")}/api/auth/callback/${SAML_PROVIDER_ID}`;
}

const asList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [value];
};

/** What the settings page shows about a stored connection. */
export function describeConnection(record) {
  if (!record) return null;
  const idp = record.idpMetadata || {};
  return {
    idpEntityId: idp.entityID || null,
    certificateValidTo: idp.validTo || null,
    certificateThumbprint: idp.thumbprint || null,
    signInUrl: idp.sso?.redirectUrl || idp.sso?.postUrl || null,
  };
}

/** The org's SAML connection record (by Microsoft tenant id), or null. */
export async function getSamlConnection(tenantId) {
  const { connectionAPIController } = await getJackson();
  const records = await connectionAPIController.getConnections({ tenant: tenantId, product: SAML_PRODUCT });
  return records?.find((r) => r.idpMetadata) ?? null;
}

/**
 * Stores (or replaces) the org's SAML connection from Entra metadata XML,
 * checked by checkSamlMetadata first. The callback addresses already on it
 * are kept, so local and deployed KMS sharing a database both work.
 */
export async function saveSamlConnection(tenantId, rawMetadata) {
  const { connectionAPIController } = await getJackson();
  const existing = await connectionAPIController.getConnections({ tenant: tenantId, product: SAML_PRODUCT });
  const callback = samlCallbackUrl();
  const redirectUrl = [...new Set([...existing.flatMap((r) => asList(r.redirectUrl)), callback])];
  const record = await connectionAPIController.createSAMLConnection({
    rawMetadata,
    tenant: tenantId,
    product: SAML_PRODUCT,
    name: "Microsoft Entra",
    defaultRedirectUrl: callback,
    redirectUrl: JSON.stringify(redirectUrl),
  });
  // One connection per tenant: drop any left from an earlier IdP.
  for (const old of existing) {
    if (old.clientID !== record.clientID) {
      await connectionAPIController.deleteConnections({ clientID: old.clientID, clientSecret: old.clientSecret });
    }
  }
  return record;
}

/** Removes the org's SAML connection. */
export async function deleteSamlConnection(tenantId) {
  const { connectionAPIController } = await getJackson();
  await connectionAPIController.deleteConnections({ tenant: tenantId, product: SAML_PRODUCT });
}

/**
 * Swaps a one-time code for a token, then makes sure the code can't be used
 * again. Jackson (26.2.0) stores a code under the part after the dot but
 * deletes it under the whole code, so without this a code stays valid until
 * it expires (db.ttl). Replaying one would still need the PKCE verifier.
 */
export async function exchangeCode(oauthController, params) {
  const result = await oauthController.token(params);
  const key = String(params?.code || "").split(".")[1];
  if (key && oauthController.codeStore?.delete) {
    await oauthController.codeStore.delete(key).catch(() => {});
  }
  return result;
}
