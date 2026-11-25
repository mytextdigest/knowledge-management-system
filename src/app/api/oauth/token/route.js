import { NextResponse } from "next/server";
import { exchangeCode, getJacksonForSignIn, jacksonError } from "@/lib/sso/jackson";
import { readParams } from "@/lib/sso/jacksonRoutes";

// EKP E-12: NextAuth's server swaps the one-time code for a token (PKCE and
// SAML_JACKSON_CLIENT_SECRET_VERIFIER checked by Jackson).

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const params = await readParams(req);
    // Client credentials may come as HTTP Basic auth instead of in the body.
    const basic = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
    if (basic && !params.client_secret) {
      const decoded = Buffer.from(basic, "base64").toString();
      const i = decoded.indexOf(":");
      params.client_id ??= decodeURIComponent(decoded.slice(0, i));
      params.client_secret = decodeURIComponent(decoded.slice(i + 1));
    }
    const { oauthController } = await getJacksonForSignIn();
    return NextResponse.json(await exchangeCode(oauthController, params), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, message } = jacksonError(err);
    if (status >= 500) console.error("SAML token failed:", err.message);
    return NextResponse.json({ error: "invalid_grant", error_description: message }, { status });
  }
}
