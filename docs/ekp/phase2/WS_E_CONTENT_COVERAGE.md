# Workstream E: Content Coverage (Phase 2)

|                       |                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------- |
| **Owner**             | Johurul                                                                               |
| **Reviewer**          | Sandeep or Simran                                                                     |
| **Requirements**      | **Part 1:** E11.1, E11.3, E11.4, E11.5, E11.6, E11.7 (PowerPoint, video, transcripts) · **Part 2:** E11.2, E13, E14 (images, previews/thumbnails, templates) · **Phase 1 carry-over:** `A-23` (PRS E16.5), `A-16` (RFP §6 S2 SAML) |
| **Foundations used**  | F1 document access, F2 audit, F3 scheduled jobs, F5 org settings, F6 workflow engine (E14) |
| **Phase 2 window**    | Mon 2 Nov – Thu 26 Nov 2026 (code-complete), integration to Mon 30 Nov                 |
| **Branch**            | `feature/ekp-ws-e` (one branch for the phase, one PR per milestone; see [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md) §3) |
| **Status**            | Draft for review. Shared design + E-M1 ready for review; E-M2 to E-M4 outlined, detail each before it starts. |

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

### 3.1 Data model

Two schema-only PRs, so C can reference `DocumentSourceTag` in week 1:

| PR | Model / field | Notes |
| --- | --- | --- |
| `E-2` (E-M1, first schema PR of the phase) | `DocumentSourceTag` (`id`, `documentId`, `sourceSystem`, `field`, `label`, `termGuid`, `termSetGuid?`, `raw Json`, `syncedAt`) | `A-23`. Unique on (`documentId`, `field`, `termGuid`). C maps rows to `DocumentTerm` (`C-8`). |
| `E-2` | `Document.transcriptOfId` (self-relation), `Document.durationSeconds`, `Document.mediaSegments Json` (`[{ title, start, end }]`), `Document.mediaStatus` (`queued` \| `extracting` \| `transcribing` \| `segmenting` \| `done` \| `failed`), `Document.mediaProgress Int` | Part 1. Added together so part 1 needs one migration. |
| `E-13` (E-M4) | `Document.thumbnailPath`, `AssetTemplate` (`id`, `orgId`, `name`, `version`, `sections Json`, `requiredFields Json`, `status`, `createdBy`, timestamps), `Document.templateId`, `templateVersion` | Part 2. |

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
- Media jobs are separate from the normal document job, report `mediaStatus` and `mediaProgress`, and can be retried from the document page.
- `A-24` stays for non-media files above the size limit. For media types, the guard no longer skips: the file is streamed. Files the guard skipped earlier are picked up on their next sync (clear their skip status in `E-6`).

### 3.4 Transcript ↔ recording linking (E11.5)

A transcript is linked to a recording when, in the same folder, they share a base name (`Weekly sync.mp4` + `Weekly sync.vtt` / `.docx`), or match the Teams pattern (`<meeting> -YYYYMMDD_HHMMSS-Meeting Recording.mp4` + `… -Meeting Transcript.docx|.vtt`). The link is re-checked when either file syncs. A dept_admin can link or unlink manually on the document page. An unlinked transcript is still searchable on its own, cited by timestamp.

## 4. Milestones

Each milestone ends with a PR from `feature/ekp-ws-e` into `dev`, opened one working day before the due date, and a demo on `dev` at the weekly meeting.

### E-M1 PowerPoint searchable + SharePoint tags kept (due Fri 6 Nov)

- **Build:** `E-2` schema-only PR (first of the phase, merged on Mon 2 / Tue 3 Nov). `E-3` `A-23`: during SharePoint sync read `/drives/{d}/items/{i}/listItem?$expand=fields`, store taxonomy-field values as `DocumentSourceTag` rows, show them on the document page (raw, until C maps them). `E-4` E11.4: one allow-list module shared by upload (`UploadToRepositoryModal.jsx`), the upload API and the SharePoint mime filter; unsupported files are rejected with "KMS can't read .xyz files yet" (upload) or listed as skipped with a reason (sync). `E-5` E11.1 PPTX: unzip with `jszip` (add it as a direct dependency; today it only comes in through `mammoth`), read `ppt/slides/slideN.xml` and `ppt/notesSlides/notesSlideN.xml` in presentation order, one chunk per slide (title + body + notes), `metadata.slide`; viewer opens at a slide.
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

- **Build:** `E-13` schema-only PR for part 2. `E-14` E11.2 images (PNG, JPG): Tesseract OCR plus a vision-model description, both indexed, `metadata.kind = image`. `E-15` E13 thumbnails into S3 `thumbnails/{docId}.jpg`: PDF first page (`pdfjs-dist`), PPTX embedded `docProps/thumbnail.jpeg` (fallback: a generic slide icon), image downscale (`sharp`), video frame at 1 s (`ffmpeg`); shown on repository and search cards; in-app preview for images, slides and video. `E-16` E14 templates: admin defines How-To, FAQ, SOP and Key Takeaways templates (sections, guidance, required fields) in settings; "New from template" opens an editor; the asset enters B's publishing workflow (F6) and is ingested like any document; template versions keep existing assets unchanged.
- **Demo script:** (1) Upload a photo of a nameplate; search for the serial number on it; it's found. (2) Repository shows thumbnails for a PDF, a PPTX, an image and a video, and each previews in-app. (3) As admin, create a "How-To" template; as a member, create a How-To from it and submit; a reviewer publishes it; it appears in search.
- **Acceptance:** PRS E11 (image), E13 and E14 acceptance.

