import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { buildDelegatedAuthorizeUrl } from "@/lib/msGraph";
import { encryptJson } from "@/lib/crypto";

// Kicks off the one-time delegated setup step (FR-2). Redirects the admin to
// Microsoft's consent screen; nothing is written to the DB here.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const state = encryptJson({
    orgId,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  });

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/sharepoint/callback`;
  const authorizeUrl = buildDelegatedAuthorizeUrl({ state, redirectUri });

  return NextResponse.redirect(authorizeUrl);
}
