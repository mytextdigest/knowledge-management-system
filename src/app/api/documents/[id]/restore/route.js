import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";
import { AUDIT_EVENTS } from "@/lib/audit/events";

export async function POST(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  const access = await resolveDocumentManagementAccess(session.user.email, id);
  if (!access.document) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const doc = await prisma.document.findUnique({
    where: { id }, select: { orgId: true, project: { select: { orgId: true } }, deletedAt: true },
  });
  if (!doc?.deletedAt) return NextResponse.json({ error: "Document is not deleted" }, { status: 409 });
  const orgId = doc.orgId || doc.project?.orgId || null;
  const actor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.document.updateMany({
        where: { id, deletedAt: { not: null } },
        data: { deletedAt: null, deletedById: null, purgeAfter: null },
      });
      if (changed.count !== 1) throw new Error("NOT_DELETED");
      if (orgId) await tx.auditLog.create({ data: {
        orgId, actorUserId: actor?.id ?? null, action: AUDIT_EVENTS.DOCUMENT_RESTORED,
        entityType: "document", entityId: id,
        before: { deletedAt: doc.deletedAt.toISOString() }, after: { deletedAt: null },
        metadata: { restoreMode: "soft_delete" },
      } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error?.message === "NOT_DELETED") return NextResponse.json({ error: "Document is not deleted" }, { status: 409 });
    console.error("Restore failed:", error?.message);
    return NextResponse.json({ error: "Could not restore document" }, { status: 500 });
  }
}
