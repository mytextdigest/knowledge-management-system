import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

const PAGE_SIZE = 25;

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const outcome = searchParams.get("outcome");

  const where = {
    orgId,
    ...(outcome === "answered" || outcome === "denied" ? { outcome } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.chatAuditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.chatAuditLog.count({ where }),
  ]);

  const docIds = [...new Set(rows.flatMap((r) => r.citedDocIds))];
  const docs = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, filename: true },
      })
    : [];
  const docNameById = new Map(docs.map((d) => [d.id, d.filename]));

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      question: r.question,
      outcome: r.outcome,
      citedDocs: r.citedDocIds.map((id) => docNameById.get(id) || id),
      user: { name: r.user?.name || null, email: r.user?.email || null },
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
