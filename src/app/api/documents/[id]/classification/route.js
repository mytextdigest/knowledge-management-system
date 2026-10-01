import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";

async function resolveManagedDocument(id, email) {
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, userId: true, orgId: true, departmentId: true, project: { select: { orgId: true } } },
  });
  if (!doc) return null;
  const orgId = doc.orgId || doc.project?.orgId;
  const { user, role } = await resolveOrgRole(email, orgId || "");
  if (!user || (!isOrgAdmin(role) && doc.userId !== user.id)) return null;
  return { doc, user, role, orgId };
}

// Accept/correct classification signals or dismiss lifecycle suggestions.
export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await resolveManagedDocument(id, session.user.email);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data = {};
  if (Object.hasOwn(body, "category")) {
    data.category = body.category || null;
    data.categoryConfidence = body.category ? 1 : null;
  }
  if (Object.hasOwn(body, "departmentId")) {
    if (body.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: body.departmentId, orgId: access.orgId },
        select: { id: true },
      });
      if (!department) return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }
    data.departmentId = body.departmentId || null;
    data.suggestedDepartmentId = null;
    data.departmentSuggestionConfidence = null;
  }
  if (body.dismissLifecycleSuggestion === true) {
    data.lifecycleSuggestion = null;
    data.lifecycleSuggestionReason = null;
    data.lifecycleSuggestedAt = null;
    data.lifecycleSuggestionDismissedAt = new Date();
  }
  if (body.classificationStatus === "published" || body.classificationStatus === "needs_review") {
    data.classificationStatus = body.classificationStatus;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "No supported changes" }, { status: 400 });

  const updated = await prisma.document.update({
    where: { id },
    data,
    select: {
      id: true, category: true, categoryConfidence: true, classificationStatus: true,
      departmentId: true, suggestedDepartmentId: true, departmentSuggestionConfidence: true,
      lifecycleSuggestion: true, lifecycleSuggestionReason: true,
    },
  });
  return NextResponse.json(updated);
}
