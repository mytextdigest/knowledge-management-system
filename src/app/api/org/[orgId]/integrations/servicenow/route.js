import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { encryptJson } from "@/lib/crypto";
import { listKnowledgeBases } from "@/lib/connectors/servicenowApi";
import { validateConnectBody, mergeKnowledgeBases } from "@/lib/connectors/servicenowSettings";

// EKP A-17: the ServiceNow Knowledge Base connector's settings page.
//   GET     connection status and the knowledge-base → department mapping
//   PUT     connect, or replace the credentials (tested before saving)
//   PATCH   save the knowledge-base → department mapping
//   DELETE  disconnect (stops syncing; documents stay)

async function guard(params) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  if (!isSuperAdmin(role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { orgId, user };
}

const findIntegration = (orgId) =>
  prisma.orgIntegration.findUnique({ where: { orgId_provider: { orgId, provider: "servicenow" } } });

export async function GET(req, { params }) {
  const { orgId, error } = await guard(params);
  if (error) return error;

  const integration = await findIntegration(orgId);
  if (!integration) return NextResponse.json({ connected: false });

  const config = integration.scopeConfig || {};
  const kbs = config.knowledgeBases || [];
  const departments = await prisma.department.findMany({
    where: { id: { in: kbs.map((kb) => kb.departmentId) } },
    select: { id: true, name: true },
  });
  const deptNameById = Object.fromEntries(departments.map((d) => [d.id, d.name]));

  return NextResponse.json({
    connected: integration.status === "connected",
    status: integration.status,
    lastSyncAt: integration.lastSyncAt,
    connectedAt: integration.createdAt,
    instanceUrl: config.instanceUrl,
    authType: config.authType,
    account: config.authType === "oauth" ? config.clientId : config.username,
    knowledgeBases: kbs.map((kb) => ({
      kbId: kb.kbId,
      title: kb.title,
      departmentId: kb.departmentId,
      departmentName: deptNameById[kb.departmentId] || null,
    })),
  });
}

export async function PUT(req, { params }) {
  const { orgId, user, error } = await guard(params);
  if (error) return error;

  const { connection, scope, secret, error: invalid } = validateConnectBody(await req.json().catch(() => ({})));
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  let available;
  try {
    available = await listKnowledgeBases(connection);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const existing = await findIntegration(orgId);
  const sameInstance = existing?.scopeConfig?.instanceUrl === scope.instanceUrl;
  const scopeConfig = {
    ...scope,
    connectedByUserId: user.id,
    knowledgeBases: sameInstance ? existing.scopeConfig.knowledgeBases || [] : [],
  };
  const data = {
    status: "connected",
    scopeConfig,
    accessToken: encryptJson(secret),
    tokenExpiry: new Date(), // unused: these credentials don't expire
  };
  await prisma.orgIntegration.upsert({
    where: { orgId_provider: { orgId, provider: "servicenow" } },
    create: { orgId, provider: "servicenow", ...data },
    update: data,
  });
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "servicenow.connected",
    metadata: { instanceUrl: scope.instanceUrl, authType: scope.authType },
  });

  return NextResponse.json({ connected: true, available });
}

export async function PATCH(req, { params }) {
  const { orgId, user, error } = await guard(params);
  if (error) return error;

  const integration = await findIntegration(orgId);
  if (!integration) return NextResponse.json({ error: "Not connected" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const selections = Array.isArray(body?.knowledgeBases) ? body.knowledgeBases : null;
  if (!selections) return NextResponse.json({ error: "knowledgeBases must be a list" }, { status: 400 });
  for (const s of selections) {
    if (typeof s?.kbId !== "string" || !s.kbId || typeof s.departmentId !== "string" || !s.departmentId) {
      return NextResponse.json({ error: "Each knowledge base needs kbId and departmentId" }, { status: 400 });
    }
  }
  const departmentIds = [...new Set(selections.map((s) => s.departmentId))];
  const valid = await prisma.department.count({ where: { id: { in: departmentIds }, orgId } });
  if (valid !== departmentIds.length) {
    return NextResponse.json({ error: "One or more departments do not belong to this org" }, { status: 400 });
  }

  const before = integration.scopeConfig.knowledgeBases || [];
  const knowledgeBases = mergeKnowledgeBases(before, selections);
  await prisma.orgIntegration.update({
    where: { id: integration.id },
    data: { scopeConfig: { ...integration.scopeConfig, knowledgeBases } },
  });
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "servicenow.knowledge_bases_updated",
    metadata: {
      before: before.map(({ kbId, departmentId }) => ({ kbId, departmentId })),
      after: knowledgeBases.map(({ kbId, departmentId }) => ({ kbId, departmentId })),
    },
  });

  return NextResponse.json({ knowledgeBases: knowledgeBases.map(({ kbId, title, departmentId }) => ({ kbId, title, departmentId })) });
}

export async function DELETE(req, { params }) {
  const { orgId, user, error } = await guard(params);
  if (error) return error;

  const integration = await findIntegration(orgId);
  if (!integration) return NextResponse.json({ error: "Not connected" }, { status: 404 });

  await prisma.orgIntegration.update({ where: { id: integration.id }, data: { status: "disconnected" } });
  await logAudit({ orgId, actorUserId: user.id, action: "servicenow.disconnected", metadata: {} });
  return NextResponse.json({ disconnected: true });
}
