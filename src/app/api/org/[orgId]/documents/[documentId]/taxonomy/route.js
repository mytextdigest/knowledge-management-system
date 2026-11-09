import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { repositoryAccessWhere, getUserPrincipals, canManageDocument } from "@/lib/access/documentAccess";
import { logAudit } from "@/lib/auditLog";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// The document, if the caller can see it in the repository (C-5).
async function context(orgId, documentId) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: fail("Unauthorized", 401) };
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return { error: fail("Forbidden", 403) };
  const memberships = await prisma.departmentMember.findMany({ where: { userId: user.id }, select: { departmentId: true, role: true } });
  const principals = await getUserPrincipals(prisma, user.id, { orgId });
  const access = repositoryAccessWhere({
    orgId, role, principals,
    userDeptIds: memberships.map((m) => m.departmentId),
    adminDeptIds: memberships.filter((m) => m.role === "admin").map((m) => m.departmentId),
  });
  // `access` scopes to this org, including org-project documents whose own orgId is null.
  const document = await prisma.document.findFirst({
    where: { AND: [access, { id: documentId }] },
    select: { id: true, userId: true, departmentId: true, deletedAt: true, aclSyncedAt: true, project: { select: { departmentId: true } } },
  });
  if (!document) return { error: fail("Document not found or inaccessible", 404) };
  return { user, role, document };
}

export async function GET(_req, { params }) {
  const { orgId, documentId } = await params;
  const a = await context(orgId, documentId);
  if (a.error) return a.error;
  const [fields, canEdit] = await Promise.all([
    prisma.metadataField.findMany({
      where: { orgId },
      include: {
        termSet: { select: { id: true, name: true, readOnly: true, terms: { select: { id: true, label: true, status: true, depth: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } } },
        documentTerms: { where: { documentId, status: "accepted" }, include: { term: { select: { id: true, label: true, status: true } } } },
      },
      orderBy: [{ facetOrder: "asc" }, { name: "asc" }],
    }),
    canManageDocument(a.document, { userId: a.user.id, role: a.role }),
  ]);
  return NextResponse.json({ fields, canEdit });
}

// Replace the manual tags of one field. On a single-value field a manual
// choice replaces the classifier's (`auto` / `import`) tag; a SharePoint tag
// (`source_system`) is never removed, so a conflicting choice is refused.
export async function PUT(req, { params }) {
  const { orgId, documentId } = await params;
  const a = await context(orgId, documentId);
  if (a.error) return a.error;
  if (!(await canManageDocument(a.document, { userId: a.user.id, role: a.role }))) {
    return fail("Not permitted to tag this document", 403);
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.fieldId !== "string" || !Array.isArray(body.termIds) || body.termIds.length > 50 || body.termIds.some((x) => typeof x !== "string")) {
    return fail("Invalid field or terms");
  }
  const ids = [...new Set(body.termIds)];
  const field = await prisma.metadataField.findFirst({ where: { id: body.fieldId, orgId }, include: { termSet: true } });
  if (!field) return fail("Field not found", 404);
  if (field.termSet.readOnly) return fail("This field's terms are managed outside KMS", 403);
  if (!field.multi && ids.length > 1) return fail("This field takes one term");
  if (field.required && ids.length === 0) return fail("This field is required");
  const terms = await prisma.term.findMany({ where: { id: { in: ids }, termSetId: field.termSetId, status: "active" }, select: { id: true, label: true } });
  if (terms.length !== ids.length) return fail("Invalid or deprecated term");

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const current = await tx.documentTerm.findMany({ where: { documentId, fieldId: field.id }, select: { id: true, termId: true, source: true, status: true } });
      if (!field.multi && current.some((t) => t.source === "source_system" && t.status === "accepted" && !ids.includes(t.termId))) {
        throw new Error("TAXONOMY_SOURCE_CONFLICT");
      }
      const replaced = current.filter((t) => t.source === "manual" || (!field.multi && (t.source === "auto" || t.source === "import")));
      await tx.documentTerm.deleteMany({ where: { id: { in: replaced.map((t) => t.id) } } });
      const now = new Date();
      for (const termId of ids) {
        const kept = current.find((t) => t.termId === termId && !replaced.includes(t));
        if (!kept) {
          await tx.documentTerm.create({ data: { documentId, fieldId: field.id, termId, source: "manual", status: "accepted", createdById: a.user.id, acceptedById: a.user.id, acceptedAt: now } });
        } else if (kept.status !== "accepted") {
          await tx.documentTerm.update({ where: { id: kept.id }, data: { status: "accepted", acceptedById: a.user.id, acceptedAt: now } });
        }
      }
      // The Category field mirrors the legacy Document.category (C-3).
      if (field.key === "category") {
        await tx.document.update({
          where: { id: documentId },
          data: { category: terms[0]?.label ?? null, categoryConfidence: terms[0] ? 1 : null },
        });
      }
      return { before: replaced.map((t) => ({ termId: t.termId, source: t.source })) };
    });
  } catch (error) {
    if (error?.message === "TAXONOMY_SOURCE_CONFLICT") {
      return fail("This field already has a different tag from SharePoint. KMS keeps source tags; change it in SharePoint instead.", 409);
    }
    throw error;
  }
  await logAudit({
    orgId, actorUserId: a.user.id, action: "taxonomy.document_tags.updated", entityType: "Document", entityId: documentId,
    before: { fieldId: field.id, tags: result.before }, after: { fieldId: field.id, termIds: ids },
  });
  return NextResponse.json({ termIds: ids });
}
