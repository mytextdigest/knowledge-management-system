import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// FR-5 — Needs-Review Queue: every document awaiting confirmation, manual
// upload and SharePoint-synced alike, in one source-agnostic list. Viewing
// is super_admin-only, same as connector setup (NFR in requirements doc).
//
// 7-J: a document can be awaiting review for either reason, independently —
// a connector-synced file not yet confirmed (`lifecycle: "draft"`) or a
// manual/synced upload classification flagged (`classificationStatus:
// "needs_review"`, set by worker/classify.js, Rank 4). Both surface here.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source"); // "manual" | "sharepoint" | null (all)
  const departmentId = searchParams.get("departmentId");

  const where = {
    orgId,
    scope: "repository",
    OR: [{ lifecycle: "draft" }, { classificationStatus: "needs_review" }],
    ...(source ? { sourceProvider: source } : {}),
    ...(departmentId ? { departmentId } : {}),
  };

  const documents = await prisma.document.findMany({
    where,
    select: {
      id: true,
      filename: true,
      sourceProvider: true,
      status: true,
      category: true,
      classificationStatus: true,
      categoryConfidence: true,
      departmentSuggestionConfidence: true,
      createdAt: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      suggestedDepartment: { select: { id: true, name: true } },
      duplicatesAsDocument: {
        where: { status: "pending" },
        select: { id: true, similarity: true, duplicateOf: { select: { id: true, filename: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    documents: documents.map((d) => {
      const duplicate = d.duplicatesAsDocument[0];
      return {
        id: d.id,
        filename: d.filename,
        source: d.sourceProvider === "manual" ? "manual" : d.sourceProvider,
        processingStatus: d.status,
        classificationStatus: d.classificationStatus,
        suggestedCategory: d.category,
        categoryConfidence: d.categoryConfidence,
        suggestedDepartment: d.suggestedDepartment,
        departmentSuggestionConfidence: d.departmentSuggestionConfidence,
        duplicateFlag: duplicate
          ? { id: duplicate.id, similarity: duplicate.similarity, duplicateOfFilename: duplicate.duplicateOf?.filename || null }
          : null,
        departmentId: d.departmentId,
        departmentName: d.department?.name || null,
        createdAt: d.createdAt,
      };
    }),
  });
}
