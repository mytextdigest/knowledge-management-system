import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveOrgRole } from "@/lib/orgGuard";
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
    departmentId: lesson.departmentId,
    authorUserId: lesson.authorUserId,
    authorName: lesson.author?.name || lesson.author?.email || "Unknown",
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
    canEdit,
    canPublish,
  };
}

async function loadLessonWithProject(projectId, lessonId) {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, projectId },
    include: {
      author: { select: { name: true, email: true } },
      project: { select: { id: true, orgId: true, userId: true, departmentId: true } },
    },
  });
  return lesson;
}

export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, lessonId } = await params;
  const lesson = await loadLessonWithProject(projectId, lessonId);
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, lesson.project.orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const projectOwnerId = lesson.project?.userId;
  if (!(await canEditLesson({ lesson, userId: user.id, role, projectOwnerId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data = {};

  if (body.whatHappened !== undefined) {
    const value = String(body.whatHappened).trim();
    if (!value) return NextResponse.json({ error: "whatHappened cannot be empty" }, { status: 400 });
    data.whatHappened = value.slice(0, MAX_TEXT_LENGTH);
  }
  if (body.whatWorked !== undefined) data.whatWorked = body.whatWorked ? String(body.whatWorked).trim().slice(0, MAX_TEXT_LENGTH) : null;
  if (body.whatDidntWork !== undefined) data.whatDidntWork = body.whatDidntWork ? String(body.whatDidntWork).trim().slice(0, MAX_TEXT_LENGTH) : null;
  if (body.recommendation !== undefined) data.recommendation = body.recommendation ? String(body.recommendation).trim().slice(0, MAX_TEXT_LENGTH) : null;
  if (body.topic !== undefined) data.topic = body.topic ? String(body.topic).trim().slice(0, MAX_TOPIC_LENGTH) : null;
  if (body.status !== undefined) {
    if (!["draft", "published"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    // Publishing (draft -> published) is reviewer-only, regardless of
    // general edit rights on the lesson — an author allowed to fix a typo in
    // their own draft is not automatically allowed to promote it to
    // published knowledge. See canManageLesson's doc comment.
    if (body.status === "published" && lesson.status !== "published") {
      if (!(await canManageLesson({ lesson, userId: user.id, role, projectOwnerId }))) {
        return NextResponse.json(
          { error: "Only a department admin or the project owner can publish a lesson" },
          { status: 403 }
        );
      }
    }
    data.status = body.status;
  }

  const updated = await prisma.lesson.update({
    where: { id: lessonId },
    data,
    include: { author: { select: { name: true, email: true } } },
  });

  const [canEdit, canPublish] = await Promise.all([
    canEditLesson({ lesson: updated, userId: user.id, role, projectOwnerId }),
    canManageLesson({ lesson: updated, userId: user.id, role, projectOwnerId }),
  ]);
  return NextResponse.json(serializeLesson(updated, { canEdit, canPublish }));
}

export async function DELETE(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId, lessonId } = await params;
  const lesson = await loadLessonWithProject(projectId, lessonId);
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, lesson.project.orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await canEditLesson({ lesson, userId: user.id, role, projectOwnerId: lesson.project?.userId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.lesson.delete({ where: { id: lessonId } });
  return NextResponse.json({ success: true });
}
