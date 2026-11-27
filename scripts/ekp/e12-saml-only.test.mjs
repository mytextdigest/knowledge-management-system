// EKP E-12 follow-up: SAML-only setup (no consent to the KMS Sign-in app),
// domain proof through Microsoft's public endpoints, and "an org set to SAML
// signs in only through SAML". No database, no network (Microsoft's answers
// are mocked).
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CONSUMER_TENANT_ID,
  normalizeDomain,
  verifyDomainForTenant,
  verifyDomainsForTenant,
} from "../../src/lib/sso/domainCheck.js";
import { resolveEntraSignIn, SsoError, SSO_ERRORS } from "../../src/lib/sso/entra.js";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

// Microsoft's two public endpoints, answered from a table: domain → { tenant, ns, viral }.
function fakeMicrosoft(table, { failFor } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (failFor && url.includes(failFor)) throw new Error("network down");
    if (u.pathname.endsWith("/getuserrealm.srf")) {
      const domain = u.searchParams.get("login").split("@")[1];
      const row = table[domain];
      return { json: async () => ({ NameSpaceType: row?.ns ?? "Unknown", ...(row?.viral ? { IsViral: true } : {}) }) };
    }
    const domain = decodeURIComponent(u.pathname.split("/")[1]);
    const row = table[domain];
    return {
      json: async () =>
        row?.tenant
          ? { issuer: `https://login.microsoftonline.com/${row.tenant}/v2.0` }
          : { error: "invalid_tenant", error_description: "AADSTS90002: Tenant not found." },
    };
  };
  return { fetchImpl, calls };
}

const MS = fakeMicrosoft({
  "contoso.com": { tenant: TENANT, ns: "Managed" },
  "contoso.org": { tenant: TENANT, ns: "Federated" },
  "fabrikam.com": { tenant: OTHER, ns: "Managed" },
  "unmanaged.com": { tenant: TENANT, ns: "Unknown" },
  "viral.com": { tenant: TENANT, ns: "Managed", viral: true },
  "personal.com": { tenant: CONSUMER_TENANT_ID, ns: "Managed" },
});

test("domains are normalized; emails and @domain work; junk is refused", () => {
  assert.equal(normalizeDomain("  Contoso.COM "), "contoso.com");
  assert.equal(normalizeDomain("jane@contoso.com"), "contoso.com");
  assert.equal(normalizeDomain("@contoso.com."), "contoso.com");
  assert.equal(normalizeDomain("sub.dept.contoso.co.uk"), "sub.dept.contoso.co.uk");
  for (const bad of ["", "contoso", "contoso..com", "-contoso.com", "http://contoso.com", "contoso.com/x", "con toso.com"]) {
    assert.equal(normalizeDomain(bad), null, bad);
  }
});

test("a domain verified (Managed or Federated) in the SAML app's tenant is accepted", async () => {
  assert.deepEqual(await verifyDomainForTenant("contoso.com", TENANT, MS), { domain: "contoso.com" });
  assert.deepEqual(await verifyDomainForTenant("Jane@Contoso.org", TENANT.toUpperCase(), MS), { domain: "contoso.org" });
});

