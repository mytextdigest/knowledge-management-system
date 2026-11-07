import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

async function actor(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, role };
}
export async function GET(_req, { params }) {
  const { orgId } = await params;
  const a = await actor(orgId); if (a.error) return a.error;
  const sets = await prisma.termSet.findMany({ where: { orgId }, include: { terms: { select: { id: true, label: true, parentId: true, description: true, status: true, depth: true, sortOrder: true }, orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { label: "asc" }] } }, orderBy: { name: "asc" } });
  return NextResponse.json({ sets });
}
export async function POST(req, { params }) {
  const { orgId } = await params;
  const a = await actor(orgId); if (a.error) return a.error;
  if (!isSuperAdmin(a.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  try {
    const set = await prisma.$transaction(async tx => {
      const created = await tx.termSet.create({ data: { orgId, name, description: typeof body.description === "string" ? body.description.slice(0, 1000) : null, createdById: a.user.id } });
      await tx.auditLog.create({ data: { orgId, actorUserId: a.user.id, action: "taxonomy.term_set.created", entityType: "TermSet", entityId: created.id, after: { name } } });
      return created;
    });
    return NextResponse.json({ set }, { status: 201 });
  } catch (e) { if (e.code === "P2002") return NextResponse.json({ error: "Name already exists" }, { status: 409 }); throw e; }
}
