import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const invite = await prisma.organizationInvite.findUnique({ where: { token } });

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });

  // If already a member, just mark invite accepted
  const existing = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId: invite.orgId, userId: user.id } },
  });

  if (existing) {
    await prisma.organizationInvite.update({
      where: { token },
      data: { acceptedAt: new Date() },
    });
    return NextResponse.json({ orgId: invite.orgId, role: existing.role });
  }

  await prisma.$transaction([
    prisma.organizationMember.create({
      data: { orgId: invite.orgId, userId: user.id, role: invite.role },
    }),
    ...invite.departmentIds.map((departmentId) =>
      prisma.departmentMember.upsert({
        where: { departmentId_userId: { departmentId, userId: user.id } },
        update: { role: "admin" },
        create: { departmentId, userId: user.id, role: "admin" },
      })
    ),
    prisma.organizationInvite.update({
      where: { token },
      data: { acceptedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ orgId: invite.orgId, role: invite.role });
}
