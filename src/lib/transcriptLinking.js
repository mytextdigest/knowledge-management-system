// EKP E11.5 (Workstream E, E-8): which recording a transcript belongs to
// (WS_E_CONTENT_COVERAGE.md §3.4). A transcript is linked automatically to a
// recording only when there is exactly one recording that
//   • sits next to it: the same SharePoint folder; for uploads, the same
//     person, org and project, uploaded within UPLOAD_WINDOW_DAYS of it;
//   • shares its name:  Weekly sync.mp4  ↔  Weekly sync.vtt / .docx, or
//                       <meeting>-YYYYMMDD_HHMMSS-Meeting Recording.mp4
//                       ↔ <meeting>-YYYYMMDD_HHMMSS-Meeting Transcript.docx|.vtt
//   • is as long as the transcript (lengthFits): the transcript's last line
//     is within the recording, and covers at least half of it.
// When none or several fit, nothing is linked: the document page lists the
// possible recordings (`linkSuggestions`) and a person picks one. KMS never
// guesses. The link is checked again whenever either file is processed. A
// link a person set or removed, or attached at upload
// (`transcriptLinkSource: "manual"`), is never changed by this, except that
// a file that turned out not to be a transcript is unlinked. The transcript
// stays its own, searchable document; citations of a linked transcript
// point to the recording, at the cited time.
//
// Shared by the worker and the app, so relative imports only.

import { fileExtension, isMediaFile, MEDIA_EXTENSIONS } from "./fileFormats.js";

const TEAMS_SUFFIX = /\s*-\s*meeting\s+(?:recording|transcript)$/i;

/** Uploads: a transcript and a recording uploaded further apart than this aren't paired automatically. */
export const UPLOAD_WINDOW_DAYS = 3;
const UPLOAD_WINDOW_MS = UPLOAD_WINDOW_DAYS * 24 * 3600 * 1000;

/** The name a recording and its transcript have in common (lower case). */
export function linkKey(name) {
  const base = String(name || "").split(/[\\/]/).pop();
  const ext = fileExtension(base);
  return (ext ? base.slice(0, -ext.length) : base).replace(TEAMS_SUFFIX, "").trim().toLowerCase();
}

/**
 * Where a document sits, for "next to each other": the SharePoint folder (its
 * link minus the file name), or for uploads the uploader, org and project.
 */
