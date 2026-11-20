import { NextResponse } from "next/server";
import { getJackson } from "@/lib/sso/jackson";
import { htmlResponse, readParams, signInError } from "@/lib/sso/jacksonRoutes";

// EKP E-12: the Reply URL (Assertion Consumer Service). Microsoft posts the
// signed SAML response here through the user's browser. Jackson checks the
// signature against the org's uploaded metadata, then returns the browser to
// NextAuth's callback with a one-time code.
//
// Only logins started from KMS are accepted (idpEnabled: false): a response
// without KMS's RelayState is refused by Jackson.

export const dynamic = "force-dynamic";

export async function POST(req) {
  const { SAMLResponse, RelayState } = await readParams(req);
  if (!SAMLResponse) return signInError(req);
  if (!RelayState) return signInError(req, "SamlStartAtKms");
  try {
    const { oauthController } = await getJackson();
    const { redirect_url, response_form, error } = await oauthController.samlResponse({ SAMLResponse, RelayState });
    if (redirect_url) return NextResponse.redirect(redirect_url, 302);
    if (response_form) return htmlResponse(response_form);
    console.error("SAML response failed:", error);
  } catch (err) {
    console.error("SAML response failed:", err.message);
  }
  return signInError(req);
}
