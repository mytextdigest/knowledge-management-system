import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveOrgRole } from "@/lib/orgGuard";
import { filterAccessibleDocuments } from "@/lib/documentAccess";

// FR-P2-7: simple ordered timeline of decision dates extracted for this
// department's documents (see worker/index.js's processSummarizationJob).
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, deptId } = await params;

  const department = await prisma.department.findFirst({
    where: { id: deptId, orgId },
    select: { id: true },
  });
  if (!department) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events = await prisma.timelineEvent.findMany({
    where: { departmentId: deptId },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      occurredAt: true,
      description: true,
      documentId: true,
      decision: { select: { rationale: true } },
      document: {
        select: { id: true, filename: true, userId: true, departmentId: true, lifecycle: true },
      },
    },
  });

  // A decision's timeline entry must respect the same document-level access
  // rules as the document itself — a user shouldn't see a decision extracted
  // from a document they can't otherwise access.
  const accessibleDocs = await filterAccessibleDocuments(
    events.map((e) => e.document).filter(Boolean),
    { userId: user.id, role }
  );
  const accessibleDocIds = new Set(accessibleDocs.map((d) => d.id));

  const visible = events
    .filter((e) => !e.documentId || accessibleDocIds.has(e.documentId))
    .map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt.toISOString(),
      description: e.description,
      rationale: e.decision?.rationale ?? null,
      documentId: e.documentId,
      documentFilename: e.document?.filename ?? null,
    }));

  return NextResponse.json(visible);
}
