import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
const bad = (message, status = 400) => NextResponse.json({ error: message }, { status });
async function admin(orgId) {
 const session = await getServerSession(); if (!session?.user?.email) return { error: bad("Unauthorized",401) };
 const a = await resolveOrgRole(session.user.email, orgId);
 if (!a.user || !isSuperAdmin(a.role)) return { error: bad("Forbidden",403) }; return a;
}
export async function POST(req, { params }) {
 const { orgId } = await params; const a = await admin(orgId); if (a.error) return a.error;
 const b = await req.json().catch(() => ({}));
 const label = typeof b.label === "string" ? b.label.trim() : "";
 if (!label || label.length > 120 || typeof b.termSetId !== "string") return bad("Invalid term");
 const set = await prisma.termSet.findFirst({ where: { id: b.termSetId, orgId } });
 if (!set) return bad("Term set not found",404);
 if (set.readOnly) return bad("Externally managed term set",403);
 let parent = null;
 if (b.parentId) { parent = await prisma.term.findFirst({ where: { id: b.parentId, termSetId: set.id, status: "active" } }); if (!parent) return bad("Invalid parent"); }
 const normalizedLabel = label.toLocaleLowerCase("en-US").normalize("NFKC");
 if (await prisma.term.findFirst({ where: { termSetId: set.id, parentId: parent?.id ?? null, normalizedLabel, status: "active" } })) return bad("Duplicate sibling label",409);
 const term = await prisma.$transaction(async tx => {
  const created = await tx.term.create({ data: { termSetId: set.id, parentId: parent?.id ?? null, label, normalizedLabel, description: typeof b.description === "string" ? b.description.slice(0,1000) : null, depth: parent ? parent.depth + 1 : 0, ancestorIds: parent ? [...parent.ancestorIds,parent.id] : [] } });
  await tx.auditLog.create({ data: { orgId, actorUserId: a.user.id, action: "taxonomy.term.created", entityType: "Term", entityId: created.id, after: { label, termSetId: set.id, parentId: created.parentId } } }); return created;
 });
 return NextResponse.json({ term },{status:201});
}
export async function PATCH(req, { params }) {
 const { orgId } = await params; const a = await admin(orgId); if (a.error) return a.error;
 const b = await req.json().catch(() => ({}));
 if (typeof b.id !== "string") return bad("Term id required");
 const old = await prisma.term.findFirst({ where: { id:b.id, termSet: { orgId } }, include: { termSet: true } });
 if (!old) return bad("Term not found",404); if (old.termSet.readOnly) return bad("Externally managed term",403);
 const label = b.label === undefined ? old.label : typeof b.label === "string" ? b.label.trim() : "";
 if (!label || label.length > 120) return bad("Invalid label");
 const status = b.status === undefined ? old.status : b.status;
 if (!["active","deprecated"].includes(status)) return bad("Invalid status");
 const normalizedLabel = label.toLocaleLowerCase("en-US").normalize("NFKC");
 if (await prisma.term.findFirst({ where: { termSetId: old.termSetId, parentId: old.parentId, normalizedLabel, status: "active", id: { not: old.id } } })) return bad("Duplicate sibling label",409);
 const term = await prisma.$transaction(async tx => {
  const updated = await tx.term.update({ where: { id:old.id }, data: { label, normalizedLabel, status, description: b.description === undefined ? old.description : typeof b.description === "string" ? b.description.slice(0,1000) : null } });
  await tx.auditLog.create({ data: { orgId, actorUserId:a.user.id, action:"taxonomy.term.updated", entityType:"Term", entityId:old.id, before:{label:old.label,status:old.status}, after:{label,status} } }); return updated;
 });
 return NextResponse.json({term});
}
