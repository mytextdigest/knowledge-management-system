// EKP A-14: documents whose only copy is in the source system (no-copy
// mode). KMS serves their bytes by streaming from the source after its own
// access check (GET /api/documents/[id]/preview).

/** Whether the document's file can be streamed from its source. */
export function canStreamFromSource(doc) {
  // Pages (A-15) have no file: only their text is kept.
  return (
    !doc?.filePath &&
    doc?.sourceProvider === "sharepoint" &&
    doc.contentType !== "page" &&
    Boolean(doc.externalUrl && doc.externalId)
  );
}

/** The KMS URL that serves a no-copy document's file. */
export function sourcePreviewUrl(documentId, { download = false } = {}) {
  return `/api/documents/${documentId}/preview${download ? "?download=1" : ""}`;
}
