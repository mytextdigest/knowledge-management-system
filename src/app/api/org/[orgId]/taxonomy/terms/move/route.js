import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { logAudit } from "@/lib/auditLog";

const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });

/**
 * Move a term under another parent (or to the top level), or reorder it among
 * its siblings. POST { id, parentId: string | null } or { id, direction: "up" | "down" }.
 * Local term sets only; descendants keep their place under the moved term.
 */
export async function POST(req, { params }) {
  const { orgId } = await params;
  const session = await getServerSession();
  if (!session?.user?.email) return bad("Unauthorized", 401);
  const a = await resolveOrgRole(session.user.email, orgId);
  if (!a.user || !isSuperAdmin(a.role)) return bad("Forbidden", 403);
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string") return bad("Term id required");
  const term = await prisma.term.findFirst({ where: { id: b.id, termSet: { orgId } }, include: { termSet: { select: { readOnly: true } } } });
  if (!term) return bad("Term not found", 404);
  if (term.termSet.readOnly) return bad("This term set is managed outside KMS", 403);
  if (term.status !== "active") return bad("Reactivate the term first", 409);

  if (b.direction === "up" || b.direction === "down") {
    const siblings = await prisma.term.findMany({
      where: { termSetId: term.termSetId, parentId: term.parentId, status: "active" },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { id: true },
    });
    const index = siblings.findIndex((s) => s.id === term.id);
    const swap = b.direction === "up" ? index - 1 : index + 1;
    if (swap < 0 || swap >= siblings.length) return NextResponse.json({ moved: false });
    [siblings[index], siblings[swap]] = [siblings[swap], siblings[index]];
    // Renumber the level so equal sort orders from older data can't tie.
    await prisma.$transaction(siblings.map((s, i) => prisma.term.update({ where: { id: s.id }, data: { sortOrder: i } })));
    await logAudit({ orgId, actorUserId: a.user.id, action: "taxonomy.term.reordered", entityType: "Term", entityId: term.id, after: { direction: b.direction } });
    return NextResponse.json({ moved: true });
  }

  if (b.parentId !== null && typeof b.parentId !== "string") return bad("Choose where to move the term");
  let parent = null;
  if (b.parentId) {
    parent = await prisma.term.findFirst({ where: { id: b.parentId, termSetId: term.termSetId, status: "active" } });
    if (!parent) return bad("Invalid parent term");
    if (parent.id === term.id || parent.ancestorIds.includes(term.id)) return bad("A term can't be moved under itself", 409);
  }
  if ((parent?.id ?? null) === term.parentId) return NextResponse.json({ moved: false });
  const clash = await prisma.term.findFirst({ where: { termSetId: term.termSetId, parentId: parent?.id ?? null, normalizedLabel: term.normalizedLabel, status: "active", id: { not: term.id } }, select: { id: true } });
  if (clash) return bad(`"${term.label}" already exists at that level`, 409);

  const prefix = parent ? [...parent.ancestorIds, parent.id] : [];
  const last = await prisma.term.findFirst({ where: { termSetId: term.termSetId, parentId: parent?.id ?? null }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const descendants = await prisma.term.findMany({ where: { termSetId: term.termSetId, ancestorIds: { has: term.id } }, select: { id: true, ancestorIds: true } });
  await prisma.$transaction(async (tx) => {
    await tx.term.update({ where: { id: term.id }, data: { parentId: parent?.id ?? null, ancestorIds: prefix, depth: prefix.length, sortOrder: (last?.sortOrder ?? -1) + 1 } });
    for (const d of descendants) {
      const ancestorIds = [...prefix, ...d.ancestorIds.slice(d.ancestorIds.indexOf(term.id))];
      await tx.term.update({ where: { id: d.id }, data: { ancestorIds, depth: ancestorIds.length } });
    }
  }, { timeout: 60_000 });
  await logAudit({ orgId, actorUserId: a.user.id, action: "taxonomy.term.moved", entityType: "Term", entityId: term.id, before: { parentId: term.parentId }, after: { parentId: parent?.id ?? null, descendants: descendants.length } });
  return NextResponse.json({ moved: true });
}
