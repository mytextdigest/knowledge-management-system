// EKP E11.5 (Workstream E, E-9): what the document page needs about a
// recording or a transcript. A recording gets its linked transcripts (the
// ones the user can open) with their timed chunks, for the Transcript tab and
// the summary. A transcript gets the recording it's linked to.
import { prisma } from "@/lib/prisma";
import { canViewDocument } from "@/lib/access/documentAccess";
import { mediaKind } from "@/lib/fileFormats";
import { timeOf } from "@/lib/transcripts";
import { linkSuggestions } from "@/lib/transcriptLinking";

const ACCESS = {
  id: true, filename: true, userId: true, orgId: true, departmentId: true, lifecycle: true, deletedAt: true,
  aclSyncedAt: true, project: { select: { departmentId: true } },
};

const timedChunks = (chunks) =>
  (chunks || [])
    .map((c) => { const t = timeOf(c); return t && { start: t.start, end: t.end, speakers: c.metadata?.speakers || [], text: c.text || "" }; })
    .filter(Boolean);

/**
 * doc: the document page's document (with chunks). Returns
 *   recording:  { kind: "video" | "audio", durationSeconds, transcripts: [{ id, filename, summary, linkSource, chunks }], suggestions }
 *   transcript: { kind: "transcript", recording: { id, filename } | null, linkSource, chunks, suggestions }
 *   otherwise null.
 * `suggestions`: when nothing is linked, the same-name files next to it and
 * why they weren't linked automatically (transcriptLinking.linkSuggestions).
 */
export async function documentMedia(doc, { userId, role, db = prisma }) {
  const canView = async (d) => d && !d.deletedAt && (d.userId === userId || (await canViewDocument(d, { userId, role, db })));
  const kind = mediaKind(doc.filename);
  if (kind) {
    const rows = await db.document.findMany({
      where: { transcriptOfId: doc.id, deletedAt: null },
      select: {
        ...ACCESS, summary: true, transcriptLinkSource: true,
        chunks: { select: { text: true, metadata: true, chunkIndex: true }, orderBy: { chunkIndex: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    const transcripts = [];
    for (const t of rows) {
      if (!(await canView(t))) continue;
      transcripts.push({ id: t.id, filename: t.filename, summary: t.summary, linkSource: t.transcriptLinkSource, chunks: timedChunks(t.chunks) });
    }
    const suggestions = transcripts.length ? [] : await visibleSuggestions(db, doc.id, canView);
    return { kind, durationSeconds: doc.durationSeconds ?? null, transcripts, suggestions };
  }
  if (!doc.chunks?.some((c) => timeOf(c))) return null;
  const recording = doc.transcriptOfId
    ? await db.document.findUnique({ where: { id: doc.transcriptOfId }, select: ACCESS })
    : null;
  return {
    kind: "transcript",
    recording: (await canView(recording)) ? { id: recording.id, filename: recording.filename } : null,
    linkSource: doc.transcriptLinkSource ?? null,
    chunks: timedChunks(doc.chunks),
    suggestions: recording ? [] : await visibleSuggestions(db, doc.id, canView),
  };
}

async function visibleSuggestions(db, docId, canView) {
  const out = [];
  for (const s of await linkSuggestions(db, docId).catch(() => [])) {
    const row = await db.document.findUnique({ where: { id: s.id }, select: ACCESS });
    if (await canView(row)) out.push({ id: s.id, filename: s.filename, durationSeconds: s.durationSeconds ?? null, reason: s.reason });
  }
  return out;
}
