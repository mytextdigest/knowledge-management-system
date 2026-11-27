import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";
import { canViewDocument } from "@/lib/access/documentAccess";
import { logAudit } from "@/lib/auditLog";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { ASSET_CONTENT_TYPE, validateAssetInput } from "@/lib/templates/assetTemplates";
import { assetDocumentFields, isEditableAsset, queueAssetProcessing } from "@/lib/templates/assetDocuments";

export const runtime = "nodejs";

// EKP E14.2 / E14.4 (E-16): an asset written from a template.
//   GET → { asset, template, canEdit }  for the editor and the document page
//   PUT { title, sections, departmentId?, category? }  saves a draft again
// An asset always follows the template version it was written from, so a
// newer version of the template doesn't change it (E14.4). Only drafts are
// edited (once submitted the reviewers see what was submitted), by its
// author, a super admin, or an admin of its department.

async function load(params) {
  const session = await getServerSession();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true, orgId: true, userId: true, ownerId: true, departmentId: true, category: true, lifecycle: true, scope: true,
      visibility: true, projectId: true, filename: true, contentType: true, assetData: true, deletedAt: true,
      sourceProvider: true, externalId: true, externalUrl: true,
      project: { select: { orgId: true, departmentId: true, scope: true } },
      templateVersion: { select: { id: true, version: true, sections: true, requiredFields: true, template: { select: { id: true, name: true, status: true } } } },
    },
  });
  const notFound = { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!doc?.orgId || doc.deletedAt || doc.contentType !== ASSET_CONTENT_TYPE || !doc.templateVersion) return notFound;
  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user || !role) return notFound;
  if (doc.userId !== user.id && !(await canViewDocument(doc, { userId: user.id, role }))) return notFound;
  const canManage = doc.userId === user.id || isSuperAdmin(role)
    || (Boolean(doc.departmentId) && (await canManageDepartment(role, doc.departmentId, user.id)));
  return { doc, user, role, canEdit: canManage && role !== "guest" && isEditableAsset(doc) };
}

const describe = (doc, canEdit) => ({
  asset: {
    id: doc.id,
    title: doc.filename,
    departmentId: doc.departmentId,
    category: doc.category,
    lifecycle: doc.lifecycle,
    sections: doc.assetData?.sections || {},
  },
  template: {
    id: doc.templateVersion.template.id,
    name: doc.templateVersion.template.name,
    status: doc.templateVersion.template.status,
    version: doc.templateVersion.version,
    sections: doc.templateVersion.sections,
    requiredFields: doc.templateVersion.requiredFields,
  },
  canEdit,
});

export async function GET(req, { params }) {
  const { doc, canEdit, response } = await load(params);
  if (response) return response;
  return NextResponse.json(describe(doc, canEdit));
}

export async function PUT(req, { params }) {
  const { doc, user, canEdit, response } = await load(params);
  if (response) return response;
  if (!canEdit) {
    return NextResponse.json(
      { error: doc.lifecycle === "draft" ? "You can't edit this asset" : "Only a draft can be edited. Withdraw it from review first." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const version = doc.templateVersion;
  const { data, error, field } = validateAssetInput(version, body);
  if (error) return NextResponse.json({ error, field }, { status: 400 });
  if (data.departmentId && data.departmentId !== doc.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: data.departmentId, orgId: doc.orgId }, select: { id: true } });
    if (!department) return NextResponse.json({ error: "Invalid department for this organization", field: "departmentId" }, { status: 400 });
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      ...assetDocumentFields(version, data, version.template.name),
      department: data.departmentId ? { connect: { id: data.departmentId } } : { disconnect: true },
    },
  });
  await logAudit({
    orgId: doc.orgId, actorUserId: user.id, action: AUDIT_EVENTS.ASSET_EDITED, entityType: "document", entityId: doc.id,
    before: { title: doc.filename, sections: Object.keys(doc.assetData?.sections || {}) },
    after: { title: data.title, sections: Object.keys(data.sections), templateVersion: version.version },
  });
  try {
    await queueAssetProcessing(updated, user.id);
  } catch (err) {
    console.error(`Couldn't queue asset ${doc.id} for processing:`, err.message);
  }
  return NextResponse.json(describe({ ...doc, ...updated, templateVersion: version }, true));
}
