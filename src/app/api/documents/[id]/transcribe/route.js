export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { canManageDocument } from "@/lib/access/documentAccess";
import { logAudit } from "@/lib/auditLog";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { isMediaFile } from "@/lib/fileFormats";
import { ACTIVE_JOB_STATUSES, generatedChunkCount, hasLinkedTranscript } from "@/lib/generatedTranscript";
import { DEFAULT_PROVIDER } from "@/lib/transcription";
import { queueMediaWork } from "@/lib/mediaQueue";

// EKP E11.3 (Workstream E, E-10): "Transcribe" on a recording's page, and
// "Try again" after a failed transcription. Starts at once, whether or not
// automatic transcription is on. Not for a recording that has a transcript
// (it's used instead), that KMS already transcribed, or that is being
// transcribed. Who: whoever may manage the recording.
export async function POST(_req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, orgId: true, userId: true, filename: true, departmentId: true, lifecycle: true, aclSyncedAt: true, durationSeconds: true,
      project: { select: { departmentId: true } },
    },
  });
  if (!doc?.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user || !role || !(await canManageDocument(doc, { userId: user.id, role }))) {
    return NextResponse.json({ error: "Only the recording's uploader or an admin of its department can transcribe it" }, { status: 403 });
  }
  if (!isMediaFile(doc.filename)) return NextResponse.json({ error: "Only recordings can be transcribed" }, { status: 400 });
  if (await hasLinkedTranscript(prisma, doc.id)) {
    return NextResponse.json({ error: "This recording has a transcript; KMS uses it instead" }, { status: 409 });
  }
  if ((await generatedChunkCount(prisma, doc.id)) > 0) {
    return NextResponse.json({ error: "KMS has already transcribed this recording" }, { status: 409 });
  }
  const active = await prisma.mediaJob.findFirst({ where: { documentId: doc.id, kind: "transcribe", status: { in: ACTIVE_JOB_STATUSES } } });
  if (active?.status === "running") return NextResponse.json({ error: "This recording is being transcribed" }, { status: 409 });

  // A queued automatic job (still waiting) is replaced by one that starts now.
  if (active) await prisma.mediaJob.update({ where: { id: active.id }, data: { status: "cancelled", finishedAt: new Date(), error: "Replaced by a transcription started by hand" } });
  const job = await prisma.mediaJob.create({
    data: { orgId: doc.orgId, documentId: doc.id, kind: "transcribe", status: "queued", provider: DEFAULT_PROVIDER },
  });
  await queueMediaWork({ type: "transcribe", docId: doc.id, jobId: job.id, auto: false });
  await logAudit({
    orgId: doc.orgId,
    actorUserId: user.id,
    action: AUDIT_EVENTS.DOCUMENT_TRANSCRIPTION_REQUESTED,
    entityType: "document",
    entityId: doc.id,
    before: null,
    after: { jobId: job.id, provider: DEFAULT_PROVIDER, durationSeconds: doc.durationSeconds ?? null },
  });
  return NextResponse.json({ job: { id: job.id, status: job.status, progress: 0 } }, { status: 202 });
}
