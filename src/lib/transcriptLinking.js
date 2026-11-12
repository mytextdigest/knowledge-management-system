// EKP E11.5 (Workstream E, E-8): which recording a transcript belongs to
// (WS_E_CONTENT_COVERAGE.md §3.4). A transcript is linked automatically when
// it sits next to the recording (same SharePoint folder; for uploads, same
// person, org and project) and either
//   • shares its base name:   Weekly sync.mp4  ↔  Weekly sync.vtt / .docx
//   • follows Teams' naming:  <meeting>-YYYYMMDD_HHMMSS-Meeting Recording.mp4
//                             ↔ <meeting>-YYYYMMDD_HHMMSS-Meeting Transcript.docx|.vtt
// The link is checked again whenever either file is processed. A link a
// person set or removed (`transcriptLinkSource: "manual"`) is never changed
// by this. The transcript stays its own, searchable document; citations of
// a linked transcript point to the recording, at the cited time.
//
// Shared by the worker and the app, so relative imports only.

import { fileExtension, isMediaFile, MEDIA_EXTENSIONS } from "./fileFormats.js";

const TEAMS_SUFFIX = /\s*-\s*meeting\s+(?:recording|transcript)$/i;

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

const LINK_SELECT = {
  id: true, filename: true, sourceProvider: true, externalUrl: true, orgId: true, projectId: true, userId: true,
  createdAt: true, transcriptOfId: true, transcriptLinkSource: true,
};

/** Prisma filter: the document has time-window chunks (it was read as a transcript). */
export const HAS_TIME_CHUNKS = { chunks: { some: { metadata: { path: ["kind"], equals: "time" } } } };

function sameNameNextTo(doc, candidates) {
  const key = linkKey(doc.filename);
  const where = containerKey(doc);
  if (!key || !where) return [];
  return candidates.filter((c) => c.id !== doc.id && linkKey(c.filename) === key && containerKey(c) === where);
}

/**
 * Re-check the automatic links of a document the worker just processed.
 * For a recording: link the transcripts next to it. For a transcript: link
 * it to the recording next to it (the newest, if there are several), or
 * drop an automatic link that no longer matches. Returns what changed:
 * [{ transcriptId, recordingId | null }].
 */
export async function refreshAutoLinks(db, docId) {
  const doc = await db.document.findUnique({ where: { id: docId }, select: { ...LINK_SELECT, deletedAt: true } });
  if (!doc?.orgId || doc.deletedAt) return [];
  const key = linkKey(doc.filename);
  if (!key) return [];
  // Narrow by name in SQL (both names start with the shared part), then match exactly here.
  const named = { orgId: doc.orgId, deletedAt: null, filename: { startsWith: key, mode: "insensitive" } };
  const changes = [];

  if (isMediaFile(doc.filename)) {
    const transcripts = sameNameNextTo(doc, await db.document.findMany({
      where: { ...named, OR: [{ filename: { endsWith: ".vtt", mode: "insensitive" } }, { filename: { endsWith: ".docx", mode: "insensitive" } }], ...HAS_TIME_CHUNKS },
      select: LINK_SELECT,
    }));
    for (const t of transcripts) {
      if (t.transcriptLinkSource === "manual" || t.transcriptOfId === doc.id) continue;
      await db.document.update({ where: { id: t.id }, data: { transcriptOfId: doc.id, transcriptLinkSource: "auto" } });
      changes.push({ transcriptId: t.id, recordingId: doc.id });
    }
    return changes;
  }

  if (!mayBeTranscript(doc.filename) || doc.transcriptLinkSource === "manual") return [];
  const isTranscript = (await db.document.count({ where: { id: doc.id, ...HAS_TIME_CHUNKS } })) > 0;
  const recordings = isTranscript
    ? sameNameNextTo(doc, await db.document.findMany({
        where: { ...named, OR: MEDIA_EXTENSIONS.map((ext) => ({ filename: { endsWith: ext, mode: "insensitive" } })) },
        select: LINK_SELECT,
        orderBy: { createdAt: "desc" },
      }))
    : [];
  const recordingId = recordings[0]?.id ?? null;
  if (recordingId === doc.transcriptOfId) return [];
  await db.document.update({
    where: { id: doc.id },
    data: { transcriptOfId: recordingId, transcriptLinkSource: recordingId ? "auto" : null },
  });
  return [{ transcriptId: doc.id, recordingId }];
}
