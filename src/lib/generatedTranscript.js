// EKP E11.3 (Workstream E, E-10): a transcript KMS made itself is stored on
// the recording (its own time chunks, its content and summary). A recording
// has no other chunks, so "the recording has chunks" means "KMS transcribed
// it". Decided (Johurul, 2026-11-13): a provided transcript (.vtt or Teams
// Word) replaces KMS's own, because it names the speakers, so when one is
// linked the generated one is dropped.
//
// Shared by the worker and the app, so relative imports only.

import { isMediaFile } from "./fileFormats.js";

/**
 * Seconds an automatic transcription waits, so a transcript arriving with the
 * recording is used instead. Decided (Johurul, 2026-11-14): 10 minutes for a
 * recording from SharePoint sync, where Teams writes the transcript after the
 * recording and the next sync brings it; 1 minute for an upload, where the
 * transcript is attached or selected with the recording.
 */
export const AUTO_TRANSCRIBE_DELAY_SECONDS = { sharepoint: 600, upload: 60 };

/** The wait for this recording: SharePoint sync or upload. */
export function autoTranscribeDelaySeconds(doc) {
  return doc?.sourceProvider === "sharepoint" ? AUTO_TRANSCRIBE_DELAY_SECONDS.sharepoint : AUTO_TRANSCRIBE_DELAY_SECONDS.upload;
}

/** Statuses of a transcription job that is still to finish. */
export const ACTIVE_JOB_STATUSES = ["queued", "running"];

/** How many chunks KMS's own transcript of this recording has. */
export async function generatedChunkCount(db, recordingId) {
  return db.chunk.count({ where: { documentId: recordingId } });
}

/**
 * Removes KMS's own transcript of a recording (its chunks, the text and the
 * summary made from it). Returns the number of chunks removed.
 */
export async function dropGeneratedTranscript(db, recordingId) {
  const doc = await db.document.findUnique({ where: { id: recordingId }, select: { filename: true } });
  if (!doc || !isMediaFile(doc.filename)) return 0;
  const { count } = await db.chunk.deleteMany({ where: { documentId: recordingId } });
  if (count) await db.document.update({ where: { id: recordingId }, data: { content: null, summary: null } });
  return count;
}

/** Does the recording have a provided transcript linked (any, chunked or not yet)? */
export async function hasLinkedTranscript(db, recordingId) {
  return (await db.document.count({ where: { transcriptOfId: recordingId, deletedAt: null } })) > 0;
}
