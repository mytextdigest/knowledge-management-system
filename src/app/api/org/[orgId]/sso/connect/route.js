import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { buildAdminConsentUrl } from "@/lib/sso/entraAdmin";
import { encryptJson } from "@/lib/crypto";

// EKP A-5: starts "Connect Microsoft". Sends the super_admin to Microsoft's
// admin-consent page for the KMS Sign-in app (hop 1 of 2, see
// src/lib/sso/entraAdmin.js); nothing is written here.
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
    userId: user.id,
    step: "consent",
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  });

  return NextResponse.redirect(buildAdminConsentUrl({ state }));
}
