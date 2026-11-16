// EKP E11.5 (Workstream E): attaching a transcript to a recording in the
// upload dialogs. A media file in the list can carry one transcript
// (`entry.transcript`); it's uploaded right after the recording with
// `transcriptOf` = the recording's new document id, linked by hand (see
// /api/documents/ingest). A .vtt or .docx picked in the same batch with the
// recording's name is attached to it automatically, when exactly one
// recording in the batch has that name.
import { checkFileFormat, checkFileSize, isMediaFile } from "./fileFormats.js";
import { linkKey, mayBeTranscript } from "./transcriptLinking.js";

export const TRANSCRIPT_ACCEPT = ".vtt,.docx";

/** The transcript part of a list entry: { file, name, size, error }. */
export function transcriptEntry(file) {
  let error = "";
  const format = checkFileFormat(file.name);
  if (!format.ok) error = format.reason;
  else if (!mayBeTranscript(file.name)) error = "A transcript is a .vtt file or a Teams Word transcript (.docx).";
  else {
    const size = checkFileSize(file.size, file.name);
    if (!size.ok) error = size.reason;
  }
  return { file, name: file.name, size: file.size, error };
}

/**
 * Pair transcripts with recordings in a list of upload entries ({ id, name,
 * status, transcript? }). A pending .vtt/.docx entry moves onto the one
 * pending recording with its name that has no transcript yet; anything
 * ambiguous stays as it is.
 */
export function pairByName(entries) {
  const recordings = entries.filter((e) => e.status === "pending" && isMediaFile(e.name) && !e.transcript);
  const moved = new Map(); // recording id → transcript entry
  for (const e of entries) {
    if (e.status !== "pending" || !mayBeTranscript(e.name)) continue;
    const same = recordings.filter((r) => linkKey(r.name) === linkKey(e.name) && !moved.has(r.id));
    if (same.length === 1) moved.set(same[0].id, e);
  }
  if (!moved.size) return entries;
  const gone = new Set([...moved.values()].map((t) => t.id));
  return entries
    .filter((e) => !gone.has(e.id))
    .map((e) => (moved.has(e.id) ? { ...e, transcript: transcriptEntry(moved.get(e.id).file) } : e));
}
