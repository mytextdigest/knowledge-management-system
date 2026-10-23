// EKP A-14: documents whose only copy is in the source system (no-copy
// mode). KMS serves their bytes by streaming from the source after its own
// access check (GET /api/documents/[id]/preview).

/** Whether the document's file can be streamed from its source. */
export function canStreamFromSource(doc) {
  return !doc?.filePath && doc?.sourceProvider === "sharepoint" && Boolean(doc.externalContainerId && doc.externalId);
}

/** The KMS URL that serves a no-copy document's file. */
export function sourcePreviewUrl(documentId, { download = false } = {}) {
  return `/api/documents/${documentId}/preview${download ? "?download=1" : ""}`;
}
