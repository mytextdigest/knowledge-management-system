import { NextResponse } from "next/server";
import { getJackson, SamlUnavailable } from "@/lib/sso/jackson";
import { htmlResponse, readParams, signInError } from "@/lib/sso/jacksonRoutes";

// EKP E-12: start of a SAML sign-in. NextAuth's BoxyHQSAMLProvider sends the
// browser here; Jackson sends it on to the org's Microsoft Entra SAML app.

export const dynamic = "force-dynamic";

async function handle(req) {
  try {
    const { oauthController } = await getJackson();
    const { redirect_url, authorize_form, error } = await oauthController.authorize(await readParams(req));
    if (redirect_url) return NextResponse.redirect(redirect_url, 302);
    if (authorize_form) return htmlResponse(authorize_form);
    console.error("SAML authorize failed:", error);
  } catch (err) {
    if (!(err instanceof SamlUnavailable)) console.error("SAML authorize failed:", err.message);
  }
  return signInError(req);
}

export const GET = handle;
export const POST = handle;
