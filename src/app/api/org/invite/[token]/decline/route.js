import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req, { params }) {
  const { token } = await params;

  const invite = await prisma.organizationInvite.findUnique({ where: { token } });

  if (!invite || invite.acceptedAt || invite.declinedAt || invite.expiresAt < new Date())
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });

  await prisma.organizationInvite.update({
    where: { token },
    data: { declinedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
