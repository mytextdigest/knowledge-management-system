import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { transporter } from "@/lib/mailer";
import { resolveOrgRole } from "@/lib/orgGuard";
import crypto from "crypto";

const VALID_ROLES = ["dept_admin", "employee", "guest"];

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (role !== "super_admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email, role = "employee" } = await req.json();
  if (!email?.trim())
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!VALID_ROLES.includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.organizationInvite.create({
    data: {
      orgId,
      email: email.trim().toLowerCase(),
      role,
      token,
      expiresAt,
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  await transporter.sendMail({
    from: `"KMS" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `You've been invited to join ${org.name} on KMS`,
    html: `
      <p>You've been invited to join <strong>${org.name}</strong> as <strong>${role.replace("_", " ")}</strong>.</p>
      <p><a href="${appUrl}/org/invite/${token}" style="padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Accept Invitation</a></p>
      <p style="color:#6b7280;font-size:14px;">This invite expires in 7 days. If you didn't expect this, you can ignore it.</p>
    `,
  });

  return NextResponse.json({ ok: true });
}
