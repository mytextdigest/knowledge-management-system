import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { canInteractWithDocument } from "@/lib/access/documentAccess";

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
  let tooShortForInteraction = false;
  if (type === "study_duration") {
    const raw = Number(body.durationSeconds);
    if (!Number.isFinite(raw) || raw < 1) {
      return NextResponse.json({ success: true, ignored: true }, { status: 200 });
    }
    tooShortForInteraction = raw < 15;
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
  const canAccess = await canInteractWithDocument(doc, { userId: user.id, isSuperAdmin: isSuperAdmin(role) });
  if (!canAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // E30.3: reading time after a search click. Short visits count here (they
  // are the signal), capped at 1,200 s in total like the interaction timer.
  const searchClickId = typeof body.searchClickId === "string" ? body.searchClickId : null;
  if (type === "study_duration" && searchClickId) {
    const click = await prisma.searchClick.findFirst({
      where: { id: searchClickId, documentId: id, searchEvent: { userId: user.id, orgId } },
      select: { id: true, dwellSeconds: true },
    });
    if (click) {
      await prisma.searchClick.update({
        where: { id: click.id },
        data: { dwellSeconds: Math.min(1200, (click.dwellSeconds || 0) + durationSeconds) },
      });
    }
  }
  if (tooShortForInteraction) return NextResponse.json({ success: true, ignored: true }, { status: 200 });

  await prisma.documentInteraction.create({
    data: { documentId: id, userId: user.id, orgId, type, durationSeconds },
  });
  return NextResponse.json({ success: true }, { status: 201 });
}
