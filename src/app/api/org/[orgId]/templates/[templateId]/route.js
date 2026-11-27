import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { validateTemplateInput } from "@/lib/templates/assetTemplates";
import { getTemplate, serializeTemplate, updateTemplate } from "@/lib/templates/templateStore";

// EKP E14.1 / E14.4 (E-16): one template. Any member can read it (the
// editor); super_admin changes it.
//   PATCH { name, sections, requiredFields }  saves: changed sections or
//         required fields make a new version; assets keep the version they
//         were written from.
//   PATCH { status: "retired" | "active" }    hides it from "New from
//         template" (or brings it back). Existing assets are unaffected.

async function access(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, role };
}

export async function GET(req, { params }) {
  const { orgId, templateId } = await params;
  const { role, response } = await access(orgId);
  if (response) return response;
  const template = await getTemplate(prisma, orgId, templateId);
  if (!template || (template.status !== "active" && !isSuperAdmin(role))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ template: serializeTemplate(template) });
}

export async function PATCH(req, { params }) {
  const { orgId, templateId } = await params;
  const { user, role, response } = await access(orgId);
  if (response) return response;
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Only a super admin can manage templates" }, { status: 403 });
  const template = await getTemplate(prisma, orgId, templateId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.status !== undefined) {
    if (!["active", "retired"].includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (body.status === template.status) return NextResponse.json({ template: serializeTemplate(template) });
    const updated = await prisma.assetTemplate.update({
      where: { id: template.id },
      data: { status: body.status },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    await logAudit({
      orgId, actorUserId: user.id,
      action: body.status === "retired" ? AUDIT_EVENTS.TEMPLATE_RETIRED : AUDIT_EVENTS.TEMPLATE_RESTORED,
      entityType: "asset_template", entityId: template.id,
      before: { status: template.status }, after: { status: body.status }, metadata: { name: template.name },
    });
    return NextResponse.json({ template: serializeTemplate(updated) });
  }

  const { data, error } = validateTemplateInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  let result;
  try {
    result = await updateTemplate(prisma, template, user.id, data);
  } catch (err) {
    if (err?.code === "P2002") return NextResponse.json({ error: `A template named "${data.name}" already exists.` }, { status: 409 });
    throw err;
  }
  const latest = result.template.versions[0];
  if (result.newVersion || data.name !== template.name) {
    await logAudit({
      orgId, actorUserId: user.id, action: AUDIT_EVENTS.TEMPLATE_VERSION_CREATED,
      entityType: "asset_template", entityId: template.id,
      before: { name: template.name, version: template.versions[0]?.version ?? 0 },
      after: { name: data.name, version: latest.version, sections: data.sections.length, requiredFields: data.requiredFields },
      metadata: { newVersion: result.newVersion },
    });
  }
  return NextResponse.json({ template: serializeTemplate(result.template), newVersion: result.newVersion });
}
