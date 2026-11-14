import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { repositoryAccessWhere, getUserPrincipals } from "@/lib/access/documentAccess";

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { searchEventId, documentId } = body;
  const rank = Number(body.rank);
  if (typeof searchEventId !== "string" || typeof documentId !== "string" || !Number.isInteger(rank) || rank < 1 || rank > 200) {
    return NextResponse.json({ error: "Invalid click" }, { status: 400 });
  }
  const event = await prisma.searchEvent.findFirst({ where: { id: searchEventId, orgId, userId: user.id }, select: { id: true, resultCount: true } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (rank > event.resultCount) return NextResponse.json({ error: "Rank exceeds search results" }, { status: 400 });
  const memberships = await prisma.departmentMember.findMany({ where: { userId: user.id }, select: { departmentId: true, role: true } });
  const principals = await getUserPrincipals(prisma, user.id, { orgId });
  const access = repositoryAccessWhere({ orgId, role, userId: user.id,
    userDeptIds: memberships.map(m => m.departmentId),
    adminDeptIds: memberships.filter(m => m.role === "admin").map(m => m.departmentId), principals });
  const doc = await prisma.document.findFirst({ where: { AND: [{ id: documentId, orgId, deletedAt: null }, access] }, select: { id: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const click = await prisma.searchClick.create({ data: { searchEventId, documentId, rank }, select: { id: true } });
    return NextResponse.json({ clickId: click.id });
  } catch {
    return NextResponse.json({ error: "Telemetry unavailable" }, { status: 503 });
  }
}
