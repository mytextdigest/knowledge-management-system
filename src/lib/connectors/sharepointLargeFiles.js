// EKP A-24: SharePoint files above the integration's size limit (8 GB videos,
// NYPA Q&A #188). They're recorded like any synced file (draft for Needs
// Review, permissions, link back to SharePoint) with status
// "skipped_too_large" and nothing else: never downloaded, never chunked. A
// file that grew past the limit loses its stored copy and its stale chunks.
//
// Imported by the worker, so relative imports only.

import { aclWriteData } from "./sharepointAcl.js";

export const TOO_LARGE = "skipped_too_large";

/**
 * The writes for one too-large file, to run in one transaction.
 * `createFields` are the fields of a newly synced document (worker's
 * newDocumentFields); `freedBytes` is what removing its stored copy freed.
 */
export function tooLargeFileWrites(db, { existing, modifiedAt, sourceFields, aclRows, createFields, connectedByUserId, freedBytes = 0n }) {
  const data = {
    filePath: null,
    content: null,
    status: TOO_LARGE,
    externalModifiedAt: new Date(modifiedAt),
    ...sourceFields,
  };
  return [
    ...(existing ? [db.chunk.deleteMany({ where: { documentId: existing.id } })] : []),
    existing
      ? db.document.update({ where: { id: existing.id }, data: { ...data, ...(aclRows ? aclWriteData(aclRows) : {}) } })
      : db.document.create({ data: { ...data, ...createFields, ...(aclRows ? aclWriteData(aclRows, { create: true }) : {}) } }),
    ...(freedBytes ? [db.user.update({ where: { id: connectedByUserId }, data: { storageUsedBytes: { decrement: freedBytes } } })] : []),
  ];
}

/** Whether the chunk job must leave this document alone (never download it). */
export function isTooLargeToIndex(doc) {
  return doc?.status === TOO_LARGE && !doc.filePath;
}
