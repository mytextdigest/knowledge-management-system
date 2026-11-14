// Document statuses while the worker is still on a document (shared by the
// document page's polling, the document API and documentReprocess.js).
// No imports, so it is safe in client bundles.
export const PROCESSING_STATUSES = new Set([
  "queued", "extracting", "running_ocr", "transcribing", "chunked",
  "embedding", "embedded", "summarizing", "clustering",
]);

export const isProcessingStatus = (status) => PROCESSING_STATUSES.has(status);

// Settled statuses where the file itself is the problem (KMS can't open it,
// or it's above the SharePoint size limit). Reprocessing can't fix these;
// the document cards already say what to do.
export const FILE_PROBLEM_STATUSES = new Set(["password_protected", "unreadable_file", "skipped_too_large"]);
