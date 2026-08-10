# Rank 3 (Automated Knowledge Ingestion Pipeline) — Implementation Tracker
### Tier 1 Completion Plan — SharePoint Connector + Needs-Review Queue

> **For AI agents:** This file is the source of truth for task status on Rank 3. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Unlike earlier Tier 1 blocks (`CKA_IMPLEMENTATION_TRACKER.md`, `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md`, `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md`), this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Johurul**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `TIER1_COMPLETION_PLAN.md` §6 for why this now runs in parallel with Rank 4 and Rank 8 rather than as a sequential block. `TIER1_DAY_BY_DAY_SCHEDULE.md` for the current schedule (self-paced, not day-by-day). `REQUIREMENTS_INGESTION_PIPELINE.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **Coordination note — RESOLVED 2026-08-06.** ~~the `Document` status value contract... must be agreed with Simran...~~ Confirmed by inspecting her actual branch (`pr-21`, = `origin/feature/task-8-automatic-classification-clean`, commit `526a993`): `Document.classificationStatus` defaults to `"pending_classification"` and transitions to `"needs_review"` or `"published"`, an exact match to what `REQUIREMENTS_INGESTION_PIPELINE.md`'s Interface Contract section already assumed. No naming change needed on either side. `7-A` is unblocked.
>
> **Scope discipline:** MVP only, per `REQUIREMENTS_INGESTION_PIPELINE.md`'s Sprint Scope Cut and Platform Rollout Order — SharePoint is the only connector built now (Google Drive/OneDrive/Confluence are later, same interface). A manual "Sync Now" trigger ships; the automatic cron scheduler (FR-3's periodic run) and webhook-based sync are explicitly deferred (see Deferred section below). Do not pull deferred items into any task without updating the requirements doc first.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `TODO` | Not started |
| `IN_PROGRESS` | Currently being worked on |
| `DONE` | Complete and merged |
| `BLOCKED` | Waiting on a dependency |
| `SKIP` | Deferred or out of scope |

---

## Milestone 7 — Rank 3 (Ingestion Connector + Needs-Review Queue)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `7-A` | Own Migration | `DONE` | Johurul | — | 2026-08-06 | 2026-08-06 |
| `7-B` | Connector Abstraction + SharePoint OAuth App Registration | `DONE` | Johurul | `7-A` | 2026-08-05 | 2026-08-06 |
| `7-C` | Graph API Client + Delta Sync + "Sync Now" | `DONE` | Johurul | `7-B` | 2026-08-06 | 2026-08-06 |
| `7-D` | Dedup on Re-Sync | `DONE` | Johurul | `7-C` | 2026-08-06 | 2026-08-06 |
| `7-E` | Needs-Review Queue UI | `DONE` | Johurul | `7-A` | 2026-08-06 | 2026-08-06 |
| `7-F` | Accept / Reassign / Create-Project Actions + RBAC | `DONE` | Johurul | `7-E` | 2026-08-06 | 2026-08-06 |
| `7-G` | Email Digest Notification | `DONE` | Johurul | `7-C`, `7-F` | 2026-08-07 | 2026-08-07 |
| `7-H` | Integration Testing + RBAC Regression Check | `DONE` | Johurul | `7-D`, `7-F`, `7-G` | 2026-08-07 | 2026-08-07 |
| `7-I` | PR + Cross-Review | `TODO` | Johurul | `7-H` | | |

---

### Task 7-A — Own Migration
- **Status:** `DONE`
- **Started:** 2026-08-06
- **Completed:** 2026-08-06
- **Objective:** Land this feature's schema. Fully self-contained — no shared Day-1 gate with another owner the way `4-A`/`5-A`/`6-A` were, since Rank 4's migration touches different `Document` columns and can merge in either order (see Interface Contract in `REQUIREMENTS_INGESTION_PIPELINE.md`). The only prerequisite is the status-contract naming agreement with Simran (see header note) — confirmed resolved 2026-08-06 by inspecting her branch directly.
- **Key files created/modified:**
  - `prisma/schema.prisma` — new `OrgIntegration` model, new `SyncRun` model, `Document + sourceProvider String? @default("manual")` / `+ externalId String?` / `+ externalModifiedAt DateTime?`, plus `@@index([sourceProvider, externalId])`.
  - `prisma/migrations/20260806000000_add_ingestion_pipeline_schema/migration.sql`.
- **Acceptance criteria:** ✅ `prisma migrate status` shows schema up to date. ✅ Existing upload/chunk/embed/summarize flow unaffected — verified via read-only Prisma query: all 44 pre-existing `Document` rows correctly backfilled with `sourceProvider = "manual"`, new tables (`OrgIntegration`, `SyncRun`) present and empty.
- **How the migration was generated (per the shadow-DB safety rule below):** rather than pointing `--shadow-database-url` at anything live, spun up a throwaway local `pgvector/pgvector:pg16` Docker container, replayed the full migration history into it via `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <local-docker>`, then applied the resulting SQL to the real dev DB via `prisma migrate deploy` against Neon's **direct** (non-pooled) endpoint. Container torn down after.
- **Finding — pre-existing schema drift (not caused by this task, left alone):** the auto-generated diff also proposed `DROP INDEX "Chunk_embedding_vec_idx"` and `DROP INDEX "OrganizationMember_lastDepartmentId_idx"` — both real indexes created by raw SQL in earlier migrations (`20260617000000_add_chunk_embedding_vec_index`, `20260619050000_org_member_last_department`) but never declared as `@@index` in `schema.prisma`. Applying the diff verbatim would have silently dropped the pgvector similarity-search index. Both lines were excluded from the applied migration; the drift itself is unrelated to Rank 3 and was left as-is rather than fixed opportunistically — worth a small follow-up cleanup ticket if anyone wants `schema.prisma` to match reality exactly.
- **Reminder (per `feedback_prisma_migrate_diff_shadow_db.md`-style incident earlier in this project):** never pass the live shared-dev `DATABASE_URL` as `--shadow-database-url` for `prisma migrate diff` — use a separate, empty scratch database. Pull latest `dev` and rebase before opening this migration's PR.

### Task 7-B — Connector Abstraction + SharePoint OAuth App Registration
- **Status:** `DONE`
- **Started:** 2026-08-05
- **Completed:** 2026-08-06
- **Objective:** FR-1 (connector interface any platform implements) + the auth half of FR-2. Per `REQUIREMENTS_INGESTION_PIPELINE.md`'s Licensing & Auth Feasibility section, this is app-only auth with `Sites.Selected` for ongoing sync — already resolved, no further licensing research needed. **Auth model corrected 2026-08-05 — see notes below and FR-2 in the requirements doc.**
- **Key files created:**
  - `src/lib/crypto.js` — AES-256-GCM encrypt/decrypt (`INTEGRATION_ENCRYPTION_KEY` env var), used for `OrgIntegration.accessToken`/`refreshToken` at rest — does not reuse the plaintext `Organization.openaiApiKey` pattern.
  - `src/lib/msGraph.js` — all Graph calls: delegated authorize-URL builder + code exchange, app-only client-credentials token, `listSites`, `grantSitePermission`, `getDelta`, `downloadFileContent`, `getFolderTree`.
  - `src/lib/connectors/base.js`, `sharepoint.js`, `index.js` — FR-1's connector interface (`listChanges(cursor)`, `downloadFile(externalId)`, `getFolderTree()`) + SharePoint implementation + factory.
  - `src/lib/integrationSetup.js` — encrypted httpOnly cookie bridging callback → picker → confirm (holds the one-time delegated token; 10-minute TTL; never persisted to DB).
  - Routes: `GET /api/org/[orgId]/integrations/sharepoint/connect` (redirect to Microsoft), `GET /api/integrations/sharepoint/callback` (fixed path, matches the registered redirect URI — org travels via encrypted `state`), `GET /api/org/[orgId]/integrations/sharepoint/sites` (list sites + org departments for the picker), `POST /api/org/[orgId]/integrations/sharepoint/confirm` (grants per-site access, mints app-only token, upserts `OrgIntegration`), `GET /api/org/[orgId]/integrations/sharepoint` (connection status for the UI). All non-callback routes gate on `isSuperAdmin(role)` per `src/lib/orgGuard.js`, matching existing route conventions.
  - `src/app/(app)/org/[orgId]/settings/page.jsx` — new "SharePoint" tab (super-admin-only, same tab-array pattern as API Key/Audit Log): connect button → site/department picker table → connected-sites summary.
- **Schema refinements made during implementation (2 small follow-up migrations, same shadow-DB process as `7-A`):** `OrgIntegration.refreshToken` made nullable (SharePoint's client-credentials flow has no refresh token; kept for future providers that use one) — `20260806010000_org_integration_refresh_token_nullable`. Added `@@unique([orgId, provider])` to `OrgIntegration` to make the confirm route's upsert safe — `20260806020000_org_integration_unique_org_provider`.
- **Acceptance criteria:** ✅ a super admin can connect one or more SharePoint sites to their org via the site picker, mapping each to a KMS department; admin consent + per-site grant complete; credentials stored encrypted at rest.
- **Notes (decided 2026-08-05, implemented 2026-08-06):**
  - This is **one shared, KMS-owned multi-tenant Entra app**, registered once — not a per-org app registration. Corrects earlier ambiguous wording in `REQUIREMENTS_INGESTION_PIPELINE.md` FR-2. Each customer org's admin grants admin consent to this same app for their own tenant.
  - Entra app: `KMS SharePoint Connector`, multitenant, `Sites.Selected` **application** permission (admin consent granted), redirect URI `{NEXT_PUBLIC_APP_URL}/api/integrations/sharepoint/callback`. **⚠️ Outstanding manual step before a real browser click-through will work:** the delegated one-time setup flow requests `Sites.FullControl.All` as a **delegated** permission (`src/lib/msGraph.js`'s `DELEGATED_SCOPE`) — only the **application** permission was added to the app registration so far (during the earlier manual Graph Explorer validation). Add `Sites.FullControl.All` under **Delegated permissions** in the Entra app's API permissions blade before testing the "Connect SharePoint" button end-to-end in a browser.
  - Auth is **two-phase**: (1) one-time delegated sign-in at connect-time to list the org's sites (`GET /sites?search=*`) and grant per-site `Sites.Selected` access to whichever the admin picks (`POST /sites/{id}/permissions`); (2) ongoing app-only client-credentials auth for every "Sync Now" run after that.
  - Site-to-department mapping is **site-level for MVP** (one site → one department), set by the admin in the picker at connect-time — resolves Open Question #3 in the requirements doc. Folder-level splitting is deferred (see Deferred section below).
  - `OrgIntegration.scopeConfig` shape: `{ tenantId, sites: [{ siteId, siteUrl, departmentId, lastSyncCursor }] }` — `tenantId` added during implementation (needed to re-mint app-only tokens via `login.microsoftonline.com/{tenantId}/...`; not in the original data-model note). Cursor lives per-site since an org can connect multiple sites.
  - **Manual end-to-end validation completed 2026-08-06 (before writing code):** admin consent granted for `Sites.Selected`, per-site `read` permission granted to the app via Graph Explorer (delegated `Sites.FullControl.All`) for both the `Engineering` and `Finance` test sites, then a pure app-only client-credentials token (no user sign-in) successfully listed `Engineering`'s drive contents via `GET /sites/{siteId}/drive/root/children`.
  - **Code-level end-to-end verification (2026-08-06):** couldn't drive the actual Microsoft consent browser redirect from here (needs a live human at Microsoft's login screen), so verified everything on both sides of it instead — (a) all new routes hit via a local dev server return correct status codes (401 unauthenticated, 400 missing code/state), no compile errors; (b) `confirm`'s exact DB-writing logic (grant → mint app-only token → encrypt → upsert `OrgIntegration`) run directly against the real dev DB for the mock "NGI" org (`nexgeninnovation2018@gmail.com`), mapping its real `Engineering`/`Finance` departments to the two test SharePoint sites — upsert is idempotent (confirmed single row on re-run), token round-trips through `encrypt`/`decrypt` correctly, and the connector correctly reads back both sites' files (4 files in Engineering, 2 in Finance) using only the decrypted app-only token. The `OrgIntegration` row created by this verification was left in place (not cleaned up) since it's genuine, correct connected state — useful as a starting point for `7-C`.
  - **UI restructure (2026-08-07), from user's own review pass:** the SharePoint UI no longer lives as a tab inside org Settings. Settings now has a lean **"Integrations"** tab (`GET /api/org/[orgId]/integrations` — a small registry of known providers cross-referenced against connected status) listing every connector with a "Manage" link to a **dedicated page per provider** (`src/app/(app)/org/[orgId]/integrations/sharepoint/page.jsx` for now — the pattern is meant to repeat per future connector, not a shared generic template). This surfaced a real, previously-nonexistent requirement: **disconnect**. Added `DELETE /api/org/[orgId]/integrations/sharepoint` (marks `status: "disconnected"`, doesn't delete the row — `scopeConfig`/`SyncRun` history survives for a reconnect; doesn't revoke the Graph-side `Sites.Selected` grant, which would need a fresh delegated session, same as connecting — noted in the UI). Also fixed a latent bug the status GET route had since `7-B`: it returned `connected: true` for ANY existing row regardless of actual `status`, meaning a disconnected integration would have still displayed as connected — now correctly reads `status === "connected"`. Verified the disconnect→GET-reflects-it→Sync-Now-would-be-blocked→reconnect-restores chain against the real dev DB (toggled and restored the mock org's live connection state in one atomic test, so nothing was left disrupted). Settings page also widened `max-w-3xl` → `max-w-5xl` per feedback that it looked too narrow/cramped with excess whitespace, matching the width already used by Dashboard and Needs Review.

### Task 7-C — Graph API Client + Delta Sync + "Sync Now"
- **Status:** `DONE`
- **Started:** 2026-08-06
- **Completed:** 2026-08-06
- **Objective:** Remainder of FR-2 + the MVP slice of FR-3 (manual trigger only — the cron scheduler is deferred, see below).
- **Key files created/modified:**
  - `worker/index.js` — new `processSharePointSyncJob` (+ `ensureFreshAppOnlyToken`, `syncOneFile` helpers) and a `sharepoint_sync` case in `processJob`'s dispatch. Walks each connected site's delta via `src/lib/connectors`, downloads each changed file, uploads to S3, creates a `Document` row (`sourceProvider: "sharepoint"`, `externalId`, `externalModifiedAt`), then enqueues the **exact same** `{ type: "chunk", docId, s3Key, filename, projectId, userId, orgId, visibility, regenerate }` SQS message the manual upload path already uses — chunk/embed/summarize/cluster run completely unmodified.
  - `POST /api/org/[orgId]/integrations/sharepoint/sync` — "Sync Now". Per the NFR that sync jobs never run inline with a user-facing request, this route does almost nothing itself: creates a `SyncRun` row (`status: "running"`) and enqueues a `sharepoint_sync` SQS job, returns immediately. All real work happens in the worker above.
  - `GET /api/org/[orgId]/integrations/sharepoint/sync-runs` — admin-visible sync history (last 20 runs), satisfying the FR-3 NFR that failed syncs must surface, not silently drop.
  - Settings UI: "Sync Now" button + sync history list added to the SharePoint tab (status pill, files found/failed, error message per run).
  - Small necessary revision to `7-B`'s confirm route: added `scopeConfig.connectedByUserId` (the confirming super admin) — connector-synced `Document` rows need a `userId` owner like any other document, and storage-limit accounting (`User.storageUsedBytes`) needed someone to attribute usage to. Also fixed a latent bug the route had before 7-C needed it: confirming a second site used to **overwrite** `scopeConfig.sites` instead of merging, which would have silently dropped a previously connected site.
- **Storage-limit parity:** `syncOneFile` replicates the manual ingest route's `Subscription`/`Plan.storageLimitGb` check (using Graph's reported file size before download) — connector sync can't bypass an org's storage plan.
- **Cursor persistence is per-site and crash-resilient:** `scopeConfig.sites[i].lastSyncCursor` is written back to the DB immediately after each site finishes, not once at the end of the whole run — a later site failing doesn't force an already-completed site to be re-walked from scratch on retry.
- **Explicitly out of scope here (by design, per the task split with `7-D`):** no `externalId`-existence check before creating a `Document`. In the common case this doesn't matter — Graph's delta query only returns files that changed since the persisted cursor, so a routine re-sync with no SharePoint changes naturally returns zero items (verified below). The edge cases (lost/reset cursor, forced full re-scan, crash before a site's cursor was persisted) can still produce a duplicate `Document` until `7-D` adds the explicit `(sourceProvider, externalId)` + `lastModifiedDateTime` guard — that's exactly `7-D`'s stated job, not duplicated here.
- **Acceptance criteria:** ✅ clicking "Sync Now" pulls files from the connected SharePoint folder into the existing ingestion pipeline as `Document` rows with `sourceProvider = "sharepoint"`.
- **End-to-end verification (2026-08-06), against the real dev DB, real SharePoint tenant, and the real `worker/index.js` process (not a simulation):**
  - Triggered a real sync for the mock "NGI" org's connected `Engineering`/`Finance` sites (6 files total). Ran the actual worker process and watched it consume the `sharepoint_sync` job, then the resulting `chunk` → `embed` → `summarize` → `cluster` jobs for those documents, completely unmodified — confirmed via worker logs and final `Document.status` values (`ready`/`embedded`/`chunked` depending on how far each got before the run was stopped), correct department attribution (Engineering files → Engineering dept, Finance files → Finance dept), `SyncRun` recorded `status: "completed", filesFound: 6, filesFailed: 0`.
  - **Bug caught by this verification, fixed before marking done:** the first run left `Finance`'s cursor persisted correctly but `Engineering`'s cursor came back `null` — the per-site cursor-merge was mapping over the stale pre-loop `sites` snapshot instead of the accumulating `scopeConfig.sites`, so each site's DB write clobbered the previous site's freshly-saved cursor. Fixed in `worker/index.js`; verified in isolation with a standalone two-site merge test, then re-verified live — re-ran "Sync Now" against the real tenant a second time and got `filesFound: 0, filesFailed: 0` for both sites, confirming re-syncs are now correctly incremental.

### Task 7-D — Dedup on Re-Sync
- **Status:** `DONE`
- **Started:** 2026-08-06
- **Completed:** 2026-08-06
- **Objective:** FR-4 — a file already ingested from a given `(sourceProvider, externalId)` isn't re-ingested as a duplicate on the next sync unless its content actually changed (Graph's `lastModifiedDateTime`/etag comparison). Source-level dedup only; content-level cross-source dedup is Rank 4's `DocumentDuplicate` job, not this task's.
- **Key files modified:**
  - `worker/index.js`'s `syncOneFile` — now looks up an existing `Document` by `(orgId, sourceProvider: "sharepoint", externalId)` before doing anything else. If found and `externalModifiedAt` matches Graph's reported `lastModifiedDateTime` exactly, returns `{ skipped: true }` with no download/S3 write/DB write/SQS enqueue at all. If found but the timestamp differs, **updates the existing row in place** (`prisma.document.update`, same `id`) instead of creating a new one, and re-enqueues `chunk` against that same `docId` — the chunk job's existing `deleteMany` of old chunks (already idempotent, unrelated to this task) makes the re-processing clean.
  - Storage accounting fixed for the update path: before overwriting the (deterministic, externalId-keyed) S3 key, a `HeadObjectCommand` fetches the old object's size so only the **delta** (new size − old size) is applied to `User.storageUsedBytes` — an unconditional re-add would have double-counted every edited file's size on every change, forever.
  - `processSharePointSyncJob`'s per-change loop now only increments `filesFound` when `syncOneFile` didn't skip — `SyncRun.filesFound` reports files actually ingested/updated, not just files delta happened to return.
- **Acceptance criteria:** ✅ re-running "Sync Now" without new SharePoint changes does not create duplicate `Document` rows.
- **End-to-end verification (2026-08-06), against the real dev DB, real SharePoint tenant, and the real worker process:**
  - **Unchanged-file case, exercising the actual edge case this task targets (not just relying on delta's own incremental behavior):** reset the `Engineering` site's cursor to `null` — simulating a lost/reset cursor, which forces Graph's delta query to return a full re-list of all 4 files even though none had actually changed. Triggered a real sync: `SyncRun` completed with `filesFound: 0, filesFailed: 0` — every file correctly recognized as unchanged and skipped. Document count stayed at 6 (unchanged).
  - **Changed-file case:** since the app-only token is correctly read-only (`roles: ["read"]`, confirmed by a `403` when a write was attempted against the test tenant — the connector genuinely cannot write to SharePoint, by design), simulated "our stored record is behind reality" instead by backdating one document's stored `externalModifiedAt` to `2020-01-01` directly in the DB, then re-triggering sync with that site's cursor reset. Result: `SyncRun` completed with `filesFound: 1, filesFailed: 0` (only the backdated file, the other 3 correctly skipped) — the existing `Document` row was updated in place (same `id`, `externalModifiedAt` corrected back to the real Graph value, `status` cycled back through `queued → ... → ready` via the unmodified chunk/embed/summarize pipeline), document count stayed at 6 (no duplicate row), no duplicate `externalId`s, and `storageUsedBytes` reflected a sane delta rather than double-counting.

### Task 7-E — Needs-Review Queue UI
- **Status:** `DONE`
- **Started:** 2026-08-06
- **Completed:** 2026-08-06
- **Objective:** FR-5 — the single UI listing every document awaiting confirmation, manual or synced, source-agnostic. Can be scaffolded against stub data before Rank 4's classification signals exist, per the Interface Contract in the requirements doc — depends only on `7-A`'s own migration, not on Rank 4's.
- **Key files created/modified:**
  - `worker/index.js` — small but load-bearing fix found while designing this queue: `syncOneFile`'s document-**create** branch now sets `lifecycle: "draft"` instead of leaving the schema default (`"published"`). Without this, connector-synced files were silently appearing as fully published, canonical repository documents with zero human confirmation — the opposite of what FR-5/FR-6 require. Deliberately only applies to newly-created rows; an update to an already-published document (re-sync of an edited file, `7-D`'s update path) leaves `lifecycle` alone, so a minor content edit doesn't force a previously-approved document back through review.
  - `GET /api/org/[orgId]/needs-review` — super-admin-only (`isSuperAdmin`), lists `Document`s where `scope: "repository", lifecycle: "draft"`, filterable by `source` and `departmentId` query params.
  - `src/app/(app)/org/[orgId]/needs-review/page.jsx` — table view (document, source badge, department, suggested category, date, view link), source/department filter dropdowns, redirects non-super-admins away.
  - `src/components/layout/AppSidebar.jsx` — new "Needs Review" nav item, super-admin-only, alongside the existing Dashboard/Repository links.
- **Design decision — how "awaiting confirmation" is represented today:** Rank 4's `classificationStatus`/`categoryConfidence`/`DocumentDuplicate` fields aren't in the schema yet (her branch, `pr-21`/`feature/task-8-automatic-classification-clean`, isn't merged to `dev` — confirmed during `7-A`). Since Prisma can't query fields that don't exist, this queue currently runs on the existing `Document.lifecycle` field (already used elsewhere for publish/archive/retire — `src/app/api/documents/[id]/lifecycle/route.js` — and already excluded from normal repository views by default, `lifecycle: { not: "draft" }` in `src/app/api/org/[orgId]/repository/route.js`) rather than adding a new column that would collide with Rank 4's own migration. The API route has an explicit comment marking exactly what to add once she merges: an `OR: [{ lifecycle: "draft" }, { classificationStatus: "needs_review" }]` branch, plus surfacing `categoryConfidence`/duplicate info in the response (currently stubbed as `null`). This is genuinely "scaffolded against stub data" per the task's own framing, not a placeholder UI with no real data behind it — the SharePoint half is fully real and working now.
- **Acceptance criteria:** ✅ (connector-synced half) a document freshly synced from SharePoint appears in the queue with a source indicator, filterable by source/department. ⏳ (manual/classification half) genuinely blocked on Rank 4's merge, exactly as the original acceptance criteria anticipated — tracked here for `7-H`, not a gap in this task's own scope.
- **End-to-end verification (2026-08-06), against the real dev DB and real worker process:** deleted an existing synced `Document` row (simulating "never synced before") and forced its site's cursor back to force a re-list. Re-ran a real sync: the file came back as a **new** row (not an update) with `lifecycle: "draft"`, and the exact query the API route runs (`scope: "repository", lifecycle: "draft"`) returned exactly that one document — the other 5 already-published test documents from earlier tasks' verification runs correctly did not appear (they predate this fix and were auto-published by the bug this task fixes; harmless leftover test data, not a real integrity concern, since nothing about `7-B`/`7-C`/`7-D`'s own acceptance criteria depended on `lifecycle`).

### Task 7-F — Accept / Reassign / Create-Project Actions + RBAC
- **Status:** `DONE`
- **Started:** 2026-08-06
- **Completed:** 2026-08-06
- **Objective:** FR-6 — accept/reassign/create-new-project actions on any queued document, transitioning it to `published` (and kicking off chunk/embed/summarize for connector-sourced documents that haven't run it yet). RBAC: queue viewing and all actions are `super_admin`-only (`isSuperAdmin(role)`, `src/lib/orgGuard.js`).
- **Key files created/modified:**
  - `POST /api/org/[orgId]/needs-review/[docId]/confirm` — one endpoint, three request-body shapes: `{}` (accept as-is), `{ departmentId }` (reassign), `{ newProjectName, departmentId }` (create project + assign). All three set `lifecycle: "published"`. `super_admin`-only; rejects (409) if the document isn't currently `lifecycle: "draft"` (guards against double-confirming or acting on something already published). Project creation + document update run inside one `prisma.$transaction`, per the NFR that a partial failure (project created but document left unassigned) must not happen.
  - Chunk-pipeline safety net: if the confirmed document has zero `Chunk` rows (meaning `7-C`'s normal auto-enqueue-at-sync-time somehow never completed — e.g. a worker crash before the SQS send), the confirm route re-enqueues the same `chunk` job itself. In the common case this is a no-op, since `7-C` already fires chunking automatically at sync time, well before any human gets to the confirm step.
  - `src/app/(app)/org/[orgId]/needs-review/page.jsx` (extends `7-E`'s page) — Accept button (one click), Reassign button opening a modal with a department dropdown and an optional "assign to a new project" checkbox + name field.
- **Acceptance criteria:** ✅ a super admin can accept, reassign, or create-a-project-for any queued document in one action, and the document's `lifecycle` updates to `published` immediately after. ✅ RBAC (view + act, both `super_admin`-only) — reuses the same pattern verified in every other route this feature has added; no separate regression risk introduced here.
- **End-to-end verification (2026-08-06), against the real dev DB:** set up 3 real draft documents (one fresh from `7-E`'s test, two existing published test docs manually reset to `draft` as fixtures) and ran the confirm route's exact logic against each: **Accept** → `lifecycle: published`, department/project untouched. **Reassign** → `lifecycle: published`, `departmentId` correctly moved from Engineering to Finance. **Create Project** → `lifecycle: published`, new `Project` row created (`name: "7-F Test Project"`, correct `orgId`/`departmentId`/`userId`), document's `projectId` set and `scope` correctly flipped from `"repository"` to `"project"`. Also verified the guard rails: re-confirming an already-published document is correctly rejected (`"Document is not awaiting review"`), and zero draft documents remained afterward.

### Task 7-G — Email Digest Notification
- **Status:** `DONE`
- **Started:** 2026-08-07
- **Completed:** 2026-08-07
- **Objective:** FR-7 — one digest email per sync run (not one per file) to org super admins, via existing `src/lib/mailer.js`, linking to the Needs-Review queue.
- **Key files created/modified:**
  - `src/lib/mailer.js` — new `sendSyncDigestEmail({ to, orgName, source, filesFound, needsReviewUrl })`, following the existing `sendOtpEmail` pattern (same `transporter`). Accepts an array of recipients.
  - `worker/index.js` — `processSharePointSyncJob` sends the digest right after the `SyncRun` row is finalized, but only when `filesFound > 0` (no email for a sync that found nothing new — matches FR-7's "when new documents are awaiting review"). Recipients are every `super_admin` `OrganizationMember` for the org, looked up fresh per run rather than cached. Wrapped in try/catch and explicitly non-fatal, matching the existing pattern for other best-effort side effects in this file (e.g. conflict detection in `processSummarizationJob`) — an SMTP hiccup shouldn't retroactively fail a sync that otherwise completed correctly.
  - Reused the existing `src/lib/mailer.js` / `EMAIL_USER` / `EMAIL_PASS` transporter as instructed, rather than the separate ad-hoc `nodemailer.createTransport` already inlined in `worker/index.js` for per-document completion emails — one less thing importing raw SMTP config directly.
- **Acceptance criteria:** ✅ super admin receives one email per sync run summarizing new documents awaiting review.
- **End-to-end verification (2026-08-07), against the real dev DB and real worker process:** deleted a synced document to simulate a fresh file, reset that site's cursor, and triggered a real sync. Worker log confirmed the full sequence: `SharePoint sync complete: ... found=1 failed=0` immediately followed by `📧 Sync digest sent to 1 super admin(s)` — correctly matching the mock "NGI" org's single `super_admin` (`nexgeninnovation2018@gmail.com`), not more or fewer. No error path triggered (the mailer's SMTP credentials were already proven working earlier in this project's testing — the exact same `EMAIL_USER`/`EMAIL_PASS` pair sent real per-document completion emails during `7-C`'s and `7-D`'s verification runs).

### Task 7-H — Integration Testing + RBAC Regression Check
- **Status:** `DONE`
- **Started:** 2026-08-07
- **Completed:** 2026-08-07
- **Objective:** Verify the full flow end-to-end: SharePoint sync → Needs-Review queue → confirm action → published document. Confirm queue correctly displays both manual (classification-flagged) and synced documents once Rank 4's PR has merged. RBAC regression: connector setup, queue viewing, and queue actions all remain `super_admin`-only; OAuth tokens verified encrypted at rest, not plaintext.
- **Testing method — real HTTP requests, not just logic-replica scripts:** every prior task (`7-A`–`7-G`) was verified against the real dev DB/tenant/worker, but several used scripts that replicated a route's *logic* rather than calling the route itself over HTTP (session cookies weren't available). For this task specifically — integration testing across the full stack — that gap mattered, so real `next-auth` JWT session cookies were minted directly (`next-auth/jwt`'s `encode()`, same `NEXTAUTH_SECRET`, same cookie name the app already uses) for two real accounts: the mock org's actual `super_admin` (`nexgeninnovation2018@gmail.com`) and a newly-created `employee`-role test user (`rbac-test-employee@nexgeninnovation.test`, left in place in the "NGI" org as reusable RBAC test fixture — harmless, clearly named). This let every test below hit the actual route handlers over real HTTP, with real auth, exactly as a browser would.
- **Full end-to-end flow, verified via real HTTP calls end to end:** deleted a synced document and reset its site's cursor (fresh-file setup) → `POST .../integrations/sharepoint/sync` (real HTTP, super_admin session) created a real `SyncRun` and enqueued the job → real `worker/index.js` process consumed it, `found: 1` → `GET .../needs-review` (real HTTP) correctly listed the new document, source `"sharepoint"`, correct department → `POST .../needs-review/{docId}/confirm` (real HTTP) returned `lifecycle: "published"` → `GET .../needs-review` again correctly returned an empty list. Every hop of FR-5/FR-6's stated flow confirmed working through the actual HTTP layer, not just underlying logic.
- **RBAC regression sweep, every route this feature added, both roles, real HTTP:**
  | Route | super_admin | employee |
  |---|---|---|
  | `GET .../integrations/sharepoint` | 200 | 403 |
  | `GET .../integrations/sharepoint/sites` | 409 (no active setup session — correct, not a failure) | 403 |
  | `GET .../integrations/sharepoint/sync-runs` | 200 | 403 |
  | `GET .../integrations/sharepoint/connect` | 307 redirect | 403 |
  | `POST .../integrations/sharepoint/sync` | 200 (real sync triggered) | 403, no side effects |
  | `GET .../needs-review` | 200 | 403 |
  | `POST .../needs-review/{docId}/confirm` | 200 (real publish) | 403, no side effects |

  No route returned anything but the correct code for its role in either direction — no accidental 200 for `employee`, no incorrect 403 for `super_admin`.
- **OAuth tokens encrypted at rest — verified directly against the live row, not just crypto.js's own unit-style test from `7-B`:** read `OrgIntegration.accessToken` straight from the dev DB. Stored value is a 2720-character base64 blob that does not start with `eyJ` (the standard JWT-header prefix every real Graph access token has) — i.e., it does not look like a token at all. Ran it through `decrypt()`: succeeds, and the *decrypted* value does start with `eyJ` — confirming the stored column is genuinely ciphertext, not a token with unusual formatting, and that it round-trips correctly in the live system.
- **Classification-side coverage — genuinely blocked, confirmed just now, not stale from `7-A`:** re-fetched `origin/dev` fresh and diffed its `prisma/schema.prisma` — zero occurrences of `classificationStatus`/`categoryConfidence`/`DocumentDuplicate`. Rank 4's branch (`pr-21` / `feature/task-8-automatic-classification-clean`) is still unmerged. Per this task's own instructions: **the classification-sourced half of the Needs-Review queue is marked `BLOCKED`** pending that merge — not a gap in this feature's own testing, and not something this PR should wait on. Follow-up for whoever picks this up after her merge: re-run `GET .../needs-review` and confirm a classification-flagged manual upload appears alongside a SharePoint one, distinguishable only by source — the query change needed is already commented inline in `src/app/api/org/[orgId]/needs-review/route.js`.
- **Acceptance criteria:** ✅ full flow verified end-to-end (connector-sourced half). ⏳ classification-sourced half — `BLOCKED` on Rank 4's merge, as anticipated. ✅ RBAC regression clean across every route. ✅ OAuth tokens confirmed encrypted at rest.

### Task 7-I — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Have at least one other person (Simran or Sandeep) review before merge to `dev`, per this project's standard close-out practice.

---

## Deferred (this feature) — Tracked for Fast-Follow

Not tasks in this milestone; listed so they aren't lost.

| Item | Why deferred | Where specified |
|---|---|---|
| Automatic cron scheduler (FR-3's periodic run) | MVP ships manual "Sync Now" only | `REQUIREMENTS_INGESTION_PIPELINE.md` Sprint Scope Cut |
| Delta-cursor efficiency beyond a full folder list per manual sync | MVP scope cut | `REQUIREMENTS_INGESTION_PIPELINE.md` Sprint Scope Cut |
| Webhook-based real-time sync | Stated future upgrade, not MVP | `REQUIREMENTS_INGESTION_PIPELINE.md` Scope |
| Google Drive / OneDrive / Confluence / SMB / enterprise CMS connectors | Same interface, later work — Rollout Order priorities 2-6 | `REQUIREMENTS_INGESTION_PIPELINE.md` Platform Rollout Order |
| Mirroring SharePoint's own per-file permissions in KMS RBAC | Open question, not resolved — app-only access currently ignores per-user SharePoint permission scope | `REQUIREMENTS_INGESTION_PIPELINE.md` Open Question #2 |
| Folder-level site-to-department mapping (splitting one SharePoint site across multiple KMS departments by sub-folder) | MVP is site-level only — one connected site maps to exactly one department | `REQUIREMENTS_INGESTION_PIPELINE.md` FR-2 (decided 2026-08-05) |
