import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { canManageDocument, canViewDocument } from "@/lib/access/documentAccess";
import { logAudit } from "@/lib/auditLog";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { isMediaFile, MEDIA_EXTENSIONS } from "@/lib/fileFormats";
import { HAS_TIME_CHUNKS } from "@/lib/transcriptLinking";
import { dropGeneratedTranscript } from "@/lib/generatedTranscript";
import { queueChapters } from "@/lib/mediaQueue";

// EKP E11.5 (Workstream E, E-8): link a transcript to its recording by hand,
// or unlink it (§3.4). The route is on either document:
//   on a transcript:  PUT { recordingId }   (null unlinks)
//   on a recording:   PUT { transcriptId, linked: true | false }
// A link set or removed here is "manual", and a sync never changes it.
// Who: whoever may manage the transcript (its uploader, a super admin, or an
// admin of its department), who can also open the recording.
// GET ?q= lists what this document can be linked to (recordings for a
// transcript, transcripts for a recording) that the user can open.

const SELECT = {
  id: true, userId: true, orgId: true, filename: true, departmentId: true, lifecycle: true, deletedAt: true,
  aclSyncedAt: true, transcriptOfId: true, transcriptLinkSource: true, createdAt: true,
  project: { select: { departmentId: true } },
};

const transcriptWhere = {
  OR: [{ filename: { endsWith: ".vtt", mode: "insensitive" } }, { filename: { endsWith: ".docx", mode: "insensitive" } }],
  ...HAS_TIME_CHUNKS,
};
const recordingWhere = { OR: MEDIA_EXTENSIONS.map((ext) => ({ filename: { endsWith: ext, mode: "insensitive" } })) };

async function load(id) {
  return prisma.document.findFirst({ where: { id, deletedAt: null }, select: SELECT });
}

async function viewer(email, doc) {
  if (!doc?.orgId) return null;
  const { user, role } = await resolveOrgRole(email, doc.orgId);
  if (!user || !role) return null;
  const canView = (d) => d.userId === user.id || canViewDocument(d, { userId: user.id, role });
  return (await canView(doc)) ? { user, role, canView } : null;
}

const isTranscript = async (id) => (await prisma.document.count({ where: { id, ...transcriptWhere } })) > 0;

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await load(id);
  const who = await viewer(session.user.email, doc);
  if (!who) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recording = isMediaFile(doc.filename);
  if (!recording && !(await isTranscript(doc.id))) return NextResponse.json({ items: [] });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 200);
  const rows = await prisma.document.findMany({
    where: {
      orgId: doc.orgId, deletedAt: null, id: { not: doc.id },
      AND: [recording ? transcriptWhere : recordingWhere, ...(q ? [{ filename: { contains: q, mode: "insensitive" } }] : [])],
    },
    select: SELECT,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const items = [];
  for (const row of rows) {
    if (await who.canView(row)) {
      items.push({ id: row.id, filename: row.filename, createdAt: row.createdAt, linked: recording ? row.transcriptOfId === doc.id : doc.transcriptOfId === row.id });
    }
  }
  return NextResponse.json({ items });
}

export async function PUT(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const doc = await load(id);
  const who = await viewer(session.user.email, doc);
  if (!who) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve both ends: the transcript, and the recording it should point to (or null).
  let transcript;
  let recordingId;
  if (isMediaFile(doc.filename)) {
    if (typeof body?.transcriptId !== "string") return NextResponse.json({ error: "transcriptId is required" }, { status: 400 });
    transcript = await load(body.transcriptId);
    if (!transcript || transcript.orgId !== doc.orgId || !(await who.canView(transcript))) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }
    if (body.linked === false && transcript.transcriptOfId !== doc.id) {
      return NextResponse.json({ error: "That transcript isn't linked to this recording" }, { status: 409 });
    }
    recordingId = body.linked === false ? null : doc.id;
  } else {
    transcript = doc;
    if (body?.recordingId !== null && typeof body?.recordingId !== "string") {
      return NextResponse.json({ error: "recordingId is required (null to unlink)" }, { status: 400 });
    }
    recordingId = body.recordingId;
  }

  if (!(await isTranscript(transcript.id))) {
    return NextResponse.json({ error: "KMS didn't read this file as a transcript (a .vtt or a Teams Word transcript)" }, { status: 400 });
  }
  if (recordingId) {
    const recording = recordingId === doc.id ? doc : await load(recordingId);
    if (!recording || recording.orgId !== transcript.orgId || !isMediaFile(recording.filename) || !(await who.canView(recording))) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }
  }
  if (!(await canManageDocument(transcript, { userId: who.user.id, role: who.role }))) {
    return NextResponse.json({ error: "Only the transcript's uploader or an admin of its department can change its link" }, { status: 403 });
  }

  const before = { transcriptOfId: transcript.transcriptOfId, transcriptLinkSource: transcript.transcriptLinkSource };
  const after = { transcriptOfId: recordingId, transcriptLinkSource: "manual" };
  await prisma.document.update({ where: { id: transcript.id }, data: after });
  await logAudit({
    orgId: transcript.orgId,
    actorUserId: who.user.id,
    action: recordingId ? AUDIT_EVENTS.DOCUMENT_TRANSCRIPT_LINKED : AUDIT_EVENTS.DOCUMENT_TRANSCRIPT_UNLINKED,
    entityType: "document",
    entityId: transcript.id,
    before,
    after,
  });
  // E-10: a provided transcript replaces KMS's own; E-11: chapters follow the transcript.
  if (recordingId) await dropGeneratedTranscript(prisma, recordingId);
  for (const rec of new Set([recordingId, before.transcriptOfId].filter(Boolean))) {
    await queueChapters(rec).catch((err) => console.error(`Couldn't queue chapters for ${rec}:`, err.message));
  }
  return NextResponse.json({ transcriptId: transcript.id, ...after });
}
