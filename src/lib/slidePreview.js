// Slide previews (PowerPoint decks shown as designed, not just their text).
// The worker renders a stored deck to PDF with LibreOffice and keeps it at
// this key; a no-copy SharePoint deck is converted by SharePoint itself on
// request (GET /api/documents/[id]/preview?format=pdf), so KMS stores nothing.
// Shared by the worker and the API, so no imports.

export const slidePreviewKey = (documentId) => `previews/${documentId}/slides.pdf`;

export const isSlideDeck = (filename) => /\.pptx$/i.test(String(filename || ""));
