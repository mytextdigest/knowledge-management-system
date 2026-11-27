export function snapshotVersion(document, versionNumber, actorUserId) {
  if (!document?.id || !Number.isSafeInteger(versionNumber) || versionNumber < 1)
    throw new Error('Invalid version snapshot');
  return {
    documentId: document.id, versionNumber,
    filePath: document.filePath ?? null,
    filename: document.filename ?? null,
    content: document.content ?? null,
    summary: document.summary ?? null,
    status: document.status ?? null,
    createdById: actorUserId ?? null,
  };
}
