import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { getOrgSubscription, isSubscriptionActive } from "@/lib/subscription";
import { defaultOwnerId } from "@/lib/governance/defaultOwner";
import { logAudit } from "@/lib/auditLog";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { validateAssetInput } from "@/lib/templates/assetTemplates";
import { getTemplate } from "@/lib/templates/templateStore";
import { assetDocumentFields, queueAssetProcessing } from "@/lib/templates/assetDocuments";

export const runtime = "nodejs";

// EKP E14.2 (E-16): "New from template". POST { templateId, title, sections,
// departmentId?, category? } saves a new asset as a draft in the repository,
// written from the template's latest version, and queues it for processing.
// The author then submits it for approval on the document page (E14.3, E22).
// Any member but a guest, like a repository upload.
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (role === "guest") return NextResponse.json({ error: "Guests can't add to the repository" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const template = await getTemplate(prisma, orgId, String(body.templateId || ""));
  if (!template || template.status !== "active" || !template.versions[0]) {
    return NextResponse.json({ error: "That template isn't available" }, { status: 404 });
  }
  const version = template.versions[0];

  const { data, error, field } = validateAssetInput(version, body);
  if (error) return NextResponse.json({ error, field }, { status: 400 });
  if (data.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: data.departmentId, orgId }, select: { id: true } });
    if (!department) return NextResponse.json({ error: "Invalid department for this organization", field: "departmentId" }, { status: 400 });
  }

  const subscription = await getOrgSubscription(orgId);
  if (!isSubscriptionActive(subscription) || !subscription.plan) {
    return NextResponse.json({ error: "No active subscription" }, { status: 403 });
  }

  const ownerId = await defaultOwnerId(prisma, { orgId, departmentId: data.departmentId, uploaderId: user.id });
  const doc = await prisma.document.create({
    data: {
      ...assetDocumentFields(version, data, template.name),
      filePath: null,
      scope: "repository",
      visibility: "private",
      // A reviewer publishes it (E22): through the workflow that covers it, or directly.
      lifecycle: "draft",
      organization: { connect: { id: orgId } },
      ...(data.departmentId ? { department: { connect: { id: data.departmentId } } } : {}),
      templateVersion: { connect: { id: version.id } },
      user: { connect: { id: user.id } },
      owner: { connect: { id: ownerId } },
    },
  });
  await logAudit({
    orgId, actorUserId: user.id, action: AUDIT_EVENTS.ASSET_CREATED, entityType: "document", entityId: doc.id,
    after: { title: data.title, templateId: template.id, templateName: template.name, templateVersion: version.version, lifecycle: "draft" },
  });

  try {
    await queueAssetProcessing(doc, user.id);
  } catch (err) {
    // Saved; the repair job (or the document page's "Reprocess") picks it up.
    console.error(`Couldn't queue asset ${doc.id} for processing:`, err.message);
  }
  return NextResponse.json({ id: doc.id, lifecycle: doc.lifecycle }, { status: 201 });
}
