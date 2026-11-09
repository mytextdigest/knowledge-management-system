import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";
import { cleanLabel, normalizeLabel } from "@/lib/taxonomy/labels.mjs";

const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });

async function admin(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: bad("Unauthorized", 401) };
  const a = await resolveOrgRole(session.user.email, orgId);
  if (!a.user || !isSuperAdmin(a.role)) return { error: bad("Forbidden", 403) };
  return a;
}

// Synonyms as typed: unique by normalised label, never equal to the term itself.
function parseSynonyms(value, termLabel) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) return null;
  const own = normalizeLabel(termLabel);
  const out = new Map();
  for (const raw of value) {
    const label = cleanLabel(raw);
    if (!label) return null;
    const key = normalizeLabel(label);
    if (key !== own && !out.has(key)) out.set(key, label);
  }
  return [...out].map(([normalizedLabel, label]) => ({ label, normalizedLabel }));
}

async function siblingClash(termSetId, parentId, normalizedLabel, exceptId) {
  return prisma.term.findFirst({
    where: { termSetId, parentId: parentId ?? null, normalizedLabel, status: "active", ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
}

export async function POST(req, { params }) {
  const { orgId } = await params;
  const a = await admin(orgId); if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  const label = cleanLabel(b.label);
  if (!label || typeof b.termSetId !== "string") return bad("Enter a term name (up to 120 characters)");
  const set = await prisma.termSet.findFirst({ where: { id: b.termSetId, orgId } });
  if (!set) return bad("Term set not found", 404);
  if (set.readOnly) return bad("This term set is managed outside KMS", 403);
  let parent = null;
  if (b.parentId) {
    parent = await prisma.term.findFirst({ where: { id: b.parentId, termSetId: set.id, status: "active" } });
    if (!parent) return bad("Invalid parent term");
  }
  const normalizedLabel = normalizeLabel(label);
  if (await siblingClash(set.id, parent?.id, normalizedLabel)) return bad(`"${label}" already exists at this level`, 409);
  const synonyms = parseSynonyms(b.synonyms ?? [], label);
  if (synonyms === null) return bad("Invalid synonyms");
  const last = await prisma.term.findFirst({ where: { termSetId: set.id, parentId: parent?.id ?? null }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const term = await prisma.term.create({
    data: {
      termSetId: set.id, parentId: parent?.id ?? null, label, normalizedLabel,
      description: typeof b.description === "string" ? b.description.slice(0, 1000) : null,
      depth: parent ? parent.depth + 1 : 0,
      ancestorIds: parent ? [...parent.ancestorIds, parent.id] : [],
      sortOrder: (last?.sortOrder ?? -1) + 1,
      synonyms: { create: synonyms },
    },
  });
  await logAudit({ orgId, actorUserId: a.user.id, action: "taxonomy.term.created", entityType: "Term", entityId: term.id, after: { label, termSetId: set.id, parentId: term.parentId, synonyms: synonyms.map((s) => s.label) } });
  return NextResponse.json({ term }, { status: 201 });
}

// Rename, describe, deprecate/reactivate, or replace the synonym list.
export async function PATCH(req, { params }) {
  const { orgId } = await params;
  const a = await admin(orgId); if (a.error) return a.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") return bad("Term id required");
  const old = await prisma.term.findFirst({ where: { id: b.id, termSet: { orgId } }, include: { termSet: true, synonyms: true, parent: { select: { status: true } } } });
  if (!old) return bad("Term not found", 404);
  if (old.termSet.readOnly) return bad("This term set is managed outside KMS", 403);
  if (old.mergedIntoId) return bad("This term was merged into another and can't be changed", 409);
  const label = b.label === undefined ? old.label : cleanLabel(b.label);
  if (!label) return bad("Enter a term name (up to 120 characters)");
  const status = b.status === undefined ? old.status : b.status;
  if (!["active", "deprecated"].includes(status)) return bad("Invalid status");
  if (status === "active" && old.status !== "active" && old.parent && old.parent.status !== "active") {
    return bad("Reactivate its parent term first", 409);
  }
  const normalizedLabel = normalizeLabel(label);
  if (status === "active" && (await siblingClash(old.termSetId, old.parentId, normalizedLabel, old.id))) {
    return bad(`"${label}" already exists at this level`, 409);
  }
  const synonyms = parseSynonyms(b.synonyms, label);
  if (synonyms === null) return bad("Invalid synonyms");
  const description = b.description === undefined ? old.description : typeof b.description === "string" ? b.description.slice(0, 1000) : null;
  const term = await prisma.$transaction(async (tx) => {
    if (synonyms) {
      await tx.termSynonym.deleteMany({ where: { termId: old.id } });
      if (synonyms.length) await tx.termSynonym.createMany({ data: synonyms.map((s) => ({ ...s, termId: old.id })) });
    }
    return tx.term.update({ where: { id: old.id }, data: { label, normalizedLabel, status, description } });
  });
  await logAudit({
    orgId, actorUserId: a.user.id, action: "taxonomy.term.updated", entityType: "Term", entityId: old.id,
    before: { label: old.label, status: old.status, synonyms: old.synonyms.map((s) => s.label) },
    after: { label, status, synonyms: synonyms ? synonyms.map((s) => s.label) : old.synonyms.map((s) => s.label) },
  });
  return NextResponse.json({ term });
}