export function containerKey(doc) {
  if (doc.sourceProvider === "sharepoint") {
    if (!doc.externalUrl) return null;
    let url = String(doc.externalUrl).split(/[?#]/)[0];
    try { url = decodeURI(url); } catch { /* keep as is */ }
    return `sp:${url.slice(0, url.lastIndexOf("/")).toLowerCase()}`;
  }
  return `up:${doc.orgId || ""}:${doc.projectId || ""}:${doc.userId}`;
}

/** Could this file be a transcript (by name; a .docx must also read as one)? */
export const mayBeTranscript = (name) => [".vtt", ".docx"].includes(fileExtension(name));

/**
 * Does a transcript ending at `transcriptEnd` seconds belong to a recording
 * `durationSeconds` long? Its last line can't be after the end (a little
 * slack for rounding and trailing silence), and it must cover at least half
 * of the recording. An unknown length doesn't fit: the recording is checked
 * again once it has been probed.
 */
export function lengthFits(transcriptEnd, durationSeconds) {
  if (!(durationSeconds > 0) || !(transcriptEnd > 0)) return false;
  const slack = Math.max(15, durationSeconds * 0.02);
  return transcriptEnd <= durationSeconds + slack && transcriptEnd >= durationSeconds * 0.5;
}

/** Uploads must be close in time; SharePoint files are paired by folder alone. */
export function uploadedTogether(a, b) {
  if (a.sourceProvider === "sharepoint" || b.sourceProvider === "sharepoint") return true;
  return Math.abs(new Date(a.createdAt) - new Date(b.createdAt)) <= UPLOAD_WINDOW_MS;
}

const LINK_SELECT = {
  id: true, filename: true, sourceProvider: true, externalUrl: true, orgId: true, projectId: true, userId: true,
  createdAt: true, transcriptOfId: true, transcriptLinkSource: true, durationSeconds: true,
};

/** Prisma filter: the document has time-window chunks (it was read as a transcript). */
export const HAS_TIME_CHUNKS = { chunks: { some: { metadata: { path: ["kind"], equals: "time" } } } };

const TRANSCRIPT_FILES = { OR: [{ filename: { endsWith: ".vtt", mode: "insensitive" } }, { filename: { endsWith: ".docx", mode: "insensitive" } }] };
const RECORDING_FILES = { OR: MEDIA_EXTENSIONS.map((ext) => ({ filename: { endsWith: ext, mode: "insensitive" } })) };

function sameNameNextTo(doc, candidates) {
  const key = linkKey(doc.filename);
  const where = containerKey(doc);
  if (!key || !where) return [];
  return candidates.filter((c) => c.id !== doc.id && linkKey(c.filename) === key && containerKey(c) === where);
}

// Narrow by name in SQL (both names start with the shared part), then match exactly in sameNameNextTo.
const namedLike = (doc) => ({ orgId: doc.orgId, deletedAt: null, filename: { startsWith: linkKey(doc.filename), mode: "insensitive" } });

/** When the transcript's last line ends, in seconds (null if it has no timed lines). */
async function transcriptEnd(db, docId) {
  const chunks = await db.chunk.findMany({ where: { documentId: docId }, select: { metadata: true } });
  let end = null;
  for (const { metadata: m } of chunks) {
    if (m?.kind === "time" && Number.isFinite(m.end ?? m.start)) end = Math.max(end ?? 0, m.end ?? m.start);
  }
  return end;
}

/**
 * The recordings a transcript could belong to, each with why it can or can't
 * be linked automatically:
 *   "match"           the only one that fits → linked
 *   "ambiguous"       fits, but so does another one
 *   "length_differs"  the transcript is longer than it, or covers less than half
 *   "length_unknown"  the recording hasn't been probed (yet)
 *   "uploaded_apart"  uploads more than UPLOAD_WINDOW_DAYS apart
 * Returns { recordingId | null, candidates: [{ id, filename, durationSeconds, createdAt, reason }], end }.
 */
export async function matchRecordings(db, doc) {
  const key = linkKey(doc.filename);
  if (!key || !doc.orgId) return { recordingId: null, candidates: [], end: null };
  const end = await transcriptEnd(db, doc.id);
  const recordings = sameNameNextTo(doc, await db.document.findMany({
    where: { ...namedLike(doc), ...RECORDING_FILES },
    select: LINK_SELECT,
    orderBy: { createdAt: "desc" },
  }));
  const candidates = recordings.map((r) => ({
    id: r.id, filename: r.filename, durationSeconds: r.durationSeconds ?? null, createdAt: r.createdAt,
    reason: !uploadedTogether(doc, r) ? "uploaded_apart"
      : !(r.durationSeconds > 0) ? "length_unknown"
      : !lengthFits(end, r.durationSeconds) ? "length_differs"
      : "fits",
  }));
  const fitting = candidates.filter((c) => c.reason === "fits");
  for (const c of fitting) c.reason = fitting.length === 1 ? "match" : "ambiguous";
  return { recordingId: fitting.length === 1 ? fitting[0].id : null, candidates, end };
}

async function refreshTranscript(db, doc) {
  const previousRecordingId = doc.transcriptOfId ?? null;
  const isTranscript = (await db.document.count({ where: { id: doc.id, ...HAS_TIME_CHUNKS } })) > 0;
  if (!isTranscript) {
    // Not a transcript after all (a .docx that isn't one, even if attached as one): no link.
    if (!doc.transcriptOfId) return [];
    await db.document.update({ where: { id: doc.id }, data: { transcriptOfId: null, transcriptLinkSource: null } });
    return [{ transcriptId: doc.id, recordingId: null, previousRecordingId, reason: "not_a_transcript" }];
  }
  if (doc.transcriptLinkSource === "manual") return [];
  const { recordingId, candidates } = await matchRecordings(db, doc);
  if (recordingId === doc.transcriptOfId) return [];
  await db.document.update({
    where: { id: doc.id },
    data: { transcriptOfId: recordingId, transcriptLinkSource: recordingId ? "auto" : null },
  });
  const reason = recordingId ? "match"
    : candidates.some((c) => c.reason === "ambiguous") ? "ambiguous"
    : candidates.length ? candidates[0].reason
    : "no_recording";
  return [{ transcriptId: doc.id, recordingId, previousRecordingId, reason, candidates: candidates.length }];
}

/**
 * Re-check the automatic links of a document the worker just processed.
 * For a transcript: link it to its recording, or drop an automatic link that
 * no longer holds (when another recording now fits too, for instance). For a
 * recording: re-check every transcript with its name next to it the same way,
 * so a recording that arrives later can make a match ambiguous.
 * Returns what changed: [{ transcriptId, recordingId | null, previousRecordingId, reason }].
 */
export async function refreshAutoLinks(db, docId) {
  const doc = await db.document.findUnique({ where: { id: docId }, select: { ...LINK_SELECT, deletedAt: true } });
  if (!doc?.orgId || doc.deletedAt || !linkKey(doc.filename)) return [];

  if (isMediaFile(doc.filename)) {
    const transcripts = sameNameNextTo(doc, await db.document.findMany({
      where: { ...namedLike(doc), ...TRANSCRIPT_FILES, ...HAS_TIME_CHUNKS },
      select: LINK_SELECT,
      orderBy: { createdAt: "asc" },
    }));
    const changes = [];
    for (const t of transcripts) changes.push(...(await refreshTranscript(db, t)));
    return changes;
  }
  if (!mayBeTranscript(doc.filename)) return [];
  return refreshTranscript(db, doc);
}

/**
 * For the document page: what an unlinked document could be linked to.
 * A transcript: its candidate recordings with their reasons. A recording
 * with no transcript: unlinked transcripts with its name next to it (not
 * ones a person unlinked by hand), with why they weren't linked.
 */
export async function linkSuggestions(db, docId) {
  const doc = await db.document.findUnique({ where: { id: docId }, select: { ...LINK_SELECT, deletedAt: true } });
  if (!doc?.orgId || doc.deletedAt || !linkKey(doc.filename)) return [];
  if (!isMediaFile(doc.filename)) {
    if (doc.transcriptOfId) return [];
    return (await matchRecordings(db, doc)).candidates;
  }
  const transcripts = sameNameNextTo(doc, await db.document.findMany({
    where: { ...namedLike(doc), ...TRANSCRIPT_FILES, ...HAS_TIME_CHUNKS, transcriptOfId: null, transcriptLinkSource: null },
    select: LINK_SELECT,
    orderBy: { createdAt: "desc" },
  }));
  const out = [];
  for (const t of transcripts) {
    const c = (await matchRecordings(db, t)).candidates.find((x) => x.id === doc.id);
    if (c) out.push({ id: t.id, filename: t.filename, createdAt: t.createdAt, reason: c.reason });
  }
  return out;
}
