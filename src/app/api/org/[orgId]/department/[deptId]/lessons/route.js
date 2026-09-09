import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveOrgRole, canContributeToDepartment } from "@/lib/orgGuard";
import { canEditLesson, canManageLesson } from "@/lib/lessonAccess";

const MAX_TEXT_LENGTH = 4000;
const MAX_TOPIC_LENGTH = 200;

function serializeLesson(lesson, { canEdit = false, canPublish = false } = {}) {
  return {
    id: lesson.id,
    topic: lesson.topic,
    whatHappened: lesson.whatHappened,
    whatWorked: lesson.whatWorked,
    whatDidntWork: lesson.whatDidntWork,
    recommendation: lesson.recommendation,
    status: lesson.status,
    source: lesson.source,
    projectId: lesson.projectId,
    projectName: lesson.project?.name || null,
    departmentId: lesson.departmentId,
    authorUserId: lesson.authorUserId,
    authorName: lesson.author?.name || lesson.author?.email || "Unknown",
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
    canEdit,
    canPublish,
  };
}

// Rank 11 FR-2/FR-5: manual capture + feed for a department's lessons.
// Includes both department-only lessons and project-scoped lessons whose
// project belongs to this department (Lesson.departmentId is denormalized
// from Project.departmentId at creation time — see the project lessons
// route), so a department's feed is a complete view of its lessons.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, deptId } = await params;

  const department = await prisma.department.findFirst({
    where: { id: deptId, orgId },
    select: { id: true },
  });
  if (!department) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lessons = await prisma.lesson.findMany({
    where: { departmentId: deptId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true, email: true } },
      project: { select: { name: true, userId: true } },
    },
  });

  const serialized = await Promise.all(
    lessons.map(async (lesson) => {
      const projectOwnerId = lesson.project?.userId || null;
      const [canEdit, canPublish] = await Promise.all([
        canEditLesson({ lesson, userId: user.id, role, projectOwnerId }),
        canManageLesson({ lesson, userId: user.id, role, projectOwnerId }),
      ]);
      return serializeLesson(lesson, { canEdit, canPublish });
    })
  );

  const canContribute = await canContributeToDepartment(role, deptId, user.id);
  const canPublish = await canManageLesson({ lesson: { departmentId: deptId }, userId: user.id, role });

  return NextResponse.json({ lessons: serialized, canContribute, canPublish });
}

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, deptId } = await params;

  const department = await prisma.department.findFirst({
    where: { id: deptId, orgId },
    select: { id: true },
  });
  if (!department) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canContribute = await canContributeToDepartment(role, deptId, user.id);
  if (!canContribute) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const whatHappened = String(body.whatHappened || "").trim();
  if (!whatHappened) {
    return NextResponse.json({ error: "whatHappened is required" }, { status: 400 });
  }
  if (whatHappened.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "whatHappened is too long" }, { status: 400 });
  }

  const topic = body.topic ? String(body.topic).trim().slice(0, MAX_TOPIC_LENGTH) : null;
  const whatWorked = body.whatWorked ? String(body.whatWorked).trim().slice(0, MAX_TEXT_LENGTH) : null;
  const whatDidntWork = body.whatDidntWork ? String(body.whatDidntWork).trim().slice(0, MAX_TEXT_LENGTH) : null;
  const recommendation = body.recommendation ? String(body.recommendation).trim().slice(0, MAX_TEXT_LENGTH) : null;

  // Every lesson is created as a draft — publishing is a separate,
  // reviewer-only action (PATCH). See the matching comment in
  // /api/projects/[id]/lessons/route.js.
  const lesson = await prisma.lesson.create({
    data: {
      orgId,
      departmentId: deptId,
      topic,
      whatHappened,
      whatWorked,
      whatDidntWork,
      recommendation,
      authorUserId: user.id,
      source: "manual",
      status: "draft",
    },
    include: { author: { select: { name: true, email: true } } },
  });

  const canPublish = await canManageLesson({ lesson, userId: user.id, role });
  return NextResponse.json(serializeLesson(lesson, { canEdit: true, canPublish }), { status: 201 });
}
