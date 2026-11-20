// EKP E-12: sends the browser to Microsoft the way the user's org has chosen:
// SAML (the org's own Entra SAML app, through SAML Jackson) or OIDC (the KMS
// Sign-in app). `target` comes from /api/auth/sso-discovery or the sign-up
// conflict response: { protocol, samlTenant }. Client-side only.

import { signIn } from "next-auth/react";
import { SAML_PRODUCT, SAML_PROVIDER_ID } from "@/lib/sso/samlClaims";

export function startMicrosoftSignIn({ callbackUrl, email, target } = {}) {
  const hint = email ? { login_hint: email } : {};
  if (target?.protocol === "saml" && target.samlTenant) {
    return signIn(SAML_PROVIDER_ID, { callbackUrl }, { tenant: target.samlTenant, product: SAML_PRODUCT, ...hint });
  }
  return signIn("azure-ad", { callbackUrl }, email ? hint : undefined);
}