test("domains of another tenant, of no tenant, unmanaged, viral or personal are refused", async () => {
  assert.match((await verifyDomainForTenant("fabrikam.com", TENANT, MS)).error, /different Microsoft organization/);
  assert.match((await verifyDomainForTenant("nowhere.com", TENANT, MS)).error, /isn't a verified domain in any Microsoft organization/);
  assert.match((await verifyDomainForTenant("unmanaged.com", TENANT, MS)).error, /isn't managed/);
  assert.match((await verifyDomainForTenant("viral.com", TENANT, MS)).error, /isn't managed/);
  assert.match((await verifyDomainForTenant("personal.com", TENANT, MS)).error, /isn't a verified domain/);
  assert.match((await verifyDomainForTenant("not a domain", TENANT, MS)).error, /isn't a valid email domain/);
});

test("public email domains are refused without asking Microsoft", async () => {
  const ms = fakeMicrosoft({});
  for (const d of ["gmail.com", "outlook.com", "hotmail.com", "live.com"]) {
    assert.match((await verifyDomainForTenant(d, TENANT, ms)).error, /public email domain/);
  }
  assert.equal(ms.calls.length, 0);
});

test("Microsoft unreachable: a clear error, nothing accepted", async () => {
  const ms = fakeMicrosoft({ "contoso.com": { tenant: TENANT, ns: "Managed" } }, { failFor: "getuserrealm" });
  assert.match((await verifyDomainForTenant("contoso.com", TENANT, ms)).error, /Couldn't check contoso\.com/);
});

test("several domains: all must pass; duplicates folded; at least one needed", async () => {
  assert.deepEqual(await verifyDomainsForTenant(["contoso.com", "CONTOSO.com", "jane@contoso.org"], TENANT, MS), {
    domains: ["contoso.com", "contoso.org"],
  });
  assert.match((await verifyDomainsForTenant(["contoso.com", "fabrikam.com"], TENANT, MS)).error, /fabrikam\.com belongs to a different/);
  assert.match((await verifyDomainsForTenant([], TENANT, MS)).error, /at least one/);
  assert.match((await verifyDomainsForTenant(" ", TENANT, MS)).error, /at least one/);
});

// ---- An org set to SAML signs in only through SAML ----

// A db where only the config lookup works: anything later would throw.
function dbWithConfig(config) {
  const fail = () => {
    throw new Error("must not get this far");
  };
  return {
    orgSsoConfig: { findUnique: async () => config },
    userIdentity: { findUnique: fail, upsert: fail },
    user: { findUnique: fail, create: fail, update: fail },
    organizationMember: { findUnique: fail, create: fail },
    organizationInvite: { findFirst: fail },
  };
}
const claims = { tid: TENANT, oid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", email: "jane@elsewhere.example" };
const samlOrg = { orgId: "org1", tenantId: TENANT, protocol: "saml", enabled: true, allowedDomains: ["contoso.com"] };

test("OIDC sign-in for an org set to SAML is refused before anything is created", async () => {
  await assert.rejects(resolveEntraSignIn(claims, { db: dbWithConfig(samlOrg) }), (err) => {
    assert.ok(err instanceof SsoError);
    assert.equal(err.code, SSO_ERRORS.USE_SAML);
    return true;
  });
  await assert.rejects(resolveEntraSignIn(claims, { db: dbWithConfig(samlOrg), protocol: "oidc" }), { code: SSO_ERRORS.USE_SAML });
});

test("SAML sign-in for that org passes the protocol check (then the usual checks run)", async () => {
  await assert.rejects(resolveEntraSignIn(claims, { db: dbWithConfig(samlOrg), protocol: "saml" }), {
    code: SSO_ERRORS.DOMAIN_NOT_ALLOWED,
  });
  // An org on OIDC still takes OIDC.
  await assert.rejects(resolveEntraSignIn(claims, { db: dbWithConfig({ ...samlOrg, protocol: "oidc" }), protocol: "oidc" }), {
    code: SSO_ERRORS.DOMAIN_NOT_ALLOWED,
  });
});

// ---- Wiring ----

test("SAML-only setup, domain adding, consent gating and the page", () => {
  const saml = read("src/app/api/org/[orgId]/sso/saml/route.js");
  assert.match(saml, /tenantIdFromEntraEntityId\(entityIdFromMetadata\(metadataXml\)\)/, "tenant from the metadata");
  assert.match(saml, /verifyDomainsForTenant\(body\.domains, tenantId\)/);
  assert.match(saml, /already connected to another KMS organization/);
  assert.match(saml, /protocol: "saml", verifiedDomains: domains, allowedDomains: domains/);
  assert.match(saml, /method: "saml_metadata"/);
  assert.match(saml, /hasSignInAppConsent\(config\.tenantId\)[\s\S]*orgSsoConfig\.delete/, "removing the only sign-in method removes the setup");

  assert.match(read("src/app/api/org/[orgId]/sso/domains/route.js"), /verifyDomainForTenant\(input, config\.tenantId\)/);

  const sso = read("src/app/api/org/[orgId]/sso/route.js");
  assert.match(sso, /signInAppConsent,/);
  assert.match(sso, /data\.protocol === "oidc" && !\(await hasSignInAppConsent\(config\.tenantId\)\)/);

  const page = read("src/app/(app)/org/[orgId]/integrations/microsoft-sso/page.jsx");
  assert.match(page, /<SamlOnlySetup /);
  assert.match(page, /<AddDomain/);
  assert.match(page, /canSearch=\{config\.signInAppConsent\}/);
  assert.match(page, /disabled=\{!signInAppConsent\}/);

  assert.match(read("src/components/auth/SigninPageInner.jsx"), /SsoUseSaml:/);
});