## 5. Open questions

| # | Question | Who decides | Default until decided |
| --- | --- | --- | --- |
| EQ-1 | Which transcription provider will NYPA approve (OpenAI Whisper, Azure OpenAI in a US region, other)? | NYPA, after award (NFR-11, S9) | Provider interface; OpenAI default for our demo; off until an admin turns it on |
| EQ-2 | Should KMS transcribe a recording that has a transcript of poor quality? | Team | No; a dept_admin can force "re-transcribe" |
| EQ-3 | Keep a stored copy of media for playback, or always stream from SharePoint? | Team, with no-copy mode (A-14) | Stream from SharePoint; S3 only for uploads |
| EQ-4 | Is the PPTX embedded thumbnail good enough, or do we render slides (LibreOffice in the worker image)? | Team review of E-M4 | Embedded thumbnail |

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
| `E-1` | Finalize this document (shared design + E-M1), reviewed by Sandeep or Simran | `TODO` | Johurul | — | | | |
| `E-2` | E-M1 · Schema-only PR: `DocumentSourceTag` + part 1 `Document` media fields | `TODO` | Johurul | `E-1` | | | |
| `E-3` | E-M1 · **`A-23`**: store SharePoint managed-metadata values on synced documents (PRS E16.5) | `TODO` | Johurul | `E-2` | | | |
| `E-4` | E-M1 · E11.4: shared format allow-list (upload, API, SharePoint filter); clear rejection messages | `TODO` | Johurul | `E-1` | | | |
| `E-5` | E-M1 · E11.1: PPTX slides + notes, one chunk per slide, "slide N" citations, viewer opens at slide | `TODO` | Johurul | `E-4` | | | |
| `E-M1` | **Milestone PR + demo: PowerPoint searchable + SharePoint tags kept** (due Fri 6 Nov) | `TODO` | Johurul | `E-3`–`E-5` | | | |
| `E-6` | E-M2 · E11.6: stream S3/Graph to temp file; media bypass the `A-24` skip; re-queue skipped media; `ffmpeg` in worker image | `TODO` | Johurul | `E-M1` | | | |
| `E-7` | E-M2 · E11.5: VTT + Word transcript parsers, time-window chunks | `TODO` | Johurul | `E-M1` | | | |
| `E-8` | E-M2 · Transcript ↔ recording linking; use the transcript, no transcription call | `TODO` | Johurul | `E-6`, `E-7` | | | |
| `E-9` | E-M2 · Media player with `?t=`; timestamp citations in chat and search | `TODO` | Johurul | `E-8` | | | |
| `E-M2` | **Milestone PR + demo: Video with transcript** (due Fri 13 Nov) | `TODO` | Johurul | `E-6`–`E-9` | | | |
| `E-10` | E-M3 · E11.3: transcription fallback (provider interface, F5 setting, ≤ 25 MB pieces, progress, cost log) | `TODO` | Johurul | `E-M2` | | | |
| `E-11` | E-M3 · E11.7: topic segments + chapter list | `TODO` | Johurul | `E-8` | | | |
| `E-12` | E-M3 · **`A-16`**: SAML 2.0 via embedded SAML Jackson + `BoxyHQSAMLProvider` (RFP §6 S2) | `TODO` | Johurul | `E-1` | | | |
| `E-M3` | **Milestone PR + demo: Transcription, chapters, SAML** (due Fri 20 Nov) | `TODO` | Johurul | `E-10`–`E-12` | | | |
| `E-13` | E-M4 · Schema-only PR: `thumbnailPath`, `AssetTemplate`, `Document.templateId/templateVersion` | `TODO` | Johurul | `E-M3` | | | |
| `E-14` | E-M4 · E11.2: images, OCR + vision caption | `TODO` | Johurul | `E-M3` | | | |
| `E-15` | E-M4 · E13: thumbnails (PDF, PPTX, image, video) + in-app previews | `TODO` | Johurul | `E-13` | | | |
| `E-16` | E-M4 · E14: templates, editor, F6 publishing, versioning (first to move to Phase 3 if late) | `TODO` | Johurul | `E-13` | | | |
| `E-M4` | **Milestone PR + demo: Images, previews, templates** (due Thu 26 Nov) | `TODO` | Johurul | `E-14`–`E-16` | | | |
| `E-17` | Update RTM for E11, E13, E14 (and E16.5, S2); run `P2-INT` cross-testing (27–30 Nov) | `TODO` | Johurul | `E-M4`, `C-M4`, `D-M4` | | | |

## 7. Implementation notes

Add a dated note when a task changes the design (e.g. `2026-11-03 · E-5: hidden slides are indexed but marked hidden`).

- `2026-10-29 · Phase 2 kickoff (Johurul):` `A-16` and `A-23` move from WS-A into this workstream as `E-12` and `E-3`. They waited only for WS-A and WS-B to merge (both shared-database changes); that condition is met. Workstream E covers both parts in Phase 2; E14 is the first task to move to Phase 3 if E-M4 runs late.
