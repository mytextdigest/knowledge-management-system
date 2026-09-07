import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";
import { isExpertTopicAccessibleWithPrisma } from "@/lib/expertDiscoveryQuery.mjs";

const ACTIONS = new Set(["self_confirmed", "dismissed", "admin_confirmed"]);

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId, topicId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const source = String(body.source || "");
  const targetUserId = body.userId || user.id;
  if (!ACTIONS.has(source)) return NextResponse.json({ error: "Invalid expertise action" }, { status: 400 });

  const topicAccessible = await isExpertTopicAccessibleWithPrisma(prisma, {
    orgId,
    userId: user.id,
    topicId,
    isSuperAdmin: isSuperAdmin(role),
  });
  if (!topicAccessible) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

  if (source !== "admin_confirmed" && targetUserId !== user.id) {
    return NextResponse.json({ error: "You can only change your own expertise" }, { status: 403 });
  }

  if (source === "admin_confirmed") {
    if (role !== "dept_admin" && !isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!isSuperAdmin(role)) {
      const topic = await prisma.topic.findUnique({
        where: { id: topicId },
        select: { project: { select: { departmentId: true } }, topicDocuments: { select: { document: { select: { departmentId: true } } } } },
      });
      const deptIds = [...new Set([topic?.project?.departmentId, ...(topic?.topicDocuments || []).map((x) => x.document.departmentId)].filter(Boolean))];
      const manageable = [];
      for (const deptId of deptIds) if (await canManageDepartment(role, deptId, user.id)) manageable.push(deptId);
      if (!manageable.length) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const targetMembership = await prisma.departmentMember.findFirst({ where: { userId: targetUserId, departmentId: { in: manageable } } });
      if (!targetMembership) return NextResponse.json({ error: "Target user is outside your department" }, { status: 403 });
    }
  }

  const existing = await prisma.topicExpertise.findUnique({ where: { topicId_userId: { topicId, userId: targetUserId } } });
  const score = source === "dismissed" ? 0 : Math.max(Number(existing?.score || 0), source === "admin_confirmed" ? 2 : 1);
  const expertise = await prisma.topicExpertise.upsert({
    where: { topicId_userId: { topicId, userId: targetUserId } },
    create: { topicId, userId: targetUserId, score, source, confirmedBy: source === "admin_confirmed" ? user.id : null, lastSignalAt: new Date() },
    update: { score, source, confirmedBy: source === "admin_confirmed" ? user.id : null },
  });
  return NextResponse.json({ expertise });
}
