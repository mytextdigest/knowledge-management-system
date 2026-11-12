// EKP E11.4 (Workstream E, E-4): the one list of file formats KMS can read.
//
// Used by the upload dialogs, the upload APIs (presign + ingest, which is the
// authoritative check) and the SharePoint sync (an unsupported file is listed
// as skipped with a reason instead of being downloaded and failing in the
// worker). Add a format here only when the worker can extract it.
//
// Imported by the worker, so no "@/..." imports.

export const SUPPORTED_FORMATS = [
  { ext: ".pdf", label: "PDF" },
  { ext: ".docx", label: "Word" },
  { ext: ".pptx", label: "PowerPoint" },
  { ext: ".xlsx", label: "Excel" },
  { ext: ".xls", label: "Excel" },
  { ext: ".csv", label: "CSV" },
  { ext: ".txt", label: "Text" },
  // E-M2 (E11.5, E11.6): recordings and their transcripts. A Teams Word
  // transcript is a .docx, recognised by its content.
  { ext: ".mp4", label: "Video", media: "video" },
  { ext: ".mov", label: "Video", media: "video" },
  { ext: ".m4a", label: "Audio", media: "audio" },
  { ext: ".mp3", label: "Audio", media: "audio" },
  { ext: ".wav", label: "Audio", media: "audio" },
];

export const SUPPORTED_EXTENSIONS = SUPPORTED_FORMATS.map((f) => f.ext);

// For <input accept>.
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(",");

// For the upload dialogs' help line.
export const SUPPORTED_FORMATS_TEXT =
  "PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx, .xls), CSV, TXT, video (.mp4, .mov) and audio (.mp3, .m4a, .wav)";

export const MEDIA_EXTENSIONS = SUPPORTED_FORMATS.filter((f) => f.media).map((f) => f.ext);

// Old binary Office formats: readable after "Save as" in Office.
const SAVE_AS = { ".ppt": ".pptx", ".doc": ".docx" };

/** The lower-case extension of a file name, with the dot ("" if none). */
export function fileExtension(name) {
  const base = String(name || "").split(/[\\/]/).pop();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/**
 * Whether KMS can read a file, by its name.
 * Returns { ok: true, ext } or { ok: false, ext, reason } where reason is a
 * sentence to show the user as it is.
 */
export function checkFileFormat(name) {
  const ext = fileExtension(name);
  if (SUPPORTED_EXTENSIONS.includes(ext)) return { ok: true, ext };
  if (SAVE_AS[ext]) {
    return { ok: false, ext, reason: `KMS can't read ${ext} files. Save it as ${SAVE_AS[ext]} and upload it again.` };
  }
  if (!ext) return { ok: false, ext, reason: "KMS can't read files without an extension." };
  return { ok: false, ext, reason: `KMS can't read ${ext} files yet.` };
}

export const isSupportedFile = (name) => checkFileFormat(name).ok;

/** "video" | "audio" for a recording, by its name; null otherwise. */
export function mediaKind(name) {
  return SUPPORTED_FORMATS.find((f) => f.ext === fileExtension(name))?.media || null;
}

export const isMediaFile = (name) => Boolean(mediaKind(name));
export const isVttFile = (name) => fileExtension(name) === ".vtt";

// EQ-5: the largest file a person can upload (dialogs, presign policy, ingest
// and replace). Uploads go from the browser straight to S3, but the worker
// reads a document into memory to extract it, so this guards the worker.
// Recordings are streamed to a temp file instead (E11.6), so they may be
// larger. SharePoint sync has its own admin setting (maxFileSizeMb, default
// 200 MB), which recordings bypass.
export const MAX_UPLOAD_MB = 100;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const MAX_UPLOAD_TEXT = `${MAX_UPLOAD_MB} MB`;
export const MAX_MEDIA_UPLOAD_MB = 2048;
export const MAX_MEDIA_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_MB * 1024 * 1024;
export const MAX_MEDIA_UPLOAD_TEXT = "2 GB";
// For the upload dialogs' help line.
export const UPLOAD_LIMITS_TEXT = `${MAX_UPLOAD_TEXT} each (recordings up to ${MAX_MEDIA_UPLOAD_TEXT})`;

/** The upload limit in bytes for a file name. */
export function maxUploadBytes(name) {
  return isMediaFile(name) ? MAX_MEDIA_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
}

/**
 * Whether a file is small enough to upload. Returns { ok: true } or
 * { ok: false, reason } where reason is a sentence to show the user as it is.
 * Without a name the document limit applies.
 */
export function checkFileSize(bytes, name = "") {
  const size = Number(bytes);
  const media = isMediaFile(name);
  const limit = media ? MAX_MEDIA_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (!Number.isFinite(size) || size <= limit) return { ok: true };
  const mb = Math.ceil(size / (1024 * 1024));
  return {
    ok: false,
    reason: media
      ? `This recording is ${mb} MB. Recordings are limited to ${MAX_MEDIA_UPLOAD_TEXT}; for larger ones, sync them from SharePoint.`
      : `This file is ${mb} MB. Uploads are limited to ${MAX_UPLOAD_TEXT}; for larger files, sync them from SharePoint.`,
  };
}
