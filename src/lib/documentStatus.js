// Document statuses while the worker is still on a document (shared by the
// document page's polling, the document API and documentReprocess.js).
// No imports, so it is safe in client bundles.
export const PROCESSING_STATUSES = new Set([
  "queued", "extracting", "running_ocr", "chunked",
  "embedding", "embedded", "summarizing", "clustering",
]);

export const isProcessingStatus = (status) => PROCESSING_STATUSES.has(status);
