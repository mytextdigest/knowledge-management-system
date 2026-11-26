import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { STARTER_TEMPLATES, validateTemplateInput } from "@/lib/templates/assetTemplates";
import { createTemplate, listTemplates, serializeTemplate } from "@/lib/templates/templateStore";

// EKP E14.1 (E-16): an org's asset templates.
//   GET                 active templates (any member: "New from template")
//   GET ?all=1          every template with its asset count (super_admin)
//   POST { name, sections, requiredFields }   a new template (super_admin)
//   POST { starters: true }                   adds the four starter templates
//                                             the org doesn't have yet (super_admin)

async function access(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user, role };
}

export async function GET(req, { params }) {
  const { orgId } = await params;
  const { role, response } = await access(orgId);
  if (response) return response;
  const all = new URL(req.url).searchParams.get("all") === "1";
  if (all && !isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ templates: await listTemplates(prisma, orgId, { all }), canManage: isSuperAdmin(role) });
}

export async function POST(req, { params }) {
  const { orgId } = await params;
  const { user, role, response } = await access(orgId);
  if (response) return response;
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Only a super admin can manage templates" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  if (body.starters === true) {
    const existing = new Set((await prisma.assetTemplate.findMany({ where: { orgId }, select: { name: true } })).map((t) => t.name.toLowerCase()));
    const created = [];
    for (const starter of STARTER_TEMPLATES) {
      if (existing.has(starter.name.toLowerCase())) continue;
      const { data } = validateTemplateInput(starter);
      const template = await createTemplate(prisma, orgId, user.id, data);
      created.push(template.name);
      await logAudit({
        orgId, actorUserId: user.id, action: AUDIT_EVENTS.TEMPLATE_CREATED, entityType: "asset_template", entityId: template.id,
        after: { name: template.name, version: 1, sections: data.sections.length, requiredFields: data.requiredFields },
        metadata: { starter: true },
      });
    }
    return NextResponse.json({ created, templates: await listTemplates(prisma, orgId, { all: true }) });
  }

  const { data, error } = validateTemplateInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  let template;
  try {
    template = await createTemplate(prisma, orgId, user.id, data);
  } catch (err) {
    if (err?.code === "P2002") return NextResponse.json({ error: `A template named "${data.name}" already exists.` }, { status: 409 });
    throw err;
  }
  await logAudit({
    orgId, actorUserId: user.id, action: AUDIT_EVENTS.TEMPLATE_CREATED, entityType: "asset_template", entityId: template.id,
    after: { name: template.name, version: 1, sections: data.sections.length, requiredFields: data.requiredFields },
  });
  return NextResponse.json({ template: serializeTemplate(template) }, { status: 201 });
}
