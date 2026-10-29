import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notifications/notify";
import { publishingCompleteness, PUBLISH_SELECT } from "@/lib/governance/publishGate";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { resolveOrgRole, canManageDepartment } from "@/lib/orgGuard";

// allowed[currentState][targetState] = roles permitted to make that transition
const ALLOWED_TRANSITIONS = {
  draft: {
    published: ["super_admin", "dept_admin"],
  },
  published: {
    archived: ["super_admin", "dept_admin"],
    retired:  ["super_admin"],
    draft:    ["super_admin"],
  },
  archived: {
    retired:   ["super_admin"],
    published: ["super_admin"],
    draft:     ["super_admin"],
  },
  retired: {
    published: ["super_admin"],
    draft:     ["super_admin"],
  },
};

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const newState = body?.lifecycle;
  if (!newState)
    return NextResponse.json({ error: "lifecycle is required" }, { status: 400 });

  // Lifecycle management only applies to repository-scoped documents
  const doc = await prisma.document.findFirst({
    where: { id, scope: "repository", deletedAt: null },
    select: PUBLISH_SELECT,
  });
  if (!doc || !doc.orgId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const permittedRoles = ALLOWED_TRANSITIONS[doc.lifecycle]?.[newState];
  if (!permittedRoles) {
    return NextResponse.json(
      { error: `Invalid transition: ${doc.lifecycle} → ${newState}` },
      { status: 400 }
    );
  }
  if (!permittedRoles.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // dept_admin can only transition documents in a department they administer;
  // org-wide documents (departmentId null) require super_admin
  if (role === "dept_admin") {
    const allowed = doc.departmentId && (await canManageDepartment(role, doc.departmentId, user.id));
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // E23.6: an active decommission definition gates direct archive/retire.
  // The final workflow decision applies the lifecycle transition atomically.
  if (["archived", "retired"].includes(newState)) {
    const decommissionGate = await prisma.workflowDefinition.findFirst({
      where: { orgId: doc.orgId, kind: "decommission", active: true },
      select: { id: true },
    });
    if (decommissionGate) return NextResponse.json({
      error: "Decommission workflow approval required",
      workflowDefinitionId: decommissionGate.id,
      targetLifecycle: newState,
    }, { status: 409 });
  }
  if (newState === "published") {
    const completeness = await publishingCompleteness(doc);
    if (!completeness.complete) {
      return NextResponse.json({ error: "Required metadata incomplete", completeness },
        { status: 422 });
    }
  }

  // Compare-and-swap prevents concurrent lifecycle changes from silently overwriting
  // each other and suppresses duplicate notifications for losing requests.
  const changed = await prisma.document.updateMany({
    where: { id, orgId: doc.orgId, scope: "repository", deletedAt: null,
      lifecycle: doc.lifecycle, departmentId: doc.departmentId },
    data: { lifecycle: newState },
  });
  if (changed.count !== 1) return NextResponse.json(
    { error: "Document changed; refresh and retry" }, { status: 409 }
  );
  const updated = { id, lifecycle: newState };

  const lifecycleEvents = {
    published: AUDIT_EVENTS.DOCUMENT_PUBLISHED,
    archived: AUDIT_EVENTS.DOCUMENT_ARCHIVED,
    retired: AUDIT_EVENTS.DOCUMENT_RETIRED,
    draft: AUDIT_EVENTS.DOCUMENT_RESTORED,
  };
  if (doc.lifecycle !== updated.lifecycle) {
    await logAudit({
      orgId: doc.orgId,
      actorUserId: user.id,
      action: lifecycleEvents[newState] ?? "document.lifecycle_changed",
      entityType: "document",
      entityId: id,
      before: { lifecycle: doc.lifecycle },
      after: { lifecycle: updated.lifecycle },
    });
  }
  // Best-effort after the document change; only the accountable owner is
  // notified, and notify() rechecks organization membership and preferences.
  if (doc.ownerId && doc.ownerId !== user.id &&
      (newState === "draft" || newState === "published")) {
    await notify({
      orgId: doc.orgId, userIds: [doc.ownerId],
      type: newState === "draft" ? "review.requested" : "content.published",
      title: newState === "draft" ? "Document needs review" : "Document published",
      body: "A document you own has changed lifecycle status.",
      link: `/document?id=${encodeURIComponent(id)}`,
    });
  }
  return NextResponse.json(updated);
}
