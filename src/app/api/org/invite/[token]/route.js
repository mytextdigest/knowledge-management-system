import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req, { params }) {
  const { token } = await params;

  const invite = await prisma.organizationInvite.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });

  return NextResponse.json({
    orgId: invite.orgId,
    orgName: invite.organization.name,
    role: invite.role,
    email: invite.email,
  });
}
