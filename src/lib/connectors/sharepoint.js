import { BaseConnector } from "./base.js";
import { getFolderTree, getDelta, downloadFileContent } from "../msGraph.js";

// Implements FR-1's contract for SharePoint. Takes an already-obtained
// app-only access token (see msGraph.getAppOnlyToken) and the target site's
// Graph site ID — this class does no auth of its own, by design, so it stays
// agnostic to how the caller manages token lifetime/refresh.
export class SharePointConnector extends BaseConnector {
  constructor({ accessToken, siteId }) {
    super();
    if (!accessToken) throw new Error("SharePointConnector requires accessToken");
    if (!siteId) throw new Error("SharePointConnector requires siteId");
    this.accessToken = accessToken;
    this.siteId = siteId;
  }

  async getFolderTree() {
    const items = await getFolderTree({ accessToken: this.accessToken, siteId: this.siteId });
    return items.map((item) => ({
      externalId: item.id,
      name: item.name,
      isFolder: !!item.folder,
    }));
  }

  async listChanges(cursor) {
    const { items, deltaLink } = await getDelta({
      accessToken: this.accessToken,
      siteId: this.siteId,
      cursor,
    });
    const changes = items
      .filter((item) => item.file) // skip folder entries — sync ingests files only
      .map((item) => ({
        externalId: item.id,
        name: item.name,
        modifiedAt: item.lastModifiedDateTime,
        size: item.size,
        deleted: !!item.deleted,
      }));
    return { changes, cursor: deltaLink };
  }

  async downloadFile(externalId) {
    return downloadFileContent({ accessToken: this.accessToken, siteId: this.siteId, itemId: externalId });
  }
}
