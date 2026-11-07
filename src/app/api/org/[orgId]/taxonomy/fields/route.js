import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
async function guard(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: fail("Unauthorized", 401) };
  const actor = await resolveOrgRole(session.user.email, orgId);
  if (!actor.user || !actor.role) return { error: fail("Forbidden", 403) };
  return actor;
}
const keyPattern = /^[a-z][a-z0-9_]{1,63}$/;
export async function GET(_req, { params }) {
  const { orgId } = await params;
  const actor = await guard(orgId); if (actor.error) return actor.error;
  const fields = await prisma.metadataField.findMany({ where: { orgId }, include: { termSet: { select: { id: true, name: true, readOnly: true } }, _count: { select: { documentTerms: true } } }, orderBy: [{ facetOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json({ fields });
}
export async function POST(req, { params }) {
  const { orgId } = await params;
  const actor = await guard(orgId); if (actor.error) return actor.error;
  if (!isSuperAdmin(actor.role)) return fail("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!keyPattern.test(key) || !name || name.length > 120 || typeof body.termSetId !== "string") return fail("Invalid field key, name or term set");
  const set = await prisma.termSet.findFirst({ where: { id: body.termSetId, orgId } });
  if (!set || set.readOnly) return fail("Local term set not found", 404);
  try {
    const field = await prisma.$transaction(async tx => {
      const created = await tx.metadataField.create({ data: { orgId, key, name, termSetId: set.id, multi: body.multi === true, required: body.required === true, facet: body.facet === true } });
      await tx.auditLog.create({ data: { orgId, actorUserId: actor.user.id, action: "taxonomy.metadata_field.created", entityType: "MetadataField", entityId: created.id, after: { key, name, termSetId: set.id } } });
      return created;
    });
    return NextResponse.json({ field }, { status: 201 });
  } catch (e) { if (e.code === "P2002") return fail("Field key already exists", 409); throw e; }
}
export async function PATCH(req, { params }) {
  const { orgId } = await params;
  const actor = await guard(orgId); if (actor.error) return actor.error;
  if (!isSuperAdmin(actor.role)) return fail("Forbidden", 403);
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") return fail("Field id required");
  const old = await prisma.metadataField.findFirst({ where: { id: body.id, orgId }, include: { _count: { select: { documentTerms: true } }, termSet: true } });
  if (!old) return fail("Field not found", 404);
  if (old.termSet.readOnly) return fail("Externally managed field", 403);
  const name = body.name === undefined ? old.name : typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return fail("Invalid name");
  const multi = body.multi === undefined ? old.multi : body.multi;
  const required = body.required === undefined ? old.required : body.required;
  const facet = body.facet === undefined ? old.facet : body.facet;
  if ([multi, required, facet].some(v => typeof v !== "boolean")) return fail("Invalid boolean flags");
  if (old._count.documentTerms && old.multi && !multi) return fail("Cannot change populated multi-value field to single-value", 409);
  const field = await prisma.$transaction(async tx => {
    const updated = await tx.metadataField.update({ where: { id: old.id }, data: { name, multi, required, facet } });
    await tx.auditLog.create({ data: { orgId, actorUserId: actor.user.id, action: "taxonomy.metadata_field.updated", entityType: "MetadataField", entityId: old.id, before: { name: old.name, multi: old.multi, required: old.required, facet: old.facet }, after: { name, multi, required, facet } } });
    return updated;
  });
  return NextResponse.json({ field });
}
