// EKP E-12 (WS-A A-16): SAML 2.0 sign-in through embedded SAML Jackson.
// No database: pure helpers, source checks, and a full SAML round trip
// through Jackson's in-memory store with a fake Entra IdP (its own signing
// certificate), from KMS's AuthnRequest to the claims resolveEntraSignIn reads.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import forge from "node-forge";
import saml20Module from "@boxyhq/saml20";
import {
  ENTRA_SAML_CLAIMS,
  checkSamlMetadata,
  claimsFromSamlProfile,
  entityIdFromMetadata,
  jacksonDatabaseUrl,
  sameDatabase,
  samlServiceProviderUrls,
  samlTenantMatches,
  tenantIdFromEntraEntityId,
  SAML_PRODUCT,
} from "../../src/lib/sso/samlClaims.js";
import {
  describeConnection,
  exchangeCode,
  getSamlConnection,
  isSamlAvailable,
  jacksonOptions,
  removeExpiredSignInRecords,
  saveSamlConnection,
  samlCallbackUrl,
  SamlUnavailable,
} from "../../src/lib/sso/jackson.js";
import { validateSsoSettingsPatch } from "../../src/lib/sso/ssoSettings.js";

const saml20 = saml20Module.default ?? saml20Module;
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER_TENANT = "99999999-8888-7777-6666-555555555555";
const ENV = {
  NEXTAUTH_URL: "http://localhost:3000",
  SAML_JACKSON_DB_URL: "postgresql://u:p@db.example.test/kms?sslmode=require",
  SAML_JACKSON_CLIENT_SECRET_VERIFIER: "verifier-for-tests",
  SAML_JACKSON_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
};

const entraRaw = (overrides = {}) => ({
  [ENTRA_SAML_CLAIMS.tenantId]: TENANT,
  [ENTRA_SAML_CLAIMS.objectId]: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  [ENTRA_SAML_CLAIMS.email]: "Jane.Doe@NGI.example",
  [ENTRA_SAML_CLAIMS.upn]: "jane.doe@ngi.example",
  [ENTRA_SAML_CLAIMS.displayName]: "Jane Doe",
  [ENTRA_SAML_CLAIMS.groups]: ["g-1", "g-2"],
  ...overrides,
});

// ---- Claims ----

