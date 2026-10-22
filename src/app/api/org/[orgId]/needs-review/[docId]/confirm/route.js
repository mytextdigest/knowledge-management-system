import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications/notify";
import { publishingCompleteness, PUBLISH_SELECT } from "@/lib/governance/publishGate";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// FR-6 — Accept / Reassign / Create-Project. One endpoint, three shapes:
//   {}                                        -> Accept as-is
//   { departmentId }                          -> Reassign to a different department
//   { newProjectName, departmentId }          -> Create a new project under departmentId, assign the doc to it
// A document can be awaiting review for either of 7-J's two reasons —
// connector-synced and unconfirmed (`lifecycle: "draft"`) or classification-
// flagged (`classificationStatus: "needs_review"`, Rank 4) — independently
// of each other. All three actions clear both signals (`lifecycle:
// "published"`, `classificationStatus: "published"`) regardless of which
// reason brought the document here, so a document flagged by both is fully
// resolved in one action. Viewing and acting on the queue are both
// super_admin-only (NFR in requirements doc).
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, docId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const doc = await prisma.document.findFirst({
    where: { id: docId, orgId, scope: "repository" },
    select: {
      id: true, filename: true, filePath: true, departmentId: true, suggestedDepartmentId: true,
      sourceProvider: true, lifecycle: true, classificationStatus: true, userId: true, ownerId: true, visibility: true, deletedAt: true,
    },
  });
  if (!doc || doc.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.lifecycle !== "draft" && doc.classificationStatus !== "needs_review") {
    return NextResponse.json({ error: "Document is not awaiting review" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const { departmentId, newProjectName } = body || {};

  if (newProjectName && !departmentId) {
    return NextResponse.json({ error: "departmentId is required to create a project" }, { status: 400 });
  }

  // Accept-as-is (no explicit departmentId) promotes classification's
  // suggested department when there's no confirmed one yet — "accept" means
  // confirm the suggestion, not leave the document undeparmented.
  let targetDepartmentId = doc.departmentId || doc.suggestedDepartmentId || null;
  if (departmentId) {
    const dept = await prisma.department.findFirst({ where: { id: departmentId, orgId }, select: { id: true } });
    if (!dept) return NextResponse.json({ error: "Invalid department for this organization" }, { status: 400 });
    targetDepartmentId = departmentId;
  }

  // Publishing is blocked until all organization-required metadata is complete.
  // Evaluate against the confirmed department, not the unconfirmed suggestion.
  const publishDoc = await prisma.document.findFirst({
    where: { id: doc.id, orgId, scope: "repository", deletedAt: null },
    select: PUBLISH_SELECT,
  });
  if (!publishDoc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const completeness = await publishingCompleteness({
    ...publishDoc, departmentId: targetDepartmentId,
  });
  if (!completeness.complete) return NextResponse.json({
    error: "Required metadata incomplete", completeness,
  }, { status: 422 });

  // Atomic per the NFR: a project created but the document left unassigned
  // (or vice versa) must not happen — both succeed or neither does.
  // Claim the review exactly once. updateMany's conditional write ensures a
  // concurrent approval cannot create a second project or notification.
  // Match both review signals to avoid overwriting another review decision.
  let updatedDoc;
  try {
    updatedDoc = await prisma.$transaction(async (tx) => {
      const claim = await tx.document.updateMany({
        where: {
          id: doc.id, orgId, scope: "repository", deletedAt: null,
          lifecycle: doc.lifecycle,
          classificationStatus: doc.classificationStatus,
          OR: [{ lifecycle: "draft" }, { classificationStatus: "needs_review" }],
        },
        data: { lifecycle: "published", classificationStatus: "published" },
      });
      if (claim.count !== 1) return null;

      let projectId;
    if (newProjectName?.trim()) {
      const project = await tx.project.create({
        data: {
          name: newProjectName.trim(),
          orgId,
          departmentId: targetDepartmentId,
          userId: user.id,
        },
      });
      projectId = project.id;
    }

    const updated = await tx.document.update({
      where: { id: doc.id },
      data: {
        lifecycle: "published",
        classificationStatus: "published",
        departmentId: targetDepartmentId,
        suggestedDepartmentId: null,
        departmentSuggestionConfidence: null,
        ...(projectId ? { projectId, scope: "project" } : {}),
      },
      select: { id: true, filename: true, lifecycle: true, departmentId: true, projectId: true, scope: true },
    });

      return updated;
    });
  } catch (error) {
    // Prisma may surface a write conflict for simultaneous transactions.
    if (error?.code === "P2034") {
      return NextResponse.json({ error: "Document review changed; refresh and retry" }, { status: 409 });
    }
    throw error;
  }
  if (!updatedDoc) {
    return NextResponse.json({ error: "Document review already resolved or changed" }, { status: 409 });
  }

  // Safety net: FR-6 says confirming "kicks off chunk/embed/summarize for
  // connector-sourced documents that haven't yet run it" — the normal sync
  // path (7-C) already enqueues this at ingest time, so this only fires if
  // that somehow never completed (e.g. a prior worker crash before the
  // message was sent).
  if (doc.sourceProvider !== "manual") {
    const chunkCount = await prisma.chunk.count({ where: { documentId: doc.id } });
    if (chunkCount === 0) {
      const sqs = new SQSClient({ region: process.env.AWS_REGION });
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: process.env.SQS_QUEUE_URL,
          MessageBody: JSON.stringify({
            type: "chunk",
            docId: doc.id,
            s3Key: doc.filePath,
            filename: doc.filename,
            projectId: updatedDoc.projectId || null,
            userId: doc.userId,
            orgId,
            visibility: doc.visibility,
            regenerate: false,
          }),
        })
      );
    }
  }

  // Best-effort notification after confirmation. notify() rechecks current
  // organization membership and in-app preferences. Never notify the actor.
  // This is intentionally after the DB transaction and SQS safety net.
  const recipients = [...new Set([doc.ownerId, doc.userId].filter(Boolean))]
    .filter((recipientId) => recipientId !== user.id);
  if (recipients.length) {
    await notify({
      orgId,
      userIds: recipients,
      type: "content.published",
      title: "Document review approved",
      body: "A document you own or uploaded has been approved for publication.",
      link: `/document?id=${encodeURIComponent(doc.id)}`,
    });
  }

  return NextResponse.json({ document: updatedDoc });
}
