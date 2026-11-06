# Document page: workspace UI (port from My Text Digest)

Decided 2026-11-06 (Johurul). Ships on `feature/ekp-ws-e` in the same PR as WS-E milestone E-M1.

## Goal

Give the KMS document page (`src/app/(app)/document/page.jsx`) the same workspace layout as My Text Digest's document page, while keeping the KMS sidebar. The MTD source is `~/my-text-digest-ws/my-text-digest-saas`, branch `workspace-ui-redesign`, commit `554e6b6`. Its spec is `docs/WORKSPACE_UI_REDESIGN_FEATURE_SPEC.md` in that repo. Copy MTD's markup and class names; don't re-derive them.

## What the page becomes

- **Layout:** the page fills the space to the right of the sidebar at full height, with no card, margin or padding. A draggable splitter sits between the columns; it is limited to 30–70% and its position is remembered in `localStorage` as `split:document`.
- **Header rows:** each column starts with a 48px (`h-12`) header row, and the two rows line up.
  - **Left:** "← Back", the filename, "Open in SharePoint" when the file came from there, and the viewer's toolbar (page box, zoom, hand tool, fit to width, thumbnails, rotate, download, print and ⋮). As the column narrows, controls move into ⋮.
  - **Right:** tabs as filled buttons that scroll sideways, and 🗑 (clear chat) shown only on the Chat tab.
- **Chat:** answers have no bubble and render as markdown. Questions sit in a light-blue bubble with the send time. Each answer has a copy/print/expand group. The input box grows with the text, up to 40% of the panel.
- **Notices:** "Due for review", "May be outdated" and "Superseded" become thin banners under the left header row.

## KMS tabs (MTD's product tabs are not ported)

Chat, Summary, Pagewise Summary, Details, Versions, History, Workflow (repository documents), Insights.

**Not ported:** Slides, Figures, Tables and Graph; chat image attachments; general-knowledge answers. These are MTD product features with no KMS backend.

## Where KMS differs from MTD

| Area | MTD | KMS |
|---|---|---|
| Height | `calc(100vh - 4rem)` under a top nav bar | Full screen height; there is no top bar, and the sidebar is fixed on the left |
| Two-column breakpoint | 1024px | 1280px, because the 268px sidebar takes space |
| Download | Owner of the document only | KMS document access rules. A SharePoint file with no stored copy (A-14) shows "Open in SharePoint" instead |
| PowerPoint | — | `SlideDeckViewer` in the same frame |
| 👍/👎 feedback | New columns on `Message` / `ProjectMessage` | Deferred: it needs a shared-DB migration, so a schema-only PR on `dev` must come first |
| Chat answer format | Light markdown | Document chat switches from "plain text only" to MTD's light-markdown wording. Org chat stays as it is |

## Phases (one commit each)

1. **Shell.**
   - Port `TwoColumnLayout` (`resizable`, splitter, `useIsDesktop` so only one layout variant mounts).
   - Add `.no-scrollbar` and port `DocumentTabs`.
   - Build the two header rows; drop the right column's card.
   - Turn the notices into banners.
2. **Chat.**
   - Port `MarkdownMessage`, `ChatMessage`, `MessageActions` and `ChatComposer`.
   - Port `ExpandedMessageModal` alignment.
   - Change the document ask route's prompt to light markdown and remove the markdown stripping on that route.
3. **Viewer.**
   - Port `viewer/*` (`ViewerToolbar`, `FileViewerFrame`, `ImageViewer`, `PdfPage`, `PdfThumbnails`, `useNearPages`) and the new `PdfViewer`; stay on pdf.js 2.16.
   - Add `printDocument.js` and `GET /api/documents/[id]/download` with KMS access checks.
   - Put the DOCX, TXT, spreadsheet and slide viewers in `FileViewerFrame`.
4. **Global CSS fixes.**
   - Move the primary colour scale into `@theme inline`, replacing the 40 hand-written `.bg/.text/.border/.ring-primary-*` classes.
   - Move the default border colour into `@layer base`; the unlayered `* { border-color: hsl(var(--border)) }` turns every border near-black.
   - These touch every page, so the other pages need a visual check afterwards.

## Verification

- **Tests and build:** unit tests where there's logic (download access, markdown prompt), the JSX parse check, and `next build` with the dev server stopped.
- **By hand (Johurul):**
  - The PDF, PPTX, DOCX, TXT and XLSX pages in light and dark mode.
  - The splitter, and controls moving into ⋮ as the left column narrows.
  - A chat question that produces headings and bullets.
  - Download, print and Open in new tab.
  - A window narrower than 1280px (single column with a Document/Chat switcher).
  - After phase 4, the other pages: repository, org chat, settings, governance.