test("SAML attributes become the claims OIDC gives", () => {
  const claims = claimsFromSamlProfile({ raw: entraRaw(), requested: { tenant: TENANT } });
  assert.equal(claims.tid, TENANT);
  assert.equal(claims.oid, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(claims.email, "Jane.Doe@NGI.example"); // emailFromClaims lower-cases it
  assert.equal(claims.preferred_username, "jane.doe@ngi.example");
  assert.equal(claims.name, "Jane Doe");
  assert.deepEqual(claims.groups, ["g-1", "g-2"]);
  assert.equal(claims.hasgroups, undefined);
});

test("single values, one group, a missing display name and group overage", () => {
  const raw = entraRaw({ [ENTRA_SAML_CLAIMS.groups]: "only-group", [ENTRA_SAML_CLAIMS.displayName]: undefined });
  delete raw[ENTRA_SAML_CLAIMS.displayName];
  const one = claimsFromSamlProfile({ raw, firstName: "Jane", lastName: "Doe" });
  assert.deepEqual(one.groups, ["only-group"]);
  assert.equal(one.name, "Jane Doe");

  const overage = entraRaw({ [ENTRA_SAML_CLAIMS.groupsLink]: "https://graph.microsoft.com/v1.0/users/x/getMemberObjects" });
  delete overage[ENTRA_SAML_CLAIMS.groups];
  const c = claimsFromSamlProfile({ raw: overage });
  assert.equal(c.hasgroups, true, "hasGroupOverage then reads groups from Graph");
  assert.deepEqual(c.groups, []);

  assert.equal(claimsFromSamlProfile({ raw: {}, email: "x@y.example" }).email, "x@y.example", "falls back to Jackson's email");
  assert.deepEqual(claimsFromSamlProfile(null).groups, []);
});

test("the assertion's tenant must be the tenant KMS asked for", () => {
  const claims = { tid: TENANT };
  assert.equal(samlTenantMatches({ requested: { tenant: TENANT } }, claims), true);
  assert.equal(samlTenantMatches({ requested: { tenant: TENANT.toUpperCase() } }, claims), true);
  assert.equal(samlTenantMatches({ requested: { tenant: OTHER_TENANT } }, claims), false);
  assert.equal(samlTenantMatches({ requested: {} }, claims), false);
  assert.equal(samlTenantMatches({ requested: { tenant: TENANT } }, {}), false);
});

// ---- Metadata ----

const metadata = (entityId) =>
  `<?xml version="1.0"?><EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}"><IDPSSODescriptor/></EntityDescriptor>`;

test("only Entra metadata for the org's own tenant is accepted", () => {
  assert.equal(tenantIdFromEntraEntityId(`https://sts.windows.net/${TENANT}/`), TENANT);
  assert.equal(tenantIdFromEntraEntityId(`https://sts.windows.net/${TENANT.toUpperCase()}`), TENANT);
  assert.equal(tenantIdFromEntraEntityId("https://idp.example.com/saml"), null);
  assert.equal(entityIdFromMetadata(`<md:EntityDescriptor xmlns:md="x" ID="_a" entityID="https://e/"/>`), "https://e/");

  assert.deepEqual(checkSamlMetadata(metadata(`https://sts.windows.net/${TENANT}/`), TENANT), {});
  assert.match(checkSamlMetadata(metadata(`https://sts.windows.net/${OTHER_TENANT}/`), TENANT).error, /different Microsoft organization/);
  assert.match(checkSamlMetadata(metadata("https://okta.example.com/abc"), TENANT).error, /isn't from Microsoft Entra/);
  assert.match(checkSamlMetadata("<html></html>", TENANT).error, /isn't SAML metadata/);
  assert.match(checkSamlMetadata("", TENANT).error, /Upload/);
  assert.match(checkSamlMetadata("x".repeat(300 * 1024), TENANT).error, /too large/);
});

// ---- Settings and config ----

test("the values for Entra, and Jackson's database URL", () => {
  assert.deepEqual(samlServiceProviderUrls({ baseUrl: "https://kms.example.com/" }), {
    entityId: "https://kms.example.com",
    acsUrl: "https://kms.example.com/api/oauth/saml",
  });
  assert.equal(samlServiceProviderUrls({ baseUrl: "http://localhost:3000", audience: "urn:kms" }).entityId, "urn:kms");

  const url = new URL(jacksonDatabaseUrl(ENV.SAML_JACKSON_DB_URL));
  assert.equal(url.searchParams.get("options"), "-c search_path=jackson", "own schema, never Prisma's public");
  assert.equal(url.searchParams.get("max_conns"), "2");
  assert.equal(url.searchParams.get("sslmode"), "require");
});

test("Jackson's options: SP-initiated only, no analytics, no schema changes from the app", () => {
  assert.equal(isSamlAvailable({}), false);
  assert.equal(isSamlAvailable(ENV), true);
  assert.throws(() => jacksonOptions({ env: {} }), SamlUnavailable);
  assert.throws(() => jacksonOptions({ env: { ...ENV, SAML_JACKSON_ENCRYPTION_KEY: "short" } }), /32 characters/);

  const opts = jacksonOptions({ env: ENV });
  assert.equal(opts.idpEnabled, false);
  assert.equal(opts.noAnalytics, true);
  assert.equal(opts.db.manualMigration, true);
  assert.equal(jacksonOptions({ env: ENV, manualMigration: false }).db.manualMigration, false);
  assert.equal(opts.samlPath, "/api/oauth/saml");
  assert.equal(opts.samlAudience, "http://localhost:3000");
  assert.equal(opts.ssoTraces.redact, true);
  assert.equal(samlCallbackUrl(ENV), "http://localhost:3000/api/auth/callback/boxyhq-saml");
});

test("expired sign-in records: swept per sign-in step when Prisma reaches Jackson's database, else Jackson's timer", () => {
  const neonDirect = "postgresql://u:p@ep-cold-shape-x.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require";
  const neonPooled = "postgresql://u:p@ep-cold-shape-x-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require";
  assert.equal(sameDatabase(neonDirect, neonPooled), true, "Neon pooled and direct hosts are one database");
  assert.equal(sameDatabase("postgresql://a:b@localhost:5432/kms", "postgresql://c:d@localhost/kms"), true);
  assert.equal(sameDatabase(neonDirect, neonPooled.replace("/neondb", "/other")), false);
  assert.equal(sameDatabase(neonDirect, "postgresql://u:p@ep-other.c-8.us-east-2.aws.neon.tech/neondb"), false);
  assert.equal(sameDatabase(neonDirect, undefined), false);
  assert.equal(sameDatabase("not a url", "not a url"), false);

  // Same database: no 5-minute timer (it kept Neon awake); expiry unchanged.
  const shared = jacksonOptions({ env: { ...ENV, SAML_JACKSON_DB_URL: neonDirect, DATABASE_URL: neonPooled } });
  assert.equal(shared.db.cleanupLimit, undefined);
  assert.equal(shared.db.ttl, 300);
  // Prisma elsewhere (or unset): Jackson's own sweep stays on, so codes still expire.
  const separate = jacksonOptions({ env: ENV });
  assert.equal(separate.db.cleanupLimit, 100);
  assert.equal(separate.db.ttl, 300);

  for (const route of ["authorize", "saml", "token", "userinfo"]) {
    const src = read(`src/app/api/oauth/${route}/route.js`);
    assert.match(src, /getJacksonForSignIn\(\)/, `${route} sweeps expired records first`);
    assert.doesNotMatch(src, /getJackson\(\)/, `${route} never skips the sweep`);
  }
});

test("removeExpiredSignInRecords against the database (EKP_DB_TESTS=1)", { skip: process.env.EKP_DB_TESTS !== "1" }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const ROLLBACK = Symbol("rollback");
  const tag = `e12-sweep-${Date.now()}`;
  try {
    await prisma.$transaction(async (db) => {
      for (const [suffix, expiresAt] of [["old", Date.now() - 60_000], ["live", Date.now() + 300_000]]) {
        const key = `${tag}-${suffix}`;
        await db.$executeRaw`INSERT INTO jackson.jackson_store (key, value, namespace) VALUES (${key}, 'x', 'oauth:code')`;
        await db.$executeRaw`INSERT INTO jackson.jackson_index (key, "storeKey") VALUES (${`${key}-idx`}, ${key})`;
        await db.$executeRaw`INSERT INTO jackson.jackson_ttl (key, "expiresAt") VALUES (${key}, ${BigInt(expiresAt)})`;
      }
      await removeExpiredSignInRecords(db);
      const left = await db.$queryRaw`SELECT key FROM jackson.jackson_store WHERE key LIKE ${`${tag}%`} ORDER BY key`;
      assert.deepEqual(left.map((r) => r.key), [`${tag}-live`], "expired record gone, live one kept");
      const ttl = await db.$queryRaw`SELECT key FROM jackson.jackson_ttl WHERE key LIKE ${`${tag}%`}`;
      assert.deepEqual(ttl.map((r) => r.key), [`${tag}-live`]);
      const idx = await db.$queryRaw`SELECT key FROM jackson.jackson_index WHERE key LIKE ${`${tag}%`}`;
      assert.deepEqual(idx.map((r) => r.key), [`${tag}-live-idx`], "its index rows go with it");
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});

test("protocol setting", () => {
  const config = { protocol: "oidc", enabled: true, allowedDomains: ["ngi.example"], verifiedDomains: ["ngi.example"] };
  assert.deepEqual(validateSsoSettingsPatch({ protocol: "saml" }, config).data, { protocol: "saml" });
  assert.deepEqual(validateSsoSettingsPatch({ protocol: "oidc" }, config).data, {}, "unchanged isn't written");
  assert.equal(validateSsoSettingsPatch({ protocol: "ldap" }, config).error, "Invalid protocol");
});

test("sign-in wiring: one signIn path for both protocols, tenant check first", () => {
  const auth = read("src/lib/auth.js");
  assert.match(auth, /BoxyHQSAMLProvider\(/);
  assert.match(auth, /authorization: \{ params: \{ scope: "email profile" \} \}/, "no openid scope (see the round trip)");
  assert.match(auth, /samlTenantMatches\(profile, claims\)[\s\S]*resolveEntraSignIn\(claims, \{ protocol \}\)/);
  assert.match(auth, /token\.entraOid = claims\.oid/);

  const discovery = read("src/app/api/auth/sso-discovery/route.js");
  assert.match(discovery, /microsoftSignInTarget\(config\)/);
  assert.match(read("src/app/api/auth/register/route.js"), /useMicrosoft: true, email, \.\.\.microsoftSignInTarget/);
  assert.match(read("src/components/auth/SigninPageInner.jsx"), /startMicrosoftSignIn\(/);
  assert.match(read("src/app/api/oauth/saml/route.js"), /if \(!RelayState\) return signInError\(req, "SamlStartAtKms"\)/);
  assert.match(read("src/app/api/org/[orgId]/sso/saml/route.js"), /checkSamlMetadata\(metadataXml, config\.tenantId\)/);
  assert.match(read("src/app/api/integrations/entra-sso/callback/route.js"), /!sameTenant \? \{ protocol: "oidc" \}/);
  assert.match(read("next.config.mjs"), /serverExternalPackages: \['@boxyhq\/saml-jackson'\]/);
});

test("discovery sends SAML orgs to their SAML app", async () => {
  const { microsoftSignInTarget } = await import("../../src/lib/sso/discovery.js");
  const config = { protocol: "saml", tenantId: TENANT };
  assert.deepEqual(microsoftSignInTarget(config, { samlAvailable: true }), { protocol: "saml", samlTenant: TENANT });
  assert.deepEqual(microsoftSignInTarget(config, { samlAvailable: false }), { protocol: "oidc" });
  assert.deepEqual(microsoftSignInTarget({ protocol: "oidc", tenantId: TENANT }, { samlAvailable: true }), { protocol: "oidc" });
});

// ---- Full round trip through Jackson (in memory) with a fake Entra IdP ----

function makeCert() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 864e5);
  cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [{ name: "commonName", value: "Fake Entra" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { publicKey: forge.pki.certificateToPem(cert), privateKey: forge.pki.privateKeyToPem(keys.privateKey) };
}

test("full SAML round trip: AuthnRequest → signed response → code → token → claims", { timeout: 60_000 }, async (t) => {
  const savedEnv = { ...process.env };
  Object.assign(process.env, ENV);
  const { default: jacksonModule } = await import("@boxyhq/saml-jackson");
  const startJackson = jacksonModule.default ?? jacksonModule;
  const opts = jacksonOptions({ env: ENV });
  // In memory. Jackson's cleanup timers are unref'd so the test run can exit.
  const realSetInterval = globalThis.setInterval;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setInterval = (...args) => realSetInterval(...args).unref();
  globalThis.setTimeout = (...args) => realSetTimeout(...args).unref();
  let jackson;
  try {
    jackson = await startJackson({
      ...opts,
      db: { engine: "mem", encryptionKey: ENV.SAML_JACKSON_ENCRYPTION_KEY },
      ssoTraces: { disable: true },
    });
  } finally {
    globalThis.setInterval = realSetInterval;
    globalThis.setTimeout = realSetTimeout;
  }
  globalThis.__kmsJackson = Promise.resolve(jackson); // what getJackson() returns
  t.after(async () => {
    await jackson.close?.(); // stops Jackson's timers so the test run exits
    globalThis.__kmsJackson = null;
    process.env = savedEnv;
  });

  // The org's Entra SAML app, as Microsoft would describe it.
  const idp = makeCert();
  const idpEntityId = `https://sts.windows.net/${TENANT}/`;
  const xml = saml20.createIdPMetadataXML({
    ssoUrl: `https://login.microsoftonline.com/${TENANT}/saml2`,
    entityId: idpEntityId,
    x509cert: idp.publicKey,
    wantAuthnRequestsSigned: false,
  });
  assert.deepEqual(checkSamlMetadata(xml, TENANT), {});

  // Saved twice (as from local and from the deployed app): still one connection.
  await saveSamlConnection(TENANT, xml);
  process.env.NEXTAUTH_URL = "https://kms-dev.example.com";
  await saveSamlConnection(TENANT, xml);
  process.env.NEXTAUTH_URL = ENV.NEXTAUTH_URL;
  const record = await getSamlConnection(TENANT);
  assert.equal(describeConnection(record).idpEntityId, idpEntityId);
  const all = await jackson.connectionAPIController.getConnections({ tenant: TENANT, product: SAML_PRODUCT });
  assert.equal(all.length, 1);
  const stored = all[0].redirectUrl;
  assert.deepEqual((Array.isArray(stored) ? stored : JSON.parse(stored)).sort(), [
    "http://localhost:3000/api/auth/callback/boxyhq-saml",
    "https://kms-dev.example.com/api/auth/callback/boxyhq-saml",
  ]);

  // 1. NextAuth sends the browser to /api/oauth/authorize (PKCE + state).
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const callback = samlCallbackUrl(ENV);
  // With openid-client's default scope ("openid") Jackson wants JWT signing
  // keys and sends an error back instead of going to Microsoft.
  const authorizeReq = {
    client_id: "dummy",
    tenant: TENANT,
    product: SAML_PRODUCT,
    redirect_uri: callback,
    response_type: "code",
    state: "nextauth-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  };
  const withOpenid = await jackson.oauthController.authorize({ ...authorizeReq, scope: "openid" });
  assert.equal(new URL(withOpenid.redirect_url).searchParams.get("error"), "server_error");

  const { redirect_url } = await jackson.oauthController.authorize({ ...authorizeReq, scope: "email profile" });
  const toIdp = new URL(redirect_url);
  assert.equal(toIdp.origin + toIdp.pathname, `https://login.microsoftonline.com/${TENANT}/saml2`);
  const relayState = toIdp.searchParams.get("RelayState");
  const authnRequest = await saml20.decodeBase64(toIdp.searchParams.get("SAMLRequest"), true);
  const requestId = /\bID="([^"]+)"/.exec(authnRequest)[1];
  assert.match(authnRequest, /AssertionConsumerServiceURL="http:\/\/localhost:3000\/api\/oauth\/saml"/);

  // 2. "Microsoft" signs a response with Entra's attribute names.
  const signed = await saml20.createSAMLResponse({
    audience: opts.samlAudience,
    issuer: idpEntityId,
    acsUrl: `${ENV.NEXTAUTH_URL}/api/oauth/saml`,
    requestId,
    claims: { email: "jane.doe@ngi.example", raw: entraRaw() },
    privateKey: idp.privateKey,
    publicKey: idp.publicKey,
  });
  const SAMLResponse = Buffer.from(signed).toString("base64");

  // A response nobody asked for (IdP-initiated) is refused.
  await assert.rejects(jackson.oauthController.samlResponse({ SAMLResponse, RelayState: "" }), (err) => {
    assert.equal(err.statusCode, 403);
    assert.match(err.internalError, /IdP \(Identity Provider\) flow has been disabled/);
    return true;
  });

  // 3. The ACS route hands it to Jackson; the browser goes back to NextAuth with a code.
  const back = await jackson.oauthController.samlResponse({ SAMLResponse, RelayState: relayState });
  const toNextAuth = new URL(back.redirect_url);
  assert.equal(toNextAuth.origin + toNextAuth.pathname, callback);
  assert.equal(toNextAuth.searchParams.get("state"), "nextauth-state");
  const code = toNextAuth.searchParams.get("code");

  // 4. NextAuth's server: code → token (wrong secret or verifier fails) → userinfo.
  const tokenReq = { code, grant_type: "authorization_code", client_id: "dummy", redirect_uri: callback, code_verifier: verifier };
  await assert.rejects(jackson.oauthController.token({ ...tokenReq, code_verifier: "wrong" }));
  const { access_token } = await exchangeCode(jackson.oauthController, { ...tokenReq, client_secret: ENV.SAML_JACKSON_CLIENT_SECRET_VERIFIER });
  const profile = await jackson.oauthController.userInfo(access_token);

  // 5. What the signIn callback gets: the same claims shape as OIDC, right tenant.
  const claims = claimsFromSamlProfile(profile);
  assert.equal(claims.tid, TENANT);
  assert.equal(claims.oid, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(claims.email.toLowerCase(), "jane.doe@ngi.example");
  assert.deepEqual(claims.groups, ["g-1", "g-2"]);
  assert.equal(samlTenantMatches(profile, claims), true);

  // The code works once only (exchangeCode works around Jackson keeping it).
  await assert.rejects(jackson.oauthController.token({ ...tokenReq, client_secret: ENV.SAML_JACKSON_CLIENT_SECRET_VERIFIER }));
});

test("a SAML app that asserts another tenant is refused by the tenant check", () => {
  const profile = { requested: { tenant: TENANT }, raw: entraRaw({ [ENTRA_SAML_CLAIMS.tenantId]: OTHER_TENANT }) };
  assert.equal(samlTenantMatches(profile, claimsFromSamlProfile(profile)), false);
});
