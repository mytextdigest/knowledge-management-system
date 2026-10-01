import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACTIVE_ORG_COOKIE, ACTIVE_ORG_COOKIE_OPTIONS } from "@/lib/activeOrgCookie";

export async function GET(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  const member = await prisma.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.user.id } },
  });

  if (!member) {
    return NextResponse.redirect(new URL("/welcome-back", req.url));
  }

  const res = NextResponse.redirect(new URL(`/org/${orgId}`, req.url));
  res.cookies.set(ACTIVE_ORG_COOKIE, orgId, ACTIVE_ORG_COOKIE_OPTIONS);
  return res;
}
