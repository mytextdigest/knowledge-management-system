import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, canManageDepartment } from "@/lib/orgGuard";

// allowed[currentState][targetState] = roles permitted to make that transition
const ALLOWED_TRANSITIONS = {
  draft: {
    published: ["super_admin", "dept_admin"],
  },
  published: {
    archived: ["super_admin", "dept_admin"],
    retired:  ["super_admin"],
    draft:    ["super_admin"],
  },
  archived: {
    retired:   ["super_admin"],
    published: ["super_admin"],
    draft:     ["super_admin"],
  },
  retired: {
    published: ["super_admin"],
    draft:     ["super_admin"],
  },
};

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const newState = body?.lifecycle;
  if (!newState)
    return NextResponse.json({ error: "lifecycle is required" }, { status: 400 });

  // Lifecycle management only applies to repository-scoped documents
  const doc = await prisma.document.findFirst({
    where: { id, scope: "repository" },
    select: { id: true, orgId: true, departmentId: true, lifecycle: true },
  });
  if (!doc || !doc.orgId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const permittedRoles = ALLOWED_TRANSITIONS[doc.lifecycle]?.[newState];
  if (!permittedRoles) {
    return NextResponse.json(
      { error: `Invalid transition: ${doc.lifecycle} → ${newState}` },
      { status: 400 }
    );
  }
  if (!permittedRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // dept_admin can only transition documents in a department they administer;
  // org-wide documents (departmentId null) require super_admin
  if (role === "dept_admin") {
    const allowed = doc.departmentId && (await canManageDepartment(role, doc.departmentId, user.id));
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { lifecycle: newState },
    select: { id: true, lifecycle: true },
  });

  return NextResponse.json(updated);
}
