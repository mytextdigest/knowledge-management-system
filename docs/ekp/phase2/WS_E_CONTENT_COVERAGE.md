# Workstream E: Content Coverage (Phase 2)

|                       |                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------- |
| **Owner**             | Johurul                                                                               |
| **Reviewer**          | Sandeep or Simran                                                                     |
| **Requirements**      | **Part 1:** E11.1, E11.3, E11.4, E11.5, E11.6, E11.7 (PowerPoint, video, transcripts) · **Part 2:** E11.2, E13, E14 (images, previews/thumbnails, templates) · **Phase 1 carry-over:** `A-23` (PRS E16.5), `A-16` (RFP §6 S2 SAML) |
| **Foundations used**  | F1 document access, F2 audit, F3 scheduled jobs, F5 org settings, F6 workflow engine (E14) |
| **Phase 2 window**    | Mon 2 Nov – Thu 26 Nov 2026 (code-complete), integration to Mon 30 Nov                 |
| **Branch**            | `feature/ekp-ws-e` (one branch for the phase, one PR per milestone; see [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md) §3) |
| **Status**            | E-M1 merged to `dev` (PR #36, 2026-11-07). E-M2 (E-6 to E-9) and E-10, E-11 of E-M3 (transcription, chapters) in one PR to `dev` (2026-11-14). E-12 (SAML) is the last E-M3 task, not started. E-M4 outlined, detail it before it starts. |

**Source documents (don't copy from them, link to them):**

- Requirements and acceptance criteria: [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (§4.4 E11, E13, E14; E16.5; NFRs)
- Architecture and design: [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§5.5)
- Phase 1 designs carried over: [WS_A_M365_CONNECTORS.md](../phase1/WS_A_M365_CONNECTORS.md) (§4 A1 step 9 for SAML; A2 "Existing managed metadata" for `A-23`; `A-24` notes)
- NYPA's answers: `docs/ekp/Copy of Attachment 5 - Q+A format NYPA Response_updated10.22.26.xlsx` ("Q&A #n")
- Plan, workflow and status board: [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md) · Phase 2 calendar and shared files: [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md)

## 1. Scope

Workstream E has two parts. Both are in this document. Part 1 is NYPA's main content and comes first; part 2 follows.

| Milestone | Part | Covers | Due | Demo |
| --- | --- | --- | --- | --- |
| **E-M1** PowerPoint searchable + SharePoint tags kept | 1 + carry-over | `A-23` (E16.5), E11.4, E11.1 | **Fri 6 Nov** | A PPTX is cited as "slide 7"; an unsupported file is rejected with a clear message; a SharePoint file arrives with its managed-metadata values |
| **E-M2** Video with transcript | 1 | E11.5, E11.3 (transcript path), E11.6 | **Fri 13 Nov** | A Teams recording + its VTT in SharePoint: a chat answer cites 12:34 and the player opens there; a 2 GB video is processed with flat worker memory |
| **E-M3** Transcription, chapters, SAML | 1 + carry-over | E11.3 (no-transcript path), E11.7, `A-16` (S2) | **Fri 20 Nov** | An MP3 with no transcript is transcribed and cited at a timestamp; a video shows a chapter list; a user signs in through a SAML enterprise app |
| **E-M4** Images, previews, templates | 2 | E11.2, E13, E14 | **Thu 26 Nov** | A scanned image is found by its text; cards show thumbnails for PDF, PPTX, image and video; a How-To is created from a template and published |

**E-M2 is the milestone that matters most for the NYPA demo** (due within 2 weeks of shortlisting, Q&A #84). If E-M4 runs late, **E14 templates** is the first task to move to the start of Phase 3 (the status deck originally scheduled E there).

**Out of scope for Phase 2:**

- Transcribing recordings that stay in organizers' OneDrive. Only SharePoint sites are in scope (Q&A #159).
- Speaker identification beyond what the VTT or Word transcript already contains.
- OCR and transcription for Content Server (connector is after award; NYPA expects very few Content Server videos to need it, Q&A #115).
- PPTX rendering to images for thumbnails if it needs LibreOffice; the fallback is the slide's embedded thumbnail (see E-M4).

## 2. NYPA answers that affect E

| NYPA said | Effect | Q&A # |
| --- | --- | --- |
| In-scope SharePoint content is about 1,500 files, **mostly PPT, PDF and MP4**; file types are "MS Office files, PDF, mp3/mp4, VTT, potentially others". | PPTX, MP4, MP3, M4A, VTT and DOCX transcripts are the formats to add. Legacy `.ppt` is rejected with a "save as .pptx" message (E11.4). | 44, 132, 185 |
| About **300 hours of recordings** today, about 120 hours a year more; 60 knowledge-transfer events in 2026, 120 expected, meetings 1–3 hours or longer. | Transcription runs as background jobs with progress, one recording at a time per org by default. Cost and time per hour of audio are measured for the proposal (Q&A #230). | 17, 62 |
| Recordings are mostly Teams, some Zoom. Transcripts usually reach SharePoint as **VTT or Word** files. NYPA accepts working from existing transcripts, and accepts a **list of topic segments with start and end times** as video segmentation. | Use the transcript when it exists (E11.3, E11.5); transcribe only when it doesn't. E11.7 = chapter list. | 18 |
| Videos rarely exceed 3–4 GB but **can reach 8 GB**. | Stream to a temp file; extract the audio track; never hold the video in memory (E11.6). Replaces the `A-24` size guard for media. | 188 |
| **OCR on images** is expected; most images are unprocessed today. | E11.2 in part 2. Tesseract is already a dependency. | 96, 97, 115 |
| AI providers are approved case by case; NYPA data must not train models; processing stays in the US. | The transcription provider is an **org setting** (F5), not hard-coded, with OpenAI Whisper as the default and an Azure OpenAI (US region) option. NYPA must approve it (NFR-7, NFR-11, S9). | 32, 180, 192 |
| Semaphore has already tagged about 250,000 items in SharePoint managed-metadata columns; existing metadata must be preserved if content moves. | `A-23` keeps those values on synced documents so C can map them to terms. | 128, 234 |
| "Login with NYPA Active Directory (SAML)" (RFP §6 S2). Not answered whether OIDC is enough. | `A-16` SAML 2.0, unchanged from the Phase 1 design. | — |

## 3. Shared design

### 3.1 Data model (in `P2-1`)

> **Already in the schema (`P2-1`, 2026-10-29).** All Phase 2 models and fields for C, D and E are in `prisma/schema.prisma` and one migration, `20261029070816_ekp_p2_schema`. You don't write a migration for them. Field-level detail and the reasons for each shape: [PHASE2_SCHEMA_CHANGES.md](PHASE2_SCHEMA_CHANGES.md) §6. If you need a change, see that doc's §8.

| Part | Model / field | Notes |
| --- | --- | --- |
| 1 (`A-23`) | `DocumentSourceTag`: `documentId`, `sourceSystem` (default `sharepoint`), `fieldName`, `fieldDisplayName`, `label`, `termGuid`, `termSetGuid`, `syncedAt` | Raw values only. Unique (`documentId`, `fieldName`, `termGuid`). C maps rows to `DocumentTerm` by `termGuid = Term.termStoreGuid` (`C-8`) |
| 1 | `MediaJob`: `orgId`, `documentId`, `kind` (`extract_audio` \| `transcribe` \| `segment`), `status` (`queued` \| `running` \| `done` \| `failed`), `progress` 0–100, `provider`, `audioSeconds`, `costUsd`, `attempts`, `error`, `startedAt`, `finishedAt` | One row per job: history, retries, minutes and cost (Q&A #230, EQ-1). The document page shows the latest job |
| 1 | `Document.transcriptOfId` (self-relation, `SetNull`), `transcriptLinkSource` (`auto` \| `manual`), `durationSeconds`, `mediaSegments Json` (`[{ title, start, end }]`) | A sync never overwrites a `manual` link (§3.4) |
| 1 | `SyncRun.filesSkipped` | `A-24` per-run skipped count, deferred from Phase 1 |
| 2 | `Document.thumbnailPath` | S3 `thumbnails/{docId}.jpg` (E13) |
| 2 | `AssetTemplate` (`orgId`, `name`, `status`, `createdById`) + `AssetTemplateVersion` (`templateId`, `version`, `sections Json`, `requiredFields Json`) | Versions are immutable (E14.4). `Document.templateVersionId` is `Restrict`: a version in use can't be deleted |
| 2 | `Document.templateVersionId`, `Document.assetData Json` | `assetData` holds the structured sections; `content` keeps the rendered text for search and chunking |

SAML Jackson (`A-16`) creates its own tables in the separate `jackson` Postgres schema, outside Prisma. Run its first start against the shared database only after telling the team, and confirm `prisma migrate diff` still reports no drift.

### 3.2 Chunk metadata (the contract D and the chat UI read)

`Chunk.metadata` already exists (Json). New keys:

| Format | Keys | Citation label |
| --- | --- | --- |
| PPTX | `{ kind: "slide", slide: 7, title: "…", hasNotes: true }` | "slide 7" |
| VTT / Word transcript, audio, video | `{ kind: "time", start: 754.2, end: 812.0, speakers: ["…"] }` (seconds) | "12:34" |
| Image | `{ kind: "image", ocr: true }` | — |

The chat route and search cards turn these into labels and deep links: a slide citation opens the document viewer at that slide; a time citation opens the recording at `?t=<start>`. When a transcript is linked to a recording, **citations point to the recording**, not the transcript.

### 3.3 Media pipeline (worker)

```
source (S3 or Graph) ──stream──▶ temp file ──ffmpeg──▶ audio (mono, 16 kHz, low bitrate)
                                          │
              linked transcript exists? ──┴─ yes ─▶ parse VTT/Word ─┐
                                          no ─▶ split audio ≤ 25 MB ─▶ transcription provider ─┤
                                                                                              ▼
                                       time-window chunks (≈ 60–90 s, cue-aligned) ─▶ embed ─▶ segments (LLM) ─▶ done
```

- Temp files live under the worker's temp dir and are deleted in a `finally`. Worker memory must stay flat regardless of file size (E11.6 test).
- `ffmpeg` is on the dev machine (`/usr/bin/ffmpeg`); the worker image must include it (check the deploy image in `E-6`).
- Media jobs are separate from the normal document job, write a `MediaJob` row per step (status, progress, attempts, cost), and can be retried from the document page.
- `A-24` stays for non-media files above the size limit. For media types, the guard no longer skips: the file is streamed. Files the guard skipped earlier are picked up on their next sync (clear their skip status in `E-6`).

### 3.4 Transcript ↔ recording linking (E11.5)

A transcript is linked to a recording when, in the same folder, they share a base name (`Weekly sync.mp4` + `Weekly sync.vtt` / `.docx`), or match the Teams pattern (`<meeting> -YYYYMMDD_HHMMSS-Meeting Recording.mp4` + `… -Meeting Transcript.docx|.vtt`). The link is re-checked when either file syncs. A dept_admin can link or unlink manually on the document page. An unlinked transcript is still searchable on its own, cited by timestamp.

## 4. Milestones

Each milestone ends with a PR from `feature/ekp-ws-e` into `dev`, opened one working day before the due date, and a demo on `dev` at the weekly meeting.

### E-M1 PowerPoint searchable + SharePoint tags kept (due Fri 6 Nov)

- **Build:** `E-2` schema: already done in `P2-1` (§3.1). `E-3` `A-23`: during SharePoint sync read `/drives/{d}/items/{i}/listItem?$expand=fields`, store taxonomy-field values as `DocumentSourceTag` rows, show them on the document page (raw, until C maps them). `E-4` E11.4: one allow-list module shared by upload (`UploadToRepositoryModal.jsx`), the upload API and the SharePoint mime filter; unsupported files are rejected with "KMS can't read .xyz files yet" (upload) or listed as skipped with a reason (sync). `E-5` E11.1 PPTX: unzip with `jszip` (add it as a direct dependency; today it only comes in through `mammoth`), read `ppt/slides/slideN.xml` and `ppt/notesSlides/notesSlideN.xml` in presentation order, one chunk per slide (title + body + notes), `metadata.slide`; viewer opens at a slide.
- **Edge cases:** a slide with no text (skip, keep numbering); hidden slides (index, mark hidden); a password-protected PPTX (fail with a clear status); a SharePoint item with several taxonomy fields or multi-value fields (one row per value); a tag removed in SharePoint (row deleted on the next sync).
- **Demo script:** (1) Upload a 20-slide PPTX; ask a question answered on slide 7; the citation says "slide 7" and opens there. (2) Upload a `.ppt` and a `.exe`: both refused with a clear message. (3) In the test tenant, set a managed-metadata value on a SharePoint file, sync, and show it on the KMS document page.
- **Acceptance:** E11.1 and E11.4; `A-23` acceptance from WS-A ("a file with a managed-metadata value in the test tenant arrives with that value stored on the document").

### E-M2 Video with transcript (due Fri 13 Nov)

- **Build:** `E-6` E11.6 streaming: S3 and Graph downloads stream to a temp file; media types bypass the `A-24` skip; previously skipped media are re-queued. `E-7` VTT parser (cues, speakers from `<v>` tags) and Word transcript parser (Teams "speaker  hh:mm:ss" lines via `mammoth`), chunked by time window with `metadata.start/end`. `E-8` transcript ↔ recording linking (§3.4); recordings with a linked transcript use it and never call the transcription provider; `durationSeconds` from `ffprobe`. `E-9` in-app media player (HTML5 video/audio from the existing preview stream, which already streams from SharePoint without buffering) that honours `?t=`; time citations in chat and search.
- **Demo script:** (1) Put a Teams-style recording and its VTT in a SharePoint test site and sync. (2) Ask a question answered at 12:34; the citation says "12:34" and the player opens there. (3) Show the worker log: no transcription call. (4) Process a 2 GB test video and show the worker's memory staying flat.
- **Acceptance:** E11.5; E11.3 transcript path; E11.6 (2 GB test with flat memory, impl spec §5.5 tests).

### E-M3 Transcription, chapters, SAML (due Fri 20 Nov)

- **Build:** `E-10` transcription when there's no transcript: extract audio, split into ≤ 25 MB pieces on silence, transcribe with segment timestamps through a provider interface (`openai-whisper` default, `azure-openai` option; provider and on/off are F5 org settings, off by default until an admin turns it on), stitch offsets, chunk by time; progress shown on the document; cost and minutes logged per job. `E-11` E11.7 segments: one LLM pass over the timestamped transcript returns `[{ title, start, end }]`, stored in `mediaSegments`, shown as a chapter list beside the player. `E-12` `A-16` SAML 2.0 exactly as designed in WS-A §4 A1 step 9 (embedded `@boxyhq/saml-jackson`, `BoxyHQSAMLProvider`, per-org IdP metadata upload in Settings → Single sign-on, same `signIn` callback as OIDC).
- **Demo script:** (1) Upload a 10-minute MP3 with no transcript; watch progress; ask a question and get a timestamp citation. (2) Open a 1-hour recording: the chapter list jumps the player to each topic. (3) Sign in through the SAML enterprise app in the test tenant and land on the same KMS user as with OIDC.
- **Acceptance:** E11.3 no-transcript path; E11.7; WS-A `A-16` acceptance ("the same user signs in through SAML and lands on the same KMS user"); PRS E11 acceptance for the part 1 formats.

### E-M4 Images, previews, templates (due Thu 26 Nov)

- **Build:** `E-13` schema: already done in `P2-1` (§3.1). `E-14` E11.2 images (PNG, JPG): Tesseract OCR plus a vision-model description, both indexed, `metadata.kind = image`. `E-15` E13 thumbnails into S3 `thumbnails/{docId}.jpg`: PDF first page (`pdfjs-dist`), PPTX embedded `docProps/thumbnail.jpeg` (fallback: a generic slide icon), image downscale (`sharp`), video frame at 1 s (`ffmpeg`); shown on repository and search cards; in-app preview for images, slides and video. `E-16` E14 templates: admin defines How-To, FAQ, SOP and Key Takeaways templates (sections, guidance, required fields) in settings; "New from template" opens an editor; the asset enters B's publishing workflow (F6) and is ingested like any document; template versions keep existing assets unchanged.
- **Demo script:** (1) Upload a photo of a nameplate; search for the serial number on it; it's found. (2) Repository shows thumbnails for a PDF, a PPTX, an image and a video, and each previews in-app. (3) As admin, create a "How-To" template; as a member, create a How-To from it and submit; a reviewer publishes it; it appears in search.
- **Acceptance:** PRS E11 (image), E13 and E14 acceptance.

## 5. Open questions

| # | Question | Who decides | Default until decided |
| --- | --- | --- | --- |
| EQ-1 | Which transcription provider will NYPA approve (OpenAI Whisper, Azure OpenAI in a US region, other)? | NYPA, after award (NFR-11, S9) | Provider interface; OpenAI default for our demo. **Decided 2026-11-13 (Johurul):** OpenAI for now; automatic transcription **on by default** (an admin can turn it off). Azure is added to the provider list once NYPA approves it. |
| EQ-2 | Should KMS transcribe a recording that has a transcript of poor quality? | Team | No; a dept_admin can force "re-transcribe" |
| EQ-3 | Keep a stored copy of media for playback, or always stream from SharePoint? | Team, with no-copy mode (A-14) | Stream from SharePoint; S3 only for uploads |
| EQ-4 | Is the PPTX embedded thumbnail good enough, or do we render slides (LibreOffice in the worker image)? | Team (Johurul) | **Decided 2026-11-07:** render. Decks must look as designed in KMS, so the worker renders stored decks with LibreOffice; no-copy SharePoint decks are converted by SharePoint. See §7. E-M4 card thumbnails can reuse the rendered first page. |
| EQ-5 | Manual upload limit: `/api/s3/upload` caps uploads at 10 MB and a larger file fails with a vague "S3 upload failed." NYPA decks with images and recordings exceed it. | Team (Johurul) | **Decided 2026-11-06:** 100 MB for manual uploads, shown in both upload dialogs and checked when a file is chosen. SharePoint sync keeps its own admin setting (200 MB default). See §7. |

## 6. Task tracker

> Source of truth for task status. Set `IN_PROGRESS` and `Started` when you begin, `DONE` and `Completed` when merged to `dev`, in the same PR. Record design changes as dated notes in §7. `A-16` and `A-23` are tracked here for Phase 2; mark them in the WS-A tracker as moved to `E-12` and `E-3`.

| Status | Meaning |
| --- | --- |
| `TODO` | Not started |
| `IN_PROGRESS` | Being worked on |
| `REVIEW` | PR open |
| `DONE` | Merged to `dev` |
| `BLOCKED` | Waiting on a dependency or NYPA |
| `SKIP` | Deferred or out of scope |

| Task ID | Milestone · Title | Status | Assignee | Depends On | PR | Started | Completed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `E-1` | Finalize this document (shared design + E-M1), reviewed by Sandeep or Simran | `DONE` | Johurul | — | | 2026-10-29 | 2026-11-04 |
| `E-2` | E-M1 · Schema: `DocumentSourceTag`, `MediaJob`, part 1 `Document` media fields, `SyncRun.filesSkipped` | `DONE` | Johurul | — | `P2-1` (`20261029070816_ekp_p2_schema`) | 2026-10-29 | 2026-10-29 |
| `E-3` | E-M1 · **`A-23`**: store SharePoint managed-metadata values on synced documents (PRS E16.5) | `DONE` | Johurul | `E-2` | #36 | 2026-11-04 | 2026-11-07 |
| `E-4` | E-M1 · E11.4: shared format allow-list (upload, API, SharePoint filter); clear rejection messages | `DONE` | Johurul | `E-1` | #36 | 2026-11-04 | 2026-11-07 |
| `E-5` | E-M1 · E11.1: PPTX slides + notes, one chunk per slide, "slide N" citations, viewer opens at slide | `DONE` | Johurul | `E-4` | #36 | 2026-11-04 | 2026-11-07 |
| `E-M1` | **Milestone PR + demo: PowerPoint searchable + SharePoint tags kept** (due Fri 6 Nov) | `DONE` | Johurul | `E-3`–`E-5` | #36 | 2026-11-04 | 2026-11-07 |
| `E-6` | E-M2 · E11.6: stream S3/Graph to temp file; media bypass the `A-24` skip; re-queue skipped media; `ffmpeg` in worker image | `DONE` | Johurul | `E-M1` | | 2026-11-12 | 2026-11-14 |
| `E-7` | E-M2 · E11.5: VTT + Word transcript parsers, time-window chunks | `DONE` | Johurul | `E-M1` | | 2026-11-12 | 2026-11-14 |
| `E-8` | E-M2 · Transcript ↔ recording linking; use the transcript, no transcription call | `DONE` | Johurul | `E-6`, `E-7` | | 2026-11-12 | 2026-11-14 |
| `E-9` | E-M2 · Media player with `?t=`; timestamp citations in chat and search | `DONE` | Johurul | `E-8` | | 2026-11-12 | 2026-11-14 |
| `E-M2` | **Milestone PR + demo: Video with transcript** (due Fri 13 Nov) | `DONE` | Johurul | `E-6`–`E-9` | | 2026-11-12 | 2026-11-14 |
| `E-10` | E-M3 · E11.3: transcription fallback (provider interface, F5 setting, ≤ 25 MB pieces, progress, cost log) | `DONE` | Johurul | `E-M2` | | 2026-11-13 | 2026-11-14 |
| `E-11` | E-M3 · E11.7: topic segments + chapter list | `DONE` | Johurul | `E-8` | | 2026-11-13 | 2026-11-14 |
| `E-12` | E-M3 · **`A-16`**: SAML 2.0 via embedded SAML Jackson + `BoxyHQSAMLProvider` (RFP §6 S2) | `TODO` | Johurul | `E-1` | | | |
| `E-M3` | **Milestone PR + demo: Transcription, chapters, SAML** (due Fri 20 Nov) | `IN_PROGRESS` | Johurul | `E-10`–`E-12` | | 2026-11-13 | |
| `E-13` | E-M4 · Schema: `thumbnailPath`, `AssetTemplate`, `AssetTemplateVersion`, `Document.templateVersionId`, `assetData` | `DONE` | Johurul | — | `P2-1` (`20261029070816_ekp_p2_schema`) | 2026-10-29 | 2026-10-29 |
| `E-14` | E-M4 · E11.2: images, OCR + vision caption | `TODO` | Johurul | `E-M3` | | | |
| `E-15` | E-M4 · E13: thumbnails (PDF, PPTX, image, video) + in-app previews | `TODO` | Johurul | `E-13` | | | |
| `E-16` | E-M4 · E14: templates, editor, F6 publishing, versioning (first to move to Phase 3 if late) | `TODO` | Johurul | `E-13` | | | |
| `E-M4` | **Milestone PR + demo: Images, previews, templates** (due Thu 26 Nov) | `TODO` | Johurul | `E-14`–`E-16` | | | |
| `E-17` | Update RTM for E11, E13, E14 (and E16.5, S2); run `P2-INT` cross-testing (27–30 Nov) | `TODO` | Johurul | `E-M4`, `C-M4`, `D-M4` | | | |

## 7. Implementation notes

Add a dated note when a task changes the design (e.g. `2026-11-03 · E-5: hidden slides are indexed but marked hidden`).

- `2026-10-29 · Phase 2 kickoff (Johurul):` `A-16` and `A-23` move from WS-A into this workstream as `E-12` and `E-3`. They waited only for WS-A and WS-B to merge (both shared-database changes); that condition is met. Workstream E covers both parts in Phase 2; E14 is the first task to move to Phase 3 if E-M4 runs late.
- `2026-11-04 · E-4:` The allow-list is `src/lib/fileFormats.js` (`checkFileFormat`), used by both upload dialogs, `POST /api/s3/upload`, `POST /api/documents/ingest` (authoritative, 415 `UNSUPPORTED_FORMAT`), `POST /api/documents/[id]/replace` and the SharePoint sync. `.ppt` and `.doc` get a "save it as .pptx / .docx" message. In the sync, unsupported files are never downloaded. They count in `SyncRun.filesSkipped` together with `A-24` too-large files, and their names and reasons go into one `sync.files_skipped` audit entry per run (`entityType: "SyncRun"`), which the sync history shows under "Files not indexed". No schema change. The worker's extension checks are now case-insensitive.
- `2026-11-04 · E-5:` A password-protected `.pptx` (an OLE compound file, not a zip) ends with document status `password_protected`, and a broken one with `unreadable_file`. The chunk job returns instead of throwing, so SQS doesn't retry it, and the document cards explain the status. Chunk metadata adds `of` (slide count) to the §3.2 contract: `{ kind: "slide", slide, of, title, hasNotes, hidden?, part? }`. `part` appears only when a slide over 6,000 characters is split. SmartArt text is indexed. Chart text is not. The viewer (`SlideDeckViewer`) shows the text KMS read from each slide, with notes, and `/document?id=…&slide=N` scrolls to slide N. It is not a rendered image of the slide (E-M4 thumbnails, EQ-4). Chat citations carry `slides`, `locator` ("slide 7") and `viewerUrl`. Excerpts reach the model tagged `[slide N]`.
- `2026-11-04 · E-3:` Tags are read for every file a sync writes (new, changed, no-copy, too-large). Unchanged files synced before A-23 are covered by a one-time backfill per site, recorded as `scopeConfig.sites[].sourceTagsReadAt` and retried on the next sync if any read failed. Column display names and term-set ids come from `GET /drives/{d}/list/columns`, read once per library per run. If that call fails, the values are still stored. Pages (A-15) are not tagged yet; only files are. Checked read-only against the NGI tenant: the current grants can read columns and fields, but no managed-metadata column exists there yet, so the E-M1 demo step 3 needs one (with a term set) created first.
- `2026-11-04 · E-3 (NGI tenant check):` The real payload for `only-emp1.docx` in Engineering arrives as `NGI_x0020_Topics: [{ Label, TermGuid, WssId }, …]`, which matches the design. The term store returns "&" in labels as a full-width "＆" (U+FF06), so labels are normalised back to "&". Graph's column list doesn't include the `term` facet for this column, so `termSetGuid` stays null. WS-C maps tags by `termGuid`, so the mapping doesn't need it.
- `2026-11-06 · EQ-5:` Manual uploads are limited to 100 MB (`MAX_UPLOAD_BYTES` in `src/lib/fileFormats.js`). The file goes from the browser straight to S3, so the server doesn't limit it. The limit protects the worker, which reads the whole file into memory to extract it. `checkFileSize` gives one message everywhere: "This file is 142 MB. Uploads are limited to 100 MB; for larger files, sync them from SharePoint." Both dialogs show the limit and refuse an oversized file when it is chosen. `POST /api/s3/upload` takes `fileSize`, returns 413 `FILE_TOO_LARGE`, and its S3 policy (`content-length-range`) uses the same limit. Ingest and replace check the stored object's size. The project page now shows the presign error itself instead of "Failed to prepare upload". SharePoint sync is unchanged (`maxFileSizeMb`, A-24, default 200 MB).
- `2026-11-07 · EQ-4 (slide previews):` The document page shows a deck as designed: a PDF with one page per slide, in the PDF viewer, with a Slides / Text switch (Text is the earlier per-slide text and notes view). The worker job `slide_preview` renders a stored deck with LibreOffice (`worker/renderSlides.js`) to S3 `previews/{docId}/slides.pdf` (`src/lib/slidePreview.js`). It is queued after a stored deck is chunked and by the repair job, and decks uploaded before this get rendered the first time someone opens them (`POST /api/documents/[id]/slides`). Hidden slides are un-hidden in a copy before rendering, so page N stays slide N for `[slide N]` citations. No-copy SharePoint decks aren't stored: `GET /api/documents/[id]/preview?format=pdf` asks SharePoint (Graph `content?format=pdf`) to convert them. No schema change. **Worker host needs** `libreoffice-impress` plus `fonts-crosextra-carlito`, `fonts-crosextra-caladea` and `fonts-liberation` (metric-compatible Calibri/Cambria/Arial). Without LibreOffice the job logs a warning and decks stay in the text view. Fonts the deck uses that aren't installed are substituted, so line breaks can differ slightly from PowerPoint.
- `2026-11-07 · EQ-4 (stale slides):` The rendered slides follow the deck's content. Every time a stored deck's content is read again (a new upload, a replaced file or new version, a file SharePoint sync found changed), the chunk job deletes the old slides PDF and queues a new render. Until it's ready the page shows the text view, never the old slides. Switching a SharePoint integration to no-copy (A-14), or a file going over the size limit (A-24), removes the rendered slides along with the stored original, and the purge job (B-9) deletes them with the document's files.
- `2026-11-12 · E-6 (streaming):` Recordings are `.mp4`, `.mov`, `.m4a`, `.mp3` and `.wav` (`MEDIA_EXTENSIONS` in `src/lib/fileFormats.js`). The worker never holds one in memory: `worker/media.js` streams the file from S3 or SharePoint to a temp file, `ffprobe` reads its length into `durationSeconds`, and the temp directory is removed in a `finally`. The log line shows the worker's memory at the start and its peak, which is the E11.6 evidence. Measured locally on a 2.0 GB (1,914 MiB) test video: streamed to disk and probed in 17 s, memory 44 MB → peak 75 MB. Copies the sync keeps in S3 are now streamed into S3 in 16 MB parts (`@aws-sdk/lib-storage`) for every file type, with a playable Content-Type for media. Recordings skip the A-24 size guard. Recordings and transcripts that earlier syncs skipped, as unsupported or too large, are picked up by one full listing of each site (`scopeConfig.sites[].mediaListedAt`). A recording has no text of its own, so it has no pipeline stages (`firstMissingStage` returns null). Repair re-probes it, Regenerate refuses it, and its summary is its transcript's. A file `ffprobe` can't read ends with status `unreadable_file`. If `ffmpeg` is missing on the host, the recording is kept without its length and a warning is logged. **Worker host needs** `sudo apt-get install -y ffmpeg`. No schema change.
- `2026-11-12 · EQ-5 (recordings):` Manual uploads of recordings may be up to 2 GB (`MAX_MEDIA_UPLOAD_BYTES`); other files keep 100 MB. The worker streams recordings, so the memory reason for 100 MB doesn't apply to them. The dialogs say "100 MB each (recordings up to 2 GB)", and the presign policy, ingest and replace use the limit for the file's type.
- `2026-11-12 · E-7:` `src/lib/transcripts.js`. WebVTT: one cue per timing line, speakers from `<v>` tags (including `<v.class Name>`), NOTE/STYLE/REGION blocks, cue settings and inline tags ignored. Teams Word transcripts are read through `mammoth`, in both formats: the newer "Jane Smith   0:03" turns, which end where the next turn begins, and the older "0:0:0.0 --> 0:0:5.30" timing line followed by the speaker. A `.docx` is a transcript when it has at least three timed turns; otherwise it is read as a normal document. Chunks follow §3.2, `{ kind: "time", start, end, speakers }`. Each chunk closes once it spans 60 s and before it would pass 90 s or 2,000 characters, cut at cue boundaries. Each line reads "[m:ss] Speaker: words", with a speaker's consecutive cues joined, so the model sees the times.
- `2026-11-12 · E-8:` `src/lib/transcriptLinking.js` applies §3.4. "Same folder" means the same SharePoint folder (the file's link minus its name); for uploads, the same uploader, org and project. The link is checked again when a transcript is chunked and when a recording is probed. An automatic link that no longer matches is removed. A link set or removed by hand (`transcriptLinkSource: "manual"`) is never changed by a sync. Linking by hand is `PUT /api/documents/[id]/transcript-link`, from either end, allowed to whoever may manage the transcript (`canManageDocument`) and who can also open the recording. It is audited as `document.transcript_linked` / `document.transcript_unlinked`. **Decided (Johurul):** a transcript stays its own document and keeps its chunks. Chat and search cite it as its recording, and chat on the recording's page reads its linked transcripts. **Decided:** a recording without a transcript is indexed by name and plays, with a notice that what was said isn't searchable until a transcript is next to it or linked; transcription is E-M3.
- `2026-11-13 · E-10/E-11 decisions (Johurul):` (1) KMS's own transcript is stored on the recording itself (its own time chunks, content and summary), not as a separate document. (2) A provided transcript (.vtt or Teams Word), linked automatically, by hand, or attached at upload, replaces KMS's own, because it names the speakers: the generated chunks, text and summary are removed. (3) Transcription is automatic when the org setting `media.transcription.auto` is on, which is the default, and on request ("Transcribe it" on the recording's page) either way. (4) The language is detected by the provider. (5) No cost-per-hour figure for the proposal for now. (6) Provider OpenAI (`whisper-1`); the NGI test org's key is used for testing.
- `2026-11-13 · E-10:` `worker/transcription.js` plus `src/lib/transcription.js`. After a recording is probed with no transcript, a `MediaJob` (`kind: transcribe`) is queued with a 10-minute SQS delay (`AUTO_TRANSCRIBE_DELAY_SECONDS`). A transcript that syncs or is uploaded with the recording therefore arrives first, and the job is cancelled. The job streams the recording to disk and extracts the audio with `ffmpeg` (mono, 16 kHz, 32 kbit/s MP3, about 14 MB an hour). It cuts the audio into pieces of about 10 minutes at the nearest silence (`silencedetect`) and sends each piece to Whisper (`verbose_json`, segment times). Segment times are shifted by the piece's start, and segments Whisper itself flags as probably not speech are dropped. The result is chunked like a .vtt, without speaker names, and goes through embed, summarize and cluster. The job records progress (shown on the page), minutes and cost ($0.006 a minute). It runs one recording at a time per org. A failed job is marked `failed` with a readable reason and is never retried by SQS (so a provider error can't run up cost); "Try again" on the page starts a new job. MediaJob statuses add `cancelled`. While any job runs, the worker extends the SQS message's visibility every 4 minutes, so a long transcription isn't picked up twice. New or changed content of a recording drops the old generated transcript and transcribes again. New org setting `media.transcription.auto` (default true). Document status `transcribing`. Audited as `document.transcription_requested`. Chat on the recording reads its own chunks. Transcript lines without a speaker now stay one line each, so every line keeps its time; before, they were merged into one line per chunk. **Measured** on the 7:50 demo recording: 1.8 MB of audio, 3 pieces, 34 s, $0.047; a sentence in the third piece is timed to within 2 s of when it is said. No schema change.
- `2026-11-14 · E-10:` **Decided (Johurul):** the automatic transcription wait depends on where the recording came from (`autoTranscribeDelaySeconds`): **10 minutes from SharePoint sync**, where Teams writes the transcript after the recording and the next sync brings it, and **1 minute for an upload**, where the transcript is attached or selected with the recording.
- `2026-11-14 · E-6, E-10:` Worker disk. A recording is downloaded whole to `/tmp` (one at a time per worker, removed after), so the disk must hold the largest recording. Before downloading, the worker now compares the file's size (S3 `ContentLength`, SharePoint `Content-Length`) plus 512 MB headroom with the free space. If it doesn't fit, nothing is downloaded: the probe keeps the recording playable without its length (status `ready`, repaired later), and a transcription job fails with "Not enough disk space on the worker…" ("Try again" once space is freed). Temp folders are named `kms-media-<pid>-…`; at start the worker removes folders of workers no longer running, left when one is killed mid-download. Follow-up (not built): let ffmpeg read the recording from a signed S3 or SharePoint download link so only the audio (~14 MB an hour) touches the disk.
- `2026-11-13 · E-11:` `src/lib/chapters.js`. After a transcription, and whenever a recording's transcript link changes, a `segment` job sends the timed transcript to `gpt-4o-mini` (KMS's own transcript, else the longest linked one; a very long transcript is shortened to about 160k characters). The model returns topics with start times. They are checked: they parse, fall inside the recording, are sorted, are at least 30 s apart, there are 2 to 20 of them, and each ends where the next starts. They are stored in `mediaSegments`, or cleared when the recording no longer has a transcript. Recordings under 2 minutes get none. The recording's page has a Chapters tab: click to play from there, and the current chapter is highlighted. On the demo recording: 6 chapters at the real topic changes.
- `2026-11-13 · E-8 (safer linking, attach at upload):` Johurul asked for the automatic link to avoid wrong matches. A transcript is now linked automatically only when **exactly one** recording passes every check: same name, next to it, and the same length. Same length means the transcript's last line is within the recording's `durationSeconds` (slack of max(15 s, 2%)) and covers at least half of it. For uploads, it also means uploaded within `UPLOAD_WINDOW_DAYS` (3) of the transcript. When none or several fit, nothing is linked; KMS no longer picks the newest. A recording that arrives later and makes the match ambiguous removes the earlier automatic link. A recording not probed yet isn't linked; its probe re-checks. The document page's Details lists the possible recordings or transcripts with the reason (`linkSuggestions`: ambiguous, length differs, length unknown, uploaded apart) and a one-click Link. The worker log says why a transcript wasn't linked. **Attach at upload:** both upload dialogs offer "Attach transcript (.vtt or Teams .docx)" under each recording. A same-name .vtt/.docx picked in the same batch is attached automatically when only one recording in the batch has that name. The transcript is uploaded after the recording with `transcriptOf`. Ingest accepts it only for a recording the same person uploaded in the same org, links it as `manual`, and audits it (`attachedAtUpload`). A file attached as a transcript that turns out not to be one (a .docx without timed turns) is unlinked by the worker. No schema change.
- `2026-11-12 · E-9:` The document page plays a recording from its signed S3 link. A no-copy SharePoint recording plays through `/api/documents/[id]/preview`, which now passes `Range` requests on (206 responses), so seeking doesn't download the whole file. `?t=<seconds>` starts the player there. When the 1-hour signed link expires during a long recording, the player gets a new one and resumes. The recording's page has a Transcript tab (click a time to play, the current line highlighted). Its chat answers from the linked transcripts, and times in answers are buttons that play from there. Its Summary tab shows the transcript's summary, and Details shows the links with link/unlink. Org chat tags transcript lines with times and cites a linked transcript as "Weekly sync.mp4 · 12:34", with **Play from 12:34** (`src/lib/recordingCitations.js`: only when the user can open the recording; otherwise the transcript is cited). Repository search cards show "Matched at slide 7 / 12:34", and `GET /api/org/[orgId]/search` returns `locator` and `viewerUrl` per hit (`src/lib/chunkLocation.js`). Fullscreen and Pagewise Summary are hidden for recordings.
