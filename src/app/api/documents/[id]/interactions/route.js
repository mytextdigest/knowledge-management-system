import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

async function hasDepartmentAccess(userId, departmentId) {
  if (!departmentId) return true;
  const membership = await prisma.departmentMember.findUnique({
    where: { departmentId_userId: { departmentId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const type = ["download", "study_duration"].includes(body.type) ? body.type : "view";

  // Only meaningful for study_duration; clamped defensively server-side too,
  // not just in the client timer, since the client can't be fully trusted -
  // floor of 15s filters bounces, ceiling of 20 minutes stops a single
  // idle-open tab from dominating the expertise signal.
  let durationSeconds = null;
  if (type === "study_duration") {
    const raw = Number(body.durationSeconds);
    if (!Number.isFinite(raw) || raw < 15) {
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }
    durationSeconds = Math.min(1200, Math.round(raw));
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      orgId: true,
      userId: true,
      scope: true,
      lifecycle: true,
      departmentId: true,
      project: {
        select: { id: true, orgId: true, departmentId: true, userId: true, scope: true },
      },
    },
  });
  const orgId = doc?.orgId || doc?.project?.orgId;
  if (!doc || !orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { role } = await resolveOrgRole(session.user.email, orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Match the knowledge/retrieval RBAC boundary rather than treating every
  // org-level admin as implicitly able to view every department/project.
  // This prevents forged interaction events for documents the caller cannot
  // actually reach through normal product surfaces.
  let canAccess = doc.userId === user.id || isSuperAdmin(role);
  if (!canAccess && doc.scope === "repository" && doc.lifecycle === "published") {
    canAccess = await hasDepartmentAccess(user.id, doc.departmentId);
  }
  if (!canAccess && doc.project) {
    canAccess = doc.project.userId === user.id || (
      doc.project.scope === "org" && await hasDepartmentAccess(user.id, doc.project.departmentId)
    );
  }
  if (!canAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.documentInteraction.create({
    data: { documentId: id, userId: user.id, orgId, type, durationSeconds },
  });
  return NextResponse.json({ success: true }, { status: 201 });
}
