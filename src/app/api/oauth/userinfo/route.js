import { NextResponse } from "next/server";
import { getJackson, jacksonError } from "@/lib/sso/jackson";

// EKP E-12: NextAuth's server reads the signed-in user's SAML attributes.

export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  try {
    const { oauthController } = await getJackson();
    return NextResponse.json(await oauthController.userInfo(token), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, message } = jacksonError(err);
    if (status >= 500) console.error("SAML userinfo failed:", err.message);
    return NextResponse.json({ error: "invalid_token", error_description: message }, { status });
  }
}
