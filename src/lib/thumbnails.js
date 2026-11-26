// EKP E13.3 (E-15): card thumbnails for visual content.
//
// The worker makes a small JPEG of a stored file and keeps it at
// thumbnails/{docId}.jpg (Document.thumbnailPath):
//   PDF    first page (pdftoppm)
//   PPTX   first page of the rendered slides (src/lib/slidePreview.js), or
//          the thumbnail PowerPoint saved inside the deck
//   image  the image, scaled down (sharp)
//   video  a frame at 1 s (ffmpeg)
// A no-copy SharePoint file has nothing stored: SharePoint's own thumbnail
// is passed through (GET /api/documents/[id]/thumbnail).
//
// Shared by the worker and the app, so no "@/..." imports.

export const THUMBNAIL_MAX_SIDE = 480;

export const thumbnailKey = (documentId) => `thumbnails/${documentId}.jpg`;

const KINDS = {
  ".pdf": "pdf",
  ".pptx": "slides",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".mp4": "video",
  ".mov": "video",
};

function extension(name) {
  const base = String(name || "").split(/[\\/]/).pop();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

/** "pdf" | "slides" | "image" | "video" for a file that gets a thumbnail, else null. */
export const thumbnailKind = (filename) => KINDS[extension(filename)] || null;

/**
 * The URL a card shows, or null. `doc` needs id, filename, thumbnailPath,
 * filePath, sourceProvider, contentType, externalId, externalUrl and
 * (optional) contentUpdatedAt or updatedAt for cache busting.
 */
export function thumbnailUrl(doc) {
  if (!doc?.id) return null;
  if (doc.thumbnailPath) {
    const at = doc.contentUpdatedAt || doc.updatedAt;
    const v = at ? `?v=${new Date(at).getTime()}` : "";
    return `/api/documents/${doc.id}/thumbnail${v}`;
  }
  const noCopy = !doc.filePath && doc.sourceProvider === "sharepoint" && doc.contentType === "file" && doc.externalId && doc.externalUrl;
  if (noCopy && thumbnailKind(doc.filename)) return `/api/documents/${doc.id}/thumbnail`;
  return null;
}
