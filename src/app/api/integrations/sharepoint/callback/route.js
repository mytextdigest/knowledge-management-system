import { NextResponse } from "next/server";
import { exchangeDelegatedCode } from "@/lib/msGraph";
import { decryptJson } from "@/lib/crypto";
import { setSetupCookie } from "@/lib/integrationSetup";

// Fixed path — must exactly match the redirect URI registered on the shared
// multitenant Entra app. Not org-scoped in the URL (Microsoft doesn't know
// our routing); orgId travels in the encrypted `state` param instead.
export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Microsoft echoes `state` back even on error, so try to recover orgId
  // before deciding where to send the error — falls back to the root only
  // if state itself is missing or unreadable.
  let orgId = null;
  if (state) {
    try {
      ({ orgId } = decryptJson(state));
    } catch {
      orgId = null;
    }
  }

  if (oauthError) {
    const target = orgId
      ? `${appUrl}/org/${orgId}/integrations/sharepoint?error=${encodeURIComponent(oauthError)}`
      : `${appUrl}/?sharepoint_error=${encodeURIComponent(oauthError)}`;
    return NextResponse.redirect(target);
  }
  if (!code || !orgId) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const redirectUri = `${appUrl}/api/integrations/sharepoint/callback`;
  let exchanged;
  try {
    exchanged = await exchangeDelegatedCode({ code, redirectUri });
  } catch (err) {
    return NextResponse.redirect(
      `${appUrl}/org/${orgId}/integrations/sharepoint?error=${encodeURIComponent(err.message)}`
    );
  }

  await setSetupCookie({ orgId, ...exchanged });

  return NextResponse.redirect(`${appUrl}/org/${orgId}/integrations/sharepoint?step=picker`);
}
