// A-5: Microsoft sign-in settings validation (src/lib/sso/ssoSettings.js) and
// the connect URL. Run: npm run ekp:a1:test
import test from "node:test";
import assert from "node:assert/strict";
import { validateSsoSettingsPatch, serializeSsoConfig } from "../../src/lib/sso/ssoSettings.js";

const config = {
  enabled: true,
  verifiedDomains: ["nypa.gov", "nypa.onmicrosoft.com"],
  allowedDomains: ["nypa.gov"],
  provisioning: "auto",
  passwordLogin: "admins_only",
};

test("only the tenant's verified domains can be allowed", () => {
  assert.deepEqual(validateSsoSettingsPatch({ allowedDomains: [" NYPA.gov ", "nypa.gov", "nypa.onmicrosoft.com"] }, config).data,
    { allowedDomains: ["nypa.gov", "nypa.onmicrosoft.com"] });
  assert.match(validateSsoSettingsPatch({ allowedDomains: ["gmail.com"] }, config).error, /gmail\.com/);
  assert.match(validateSsoSettingsPatch({ allowedDomains: "nypa.gov" }, config).error, /list/);
});

test("enum and boolean fields are validated", () => {
  assert.deepEqual(validateSsoSettingsPatch({ provisioning: "invite_only", passwordLogin: "all", enabled: false }, config).data,
    { provisioning: "invite_only", passwordLogin: "all", enabled: false });
  assert.ok(validateSsoSettingsPatch({ provisioning: "everyone" }, config).error);
  assert.ok(validateSsoSettingsPatch({ passwordLogin: "none" }, config).error);
  assert.ok(validateSsoSettingsPatch({ enabled: "yes" }, config).error);
});

test("sign-in can't be on with no domains", () => {
  assert.match(validateSsoSettingsPatch({ allowedDomains: [] }, config).error, /at least one domain/);
  assert.deepEqual(validateSsoSettingsPatch({ allowedDomains: [], enabled: false }, config).data, { allowedDomains: [], enabled: false });
});

test("unknown fields are ignored", () => {
  assert.deepEqual(validateSsoSettingsPatch({ tenantId: "evil", orgId: "x" }, config).data, {});
});

test("serialize hides nothing it shouldn't and reports not connected", () => {
  assert.deepEqual(serializeSsoConfig(null), { connected: false });
  assert.equal(serializeSsoConfig({ ...config, tenantId: "t", orgId: "o", id: "i" }).orgId, undefined);
});

test("connect uses the admin-consent endpoint, then signs in to that tenant", async () => {
  process.env.ENTRA_SSO_CLIENT_ID = "client-123";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const { buildAdminConsentUrl, buildTenantSignInUrl } = await import("../../src/lib/sso/entraAdmin.js");
  const callback = "http://localhost:3000/api/integrations/entra-sso/callback";

  const consent = new URL(buildAdminConsentUrl({ state: "s1" }));
  assert.equal(consent.origin + consent.pathname, "https://login.microsoftonline.com/organizations/v2.0/adminconsent");
  assert.equal(consent.searchParams.get("client_id"), "client-123");
  assert.equal(consent.searchParams.get("redirect_uri"), callback);
  assert.equal(consent.searchParams.get("scope"), "https://graph.microsoft.com/.default");
  assert.equal(consent.searchParams.get("prompt"), null, "prompt=admin_consent is rejected by Microsoft (AADSTS901001)");

  const signin = new URL(buildTenantSignInUrl({ state: "s2", tenantId: "tenant-abc" }));
  assert.equal(signin.origin + signin.pathname, "https://login.microsoftonline.com/tenant-abc/oauth2/v2.0/authorize");
  assert.equal(signin.searchParams.get("response_type"), "code");
  assert.equal(signin.searchParams.get("redirect_uri"), callback);
  assert.equal(signin.searchParams.get("scope"), "openid profile email User.Read");
  assert.equal(signin.searchParams.get("prompt"), null);
});
