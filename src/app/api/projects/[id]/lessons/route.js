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
    departmentId: lesson.departmentId,
    authorUserId: lesson.authorUserId,
    authorName: lesson.author?.name || lesson.author?.email || "Unknown",
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
    canEdit,
  };
}

// Rank 11 FR-2/FR-5: manual capture + feed for a project's lessons. Mirrors
// /api/projects/[id]/timeline's RBAC shape (any org member with a resolved
// role can view — document-level content is separately gated elsewhere; a
// Lesson carries no document-level secrecy of its own).
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, orgId: true, userId: true, departmentId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, project.orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lessons = await prisma.lesson.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, email: true } } },
  });

  const serialized = await Promise.all(
    lessons.map(async (lesson) => {
      const canEdit = await canEditLesson({
        lesson,
        userId: user.id,
        role,
        projectOwnerId: project.userId,
      });
      return serializeLesson(lesson, canEdit);
    })
  );

  const canContribute = await canContributeToDepartment(role, project.departmentId, user.id);

  return NextResponse.json({ lessons: serialized, canContribute });
}

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, orgId: true, departmentId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, project.orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canContribute = await canContributeToDepartment(role, project.departmentId, user.id);
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
      orgId: project.orgId,
      projectId,
      departmentId: project.departmentId,
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
