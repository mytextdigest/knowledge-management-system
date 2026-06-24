import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";

const PAGE_SIZE = 20;

const FILE_TYPE_EXTS = {
  pdf: [".pdf"],
  spreadsheet: [".xlsx", ".xls", ".csv"],
  text: [".txt", ".docx", ".doc", ".md"],
};

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const deptFilter =
  searchParams.get("departmentId") ||
  searchParams.get("dept") ||
  null;
  const category    = searchParams.get("category")  || null;
  const lifecycle   = searchParams.get("lifecycle") || null;
  const fileType    = searchParams.get("fileType")  || null;
  const dateFrom    = searchParams.get("dateFrom")  || null;
  const dateTo      = searchParams.get("dateTo")    || null;
  const page        = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // Resolve user's department memberships for RBAC
  const memberships = await prisma.departmentMember.findMany({
    where: { userId: user.id },
    select: { departmentId: true },
  });
  const userDeptIds = memberships.map((m) => m.departmentId);

  // Source A: documents directly scoped to the org repository
  // User can see org-wide docs (no dept) or docs in their own depts
  const sourceA = {
    scope: "repository",
    orgId,
    OR: [
      { departmentId: null },
      { departmentId: { in: userDeptIds } },
    ],
  };

  // Source B: documents from projects promoted to org scope
  const sourceB = {
    project: { scope: "org", orgId },
  };

  const andConditions = [{ OR: [sourceA, sourceB] }];

  // Non-admins cannot see draft docs
  if (lifecycle) {
    andConditions.push({ lifecycle });
  } else if (!isOrgAdmin(role)) {
    andConditions.push({ lifecycle: { not: "draft" } });
  }

  if (category) andConditions.push({ category });
  if (deptFilter) andConditions.push({ departmentId: deptFilter });

  if (dateFrom || dateTo) {
    andConditions.push({
      createdAt: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo) }   : {}),
      },
    });
  }

  const extList = fileType && fileType !== "all" ? FILE_TYPE_EXTS[fileType] : null;
  if (extList) {
    andConditions.push({
      OR: extList.map((ext) => ({
        filename: { endsWith: ext, mode: "insensitive" },
      })),
    });
  }

  const where = { AND: andConditions };

  const [docs, total] = await Promise.all([
    prisma.document.findMany({
      where,
      select: {
        id: true,
        filename: true,
        status: true,
        scope: true,
        lifecycle: true,
        category: true,
        orgId: true,
        departmentId: true,
        createdAt: true,
        user:       { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
        project:    { select: { id: true, name: true, scope: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    documents: docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}
