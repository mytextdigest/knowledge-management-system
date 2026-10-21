import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

const PAGE_SIZE = 25;

// Security/administrative events (role grants, department delete/rename,
// etc) — distinct from the chat-query audit log at /audit-log, which
// tracks Org Chat questions and access decisions, not admin actions.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { orgId },
      include: {
        actor: { select: { name: true, email: true } },
        target: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where: { orgId } }),
  ]);

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      metadata: r.metadata,
      actor: r.actor ? { name: r.actor.name, email: r.actor.email } : null,
      target: r.target ? { name: r.target.name, email: r.target.email } : null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
