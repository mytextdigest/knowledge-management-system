import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveOrgRole, canContributeToDepartment } from "@/lib/orgGuard";
import { canEditLesson } from "@/lib/lessonAccess";

const MAX_TEXT_LENGTH = 4000;
const MAX_TOPIC_LENGTH = 200;

function serializeLesson(lesson, canEdit = false) {
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
      const canEdit = await canEditLesson({
        lesson,
        userId: user.id,
        role,
        projectOwnerId: lesson.project?.userId || null,
      });
      return serializeLesson(lesson, canEdit);
    })
  );

  const canContribute = await canContributeToDepartment(role, deptId, user.id);

  return NextResponse.json({ lessons: serialized, canContribute });
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
  const status = body.status === "published" ? "published" : "draft";

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
      status,
    },
    include: { author: { select: { name: true, email: true } } },
  });

  return NextResponse.json(serializeLesson(lesson, true), { status: 201 });
}
