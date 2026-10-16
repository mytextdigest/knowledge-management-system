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

test("connect URL asks for org-wide admin approval with sign-in scopes only", async () => {
  process.env.ENTRA_SSO_CLIENT_ID = "client-123";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const { buildSsoConnectUrl } = await import("../../src/lib/sso/entraAdmin.js");
  const url = new URL(buildSsoConnectUrl({ state: "s" }));
  assert.equal(url.origin + url.pathname, "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize");
  assert.equal(url.searchParams.get("prompt"), "admin_consent");
  assert.equal(url.searchParams.get("client_id"), "client-123");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/integrations/entra-sso/callback");
  assert.equal(url.searchParams.get("scope"), "openid profile email User.Read");
});
