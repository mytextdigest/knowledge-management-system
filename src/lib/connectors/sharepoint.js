import { BaseConnector } from "./base.js";
import { getFolderTree, getDelta, downloadFileContent, getSiteDriveId } from "../msGraph.js";

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

  // A-9: each change also carries webUrl, the drive it lives in, and
  // permissionsChanged (sharing changed; the content may not have).
  async listChanges(cursor) {
    const { items, deltaLink } = await getDelta({
      accessToken: this.accessToken,
      siteId: this.siteId,
      cursor,
      sharingChanges: true,
    });
    const changes = items
      .filter((item) => item.file || (item.deleted && !item.folder)) // files only; folders aren't ingested
      .map((item) => ({
        externalId: item.id,
        name: item.name,
        modifiedAt: item.lastModifiedDateTime,
        size: item.size,
        deleted: !!item.deleted,
        webUrl: item.webUrl || null,
        driveId: item.parentReference?.driveId || null,
        permissionsChanged: item["@microsoft.graph.sharedChanged"] === true,
      }));
    return { changes, cursor: deltaLink };
  }

  // The id of the site's default document library (the drive delta walks).
  async getDriveId() {
    return getSiteDriveId({ accessToken: this.accessToken, siteId: this.siteId });
  }

  async downloadFile(externalId) {
    return downloadFileContent({ accessToken: this.accessToken, siteId: this.siteId, itemId: externalId });
  }
}
