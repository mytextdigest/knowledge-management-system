import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";

const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Merge term `sourceId` into `targetId` (E15.5, WS-C §4.1), in one transaction:
 * - documents tagged with the source are re-tagged with the target (a document
 *   that already has the target just loses the duplicate);
 * - the source's child terms move under the target, with their subtrees;
 * - the source's label and synonyms become synonyms of the target, so searches
 *   for the old name still find the target;
 * - the source is deprecated with `mergedIntoId = target`, never deleted.
 */
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return bad("Unauthorized", 401);
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !isSuperAdmin(role)) return bad("Forbidden", 403);

  const b = await req.json().catch(() => ({}));
  if (typeof b.sourceId !== "string" || typeof b.targetId !== "string" || b.sourceId === b.targetId) {
    return bad("Choose two different terms");
  }
  const [source, target] = await Promise.all([
    prisma.term.findFirst({ where: { id: b.sourceId, termSet: { orgId } }, include: { termSet: true, synonyms: true } }),
    prisma.term.findFirst({ where: { id: b.targetId, termSet: { orgId } }, include: { synonyms: true } }),
  ]);
  if (!source || !target) return bad("Term not found", 404);
  if (source.termSet.readOnly) return bad("This term set is managed outside KMS", 403);
  if (source.termSetId !== target.termSetId) return bad("Both terms must be in the same term set");
  if (source.status !== "active" || target.status !== "active") return bad("Only active terms can be merged", 409);
  if (target.ancestorIds.includes(source.id)) return bad("A term can't be merged into one of its own child terms", 409);

  const children = await prisma.term.findMany({ where: { parentId: source.id, status: "active" }, select: { label: true, normalizedLabel: true } });
  if (children.length) {
    const clash = await prisma.term.findFirst({
      where: { parentId: target.id, status: "active", normalizedLabel: { in: children.map((c) => c.normalizedLabel) } },
      select: { label: true },
    });
    if (clash) return bad(`Both terms have a child term "${clash.label}". Merge those first.`, 409);
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Re-tag documents.
    const tagged = await tx.documentTerm.findMany({ where: { termId: source.id }, select: { id: true, documentId: true, fieldId: true } });
    const already = await tx.documentTerm.findMany({
      where: { termId: target.id, documentId: { in: tagged.map((t) => t.documentId) } },
      select: { documentId: true, fieldId: true },
    });
    const has = new Set(already.map((t) => `${t.documentId}:${t.fieldId}`));
    const duplicates = tagged.filter((t) => has.has(`${t.documentId}:${t.fieldId}`)).map((t) => t.id);
    const moved = tagged.filter((t) => !has.has(`${t.documentId}:${t.fieldId}`)).map((t) => t.id);
    if (duplicates.length) await tx.documentTerm.deleteMany({ where: { id: { in: duplicates } } });
    if (moved.length) await tx.documentTerm.updateMany({ where: { id: { in: moved } }, data: { termId: target.id } });

    // 2. Move the source's subtree under the target.
    const subtree = await tx.term.findMany({ where: { ancestorIds: { has: source.id } }, select: { id: true, parentId: true, ancestorIds: true } });
    const base = [...target.ancestorIds, target.id];
    for (const node of subtree) {
      const below = node.ancestorIds.slice(node.ancestorIds.indexOf(source.id) + 1);
      const ancestorIds = [...base, ...below];
      await tx.term.update({
        where: { id: node.id },
        data: { ancestorIds, depth: ancestorIds.length, ...(node.parentId === source.id ? { parentId: target.id } : {}) },
      });
    }

    // 3. Keep the old names as synonyms of the target.
    const taken = new Set([target.normalizedLabel, ...target.synonyms.map((s) => s.normalizedLabel)]);
    const carried = [{ label: source.label, normalizedLabel: source.normalizedLabel }, ...source.synonyms.map((s) => ({ label: s.label, normalizedLabel: s.normalizedLabel }))]
      .filter((s) => !taken.has(s.normalizedLabel) && taken.add(s.normalizedLabel));
    if (carried.length) await tx.termSynonym.createMany({ data: carried.map((s) => ({ ...s, termId: target.id })) });

    // 4. Retire the source.
    await tx.term.update({ where: { id: source.id }, data: { status: "deprecated", mergedIntoId: target.id } });
    return { retagged: moved.length, duplicatesRemoved: duplicates.length, childrenMoved: subtree.length, synonymsAdded: carried.map((s) => s.label) };
  });

  await logAudit({
    orgId, actorUserId: user.id, action: "taxonomy.term.merged", entityType: "Term", entityId: source.id,
    before: { label: source.label, status: source.status },
    after: { status: "deprecated", mergedIntoId: target.id, mergedIntoLabel: target.label, ...result },
  });
  return NextResponse.json({ merged: true, ...result });
}
