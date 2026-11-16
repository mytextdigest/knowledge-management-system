import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole, isSuperAdmin } from '@/lib/orgGuard';
import { logAudit } from '@/lib/auditLog';
import { FIELD_MAP_KEY, getFieldMap, validateFieldMap, reconcileMappedDocuments } from '@/lib/taxonomy/import/sourceTagMap.mjs';

export const runtime = 'nodejs';
export const maxDuration = 300;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

async function admin(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: fail('Unauthorized', 401) };
  const actor = await resolveOrgRole(session.user.email, orgId);
  if (!actor.user || !isSuperAdmin(actor.role)) return { error: fail('Forbidden', 403) };
  return actor;
}

/** C-8: SharePoint managed-metadata columns seen in synced documents, and the current map. */
export async function GET(_req, { params }) {
  const { orgId } = await params;
  const actor = await admin(orgId); if (actor.error) return actor.error;
  const [columns, mapping, integration] = await Promise.all([
    prisma.documentSourceTag.groupBy({
      by: ['fieldName', 'fieldDisplayName'], where: { sourceSystem: 'sharepoint', document: { orgId, deletedAt: null } },
      _count: { _all: true }, orderBy: { fieldName: 'asc' },
    }),
    getFieldMap(prisma, orgId),
    prisma.orgIntegration.findUnique({ where: { orgId_provider: { orgId, provider: 'sharepoint' } }, select: { status: true } }),
  ]);
  const byName = new Map();
  for (const c of columns) {
    const prior = byName.get(c.fieldName);
    byName.set(c.fieldName, { fieldName: c.fieldName, displayName: prior?.displayName || c.fieldDisplayName || c.fieldName, tags: (prior?.tags || 0) + c._count._all });
  }
  return NextResponse.json({ sharepoint: integration?.status ?? null, columns: [...byName.values()], mapping });
}

/** Save the map: { mapping: { internalColumnName: fieldId | null } }. */
export async function PUT(req, { params }) {
  const { orgId } = await params;
  const actor = await admin(orgId); if (actor.error) return actor.error;
  const body = await req.json().catch(() => ({}));
  let mapping;
  try { mapping = await validateFieldMap(prisma, orgId, body.mapping); } catch (e) { return fail(e.message); }
  const before = await getFieldMap(prisma, orgId);
  await prisma.orgSetting.upsert({
    where: { orgId_key: { orgId, key: FIELD_MAP_KEY } },
    create: { orgId, key: FIELD_MAP_KEY, value: mapping, updatedBy: actor.user.id },
    update: { value: mapping, updatedBy: actor.user.id },
  });
  await logAudit({ orgId, actorUserId: actor.user.id, action: 'taxonomy.source_mapping.updated', entityType: 'OrgSetting', entityId: FIELD_MAP_KEY, before, after: mapping });
  return NextResponse.json({ mapping });
}

/** "Map now": bring synced tags in as terms, one batch per call ({ cursor }). */
export async function POST(req, { params }) {
  const { orgId } = await params;
  const actor = await admin(orgId); if (actor.error) return actor.error;
  const body = await req.json().catch(() => ({}));
  const mapping = await getFieldMap(prisma, orgId);
  if (!Object.keys(mapping).length) return fail('Map at least one SharePoint column to a field first');
  const cursor = typeof body.cursor === 'string' ? body.cursor : null;
  const result = await reconcileMappedDocuments(prisma, { orgId, mapping, cursor, limit: 500 });
  if (!cursor) await logAudit({ orgId, actorUserId: actor.user.id, action: 'taxonomy.source_mapping.applied', entityType: 'OrgSetting', entityId: FIELD_MAP_KEY, after: { mapping, firstBatch: result } });
  return NextResponse.json(result);
}
