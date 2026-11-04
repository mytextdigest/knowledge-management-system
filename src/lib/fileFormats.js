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
  { ext: ".xlsx", label: "Excel" },
  { ext: ".xls", label: "Excel" },
  { ext: ".csv", label: "CSV" },
  { ext: ".txt", label: "Text" },
];

export const SUPPORTED_EXTENSIONS = SUPPORTED_FORMATS.map((f) => f.ext);

// For <input accept>.
export const ACCEPT_ATTRIBUTE = SUPPORTED_EXTENSIONS.join(",");

// For the upload dialogs' help line.
export const SUPPORTED_FORMATS_TEXT = "PDF, Word (.docx), Excel (.xlsx, .xls), CSV and TXT";

// Old binary Office formats: readable after "Save as" in Office.
const SAVE_AS = { ".doc": ".docx" };

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
