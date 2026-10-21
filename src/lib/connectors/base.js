// FR-1 — Connector Abstraction (REQUIREMENTS_INGESTION_PIPELINE.md).
// Every platform connector (SharePoint now; Google Drive/Confluence/etc.
// later, per the Platform Rollout Order) implements this shape, so the
// scheduler, Needs-Review queue, and ingest path never need to know which
// provider they're talking to.
export class BaseConnector {
  // Returns { changes: [{ externalId, name, modifiedAt, size, deleted }], cursor }
  // `cursor` is opaque to callers — pass back whatever was last returned here
  // to resume from that point; omit it for an initial full listing.
  async listChanges(_cursor) {
    throw new Error("listChanges() not implemented");
  }

  // Returns a Buffer of the file's raw content.
  async downloadFile(_externalId) {
    throw new Error("downloadFile() not implemented");
  }

  // Returns a flat listing of the connected folder's immediate contents —
  // used by the connect-time site picker and for diagnostics, not sync.
  async getFolderTree() {
    throw new Error("getFolderTree() not implemented");
  }
}
