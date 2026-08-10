import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// FR-5 — Needs-Review Queue: every document awaiting confirmation, manual
// upload and SharePoint-synced alike, in one source-agnostic list. Viewing
// is super_admin-only, same as connector setup (NFR in requirements doc).
//
// Classification's signals (categoryConfidence, classificationStatus,
// DocumentDuplicate) aren't in the schema yet — Rank 4 hasn't merged — so
// the manual-upload half of this queue is currently always empty. Once it
// merges, add an OR branch here:
//   OR: [{ lifecycle: "draft" }, { classificationStatus: "needs_review" }]
// and include categoryConfidence/duplicate info in `select` below. Until
// then this only surfaces connector-synced documents, which is exactly what
// `lifecycle: "draft"` means today (see worker/index.js's syncOneFile).
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
    lifecycle: "draft",
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
      createdAt: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    documents: documents.map((d) => ({
      id: d.id,
      filename: d.filename,
      source: d.sourceProvider === "manual" ? "manual" : d.sourceProvider,
      processingStatus: d.status,
      suggestedCategory: d.category, // stub — real value comes from Rank 4's classification once merged
      duplicateFlag: null, // stub — DocumentDuplicate isn't in the schema yet
      departmentId: d.departmentId,
      departmentName: d.department?.name || null,
      createdAt: d.createdAt,
    })),
  });
}
