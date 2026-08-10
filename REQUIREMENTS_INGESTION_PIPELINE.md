# Requirements: Automated Knowledge Ingestion Pipeline

**Capability:** Automated Knowledge Ingestion Pipeline
**PRD Rank:** 3 (Tier 1) — currently marked "Added" in the PRD; this doc scopes the part that isn't actually built yet.
**Owner:** Johurul — full feature end-to-end, one PR. The hardest of the three Tier-1 features remaining: it's the only one with an external-system dependency (Microsoft Graph OAuth/API), and it also owns the Needs-Review queue that both this feature's synced documents and [[REQUIREMENTS_AUTO_CLASSIFICATION]]'s flagged documents feed into.
**Purpose:** Converts documents into organizational intelligence — automatically, from wherever the organization already stores them, not only via manual upload — and gives a super admin one place to review and confirm anything before it's published.

---

## Problem Statement

The PRD marks "Automated Knowledge Ingestion Pipeline" as **Added**, but an audit of the codebase (2026-07-02) found that's only true for the post-upload half of the pipeline:

- **What exists:** manual upload (`UploadToRepositoryModal` → presigned S3 POST → `POST /api/documents/ingest`) triggers a real, automated SQS worker chain — `chunk → embed → summarize → cluster` (`worker/index.js`) — with PDF/DOCX/TXT/spreadsheet extraction and OCR fallback.
- **What doesn't exist:** any automated *sourcing* of documents, and no unified place to review documents before they're published. There are zero references to SharePoint, Google Drive, Confluence, OneDrive, or any external platform anywhere in the codebase (`src/`, `worker/`, `scripts/`, `package.json`). Every document enters the system because a human uploaded it, one file at a time.

This capability closes that gap: connect to the platforms where an organization's knowledge already lives, detect new/changed files on a schedule, feed them into the existing chunk/embed/summarize pipeline automatically, and give a super admin a single queue to confirm any document — synced or manually uploaded — before it's canonical.

---

## Scope

In scope:
- A connector abstraction so multiple external platforms can plug into the same sync → review → ingest flow.
- SharePoint as the first connector (primary target, per Microsoft-shop enterprise/public-authority customers).
- Per-org OAuth credential storage, scoped via an admin-facing site picker that maps each connected SharePoint site to a KMS department (see FR-2 — corrected 2026-08-05 from an earlier, ambiguous "per-org app registration" description).
- A scheduler that detects new/changed files without brute-force re-scanning.
- Setting the fields (`sourceProvider`, `externalId`, `externalModifiedAt`) that let a synced document be identified as such by every downstream feature.
- Email notification to super admins when new synced content is awaiting review.
- **The Needs-Review queue itself:** a single UI listing every document awaiting confirmation — manually uploaded and flagged by classification, or freshly synced from SharePoint — with accept/reassign/create-project actions, source-agnostic.

Out of scope (this doc — see interface contract below):
- **The classification logic itself** (department suggestion, category assignment, duplicate detection) — that's [[REQUIREMENTS_AUTO_CLASSIFICATION]]. This doc's queue displays and acts on classification's signals; it doesn't compute them.
- Google Drive, Confluence, and other platform connectors beyond SharePoint — same interface, later work (see Rollout Order).
- Real-time webhook-based sync (delta/polling is the MVP; webhooks are a stated future upgrade, not required now).
- Knowledge graph / relationship mapping of synced documents — that's [[REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE]].

---

## Interface Contract with Rank 4 (Classification)

This feature and [[REQUIREMENTS_AUTO_CLASSIFICATION]] are two independent features, two independent PRs. The one thing that has to be agreed between the two owners, once, before either writes migration code, is the `Document` status value contract: `pending_classification` → `needs_review` → `published`. After that:

1. This feature creates a `Document` row exactly like a manual upload would (same `status`, same S3/SQS `chunk` entrypoint), with `sourceProvider`/`externalId` set for synced files.
2. Every document — synced or manual — flows through the classification pipeline ([[REQUIREMENTS_AUTO_CLASSIFICATION]]) unchanged; classification doesn't distinguish source.
3. This feature's Needs-Review queue reads classification's output (`categoryConfidence`, `classificationStatus`, `DocumentDuplicate`) to display and act on it — the queue is built to handle both sources from the start, not retrofitted.

Each feature's schema change is additive and independently mergeable: this feature's migration (`OrgIntegration`, `SyncRun`, `Document.sourceProvider`/`externalId`/`externalModifiedAt`) touches different columns than classification's (`Document.categoryConfidence`/`classificationStatus`, `DocumentDuplicate`) on the same `Document` table, so either can merge first.

---

## Functional Requirements

### FR-1 — Connector Abstraction
- Define a common interface any platform connector implements: `listChanges(cursor)`, `downloadFile(externalId)`, `getFolderTree()`.
- SharePoint is the first implementation; Google Drive/Confluence/etc. implement the same interface later without touching the scheduler, review queue, or ingest path.

### FR-2 — SharePoint Connector (Microsoft Graph API)

> **Auth model corrected 2026-08-05.** An earlier draft of this FR said "per-org OAuth app registration," which reads ambiguously as "each customer registers their own Azure app." That is not the design — see below.

- **One shared, KMS-owned multi-tenant Entra app**, registered once (not per org). Each customer org's super admin grants **admin consent** to this same app for their own tenant — nobody outside KMS ever registers an Azure app themselves.
- **Auth is two-phase, not one:**
  1. **One-time delegated setup step**, at connect-time only. The org's super admin signs in with a narrower delegated scope (`Sites.FullControl.All`-class) so KMS can (a) enumerate the org's SharePoint sites via `GET /sites?search=*` and (b) grant the shared app's `Sites.Selected` access to whichever specific sites the admin selects, via `POST /sites/{id}/permissions`. This token is used once, at setup, and discarded — never persisted.
  2. **Ongoing app-only sync.** Every "Sync Now" run after setup uses pure app-only client-credentials auth (`Sites.Selected`), scoped only to the sites granted in step 1. No further admin sign-in required.
- **Site picker + department mapping UX**, not manual entry. Using the delegated token from step 1, KMS fetches the org's available SharePoint sites and presents them in a picker; the super admin checks which sites to connect and maps each to an existing KMS `Department`, then confirms. The admin never types or pastes a raw Site ID or URL.
- **Granularity: site-level for MVP.** One SharePoint site maps to exactly one KMS department. Folder-level splitting (multiple departments sourced from sub-folders of a single site) is deferred — see Deferred section.
- Use Graph **delta queries** to detect new/changed files since the last sync cursor — not a full re-list every run. The cursor is tracked **per connected site** (an org can connect more than one site), not per org.
- Downloaded files are pushed through the existing S3 upload + `Document` creation + SQS `chunk` stage, unchanged.

### FR-3 — Scheduler
- A periodic job (cron — e.g. Vercel Cron or equivalent) runs per org, per connected source, on a configurable interval (e.g. every 15-60 min).
- Each run: pull delta changes → create `Document` rows for new/changed files → hand off to classification ([[REQUIREMENTS_AUTO_CLASSIFICATION]]) → do not block on classification completing.
- Failed syncs must be retryable and must not silently drop files (log + surface in an admin-visible sync history).

### FR-4 — Dedup on Re-Sync
- A file already ingested from a given `(sourceProvider, externalId)` must not be re-ingested as a duplicate `Document` on the next sync unless its content actually changed (compare Graph's `lastModifiedDateTime`/etag).
- This is source-level dedup only (same file, same provider, re-synced). Content-level duplicate detection across *different* sources (e.g. same file manually uploaded and later found in SharePoint) is [[REQUIREMENTS_AUTO_CLASSIFICATION]]'s `DocumentDuplicate` job, not this one's.

### FR-5 — Needs-Review Queue UI
- List every document where `classificationStatus = "needs_review"` (or a connector-sourced document awaiting first-time triage), across both sources, in one UI.
- Show, per document: title, source (Manual / SharePoint), suggested category/department (if any, from classification), duplicate flag (if any), upload/sync date.
- Filterable by source, department, flag type.
- Prevents the two-parallel-queues failure mode this project has already hit in different forms twice (`4-B`/`4-D` branch conflicts; the original draft of this project's docs, before consolidation, proposed a second verification page for synced documents).

### FR-6 — Accept / Reassign / Create-Project Actions
- **Accept:** confirm the suggested `departmentId`/`category`/`projectId` as-is.
- **Reassign:** super admin picks a different department/project than the suggestion.
- **Create new project:** super admin creates a new project under an existing department and assigns the document to it.
- Any of the above transitions the document to `published` and, for connector-sourced documents that haven't yet been through chunk/embed/summarize, kicks off that pipeline.
- Dismissing a duplicate flag (from classification's `DocumentDuplicate`) is a distinct action from the department/project actions — a document can be confirmed-not-duplicate and still need department confirmation.

### FR-7 — Email Notification
- One digest email per sync run (not one email per file) to org super admins when new documents are awaiting review, via existing `src/lib/mailer.js`.
- Digest includes count and source; links to the Needs Review queue.

---

## Non-Functional Requirements

- Sync jobs run in the background (worker/cron context), never inline with a user-facing request.
- Must respect per-org OpenAI key resolution (`resolveOpenAIKey`) for any classification step triggered on synced content, consistent with existing rule.
- Connector credentials (OAuth tokens) must be stored encrypted at rest, not as plaintext columns (existing `Organization.openaiApiKey` pattern is not sufficient for OAuth refresh tokens).
- Connector setup and the Needs-Review queue (viewing and all actions) are `super_admin`-only (`isSuperAdmin(role)`, `src/lib/orgGuard.js`), consistent with other org-level configuration (e.g. OpenAI key settings). Open question: should `dept_admin` get a scoped queue view for their own department — see Open Questions.
- A sync run must be safely re-runnable/idempotent after a partial failure (crash mid-sync should not duplicate or drop files on the next run).
- Needs-Review queue reads must not do a full-table scan of `Document` — index on `classificationStatus`/`sourceProvider` is required given repository scale targets (1000+ documents).
- Queue actions (accept/reassign/create-project) must be atomic — a partial failure (e.g. project created but document not reassigned) must not leave the document silently stuck with no visible error.

---

## Data Model Impact (proposed, not final)

```
OrgIntegration {
  id            String
  orgId         String → Organization
  provider      String   // "sharepoint" | "google_drive" | "confluence" ...
  status        String   // "connected" | "disconnected" | "error"
  scopeConfig   Json      // { sites: [{ siteId, siteUrl, departmentId, lastSyncCursor }] }
                           // one entry per connected site — cursor moved here (was
                           // top-level lastSyncCursor) because an org can connect
                           // multiple sites, each synced independently, per FR-2's
                           // site picker (corrected 2026-08-05)
  accessToken   String    // encrypted — app-only token, scoped to the sites granted in scopeConfig
  refreshToken  String    // encrypted
  tokenExpiry   DateTime
  lastSyncAt    DateTime?
  createdAt     DateTime
}

SyncRun {
  id            String
  integrationId String → OrgIntegration
  startedAt     DateTime
  finishedAt    DateTime?
  status        String   // "running" | "completed" | "failed"
  filesFound    Int
  filesFailed   Int
  error         String?
}

Document + sourceProvider String? @default("manual")  // "manual" | "sharepoint" | ...
         + externalId     String?                       // provider's file ID, for dedup
         + externalModifiedAt DateTime?                 // for change detection

@@index([sourceProvider, externalId])
```
The Needs-Review queue (FR-5/FR-6) needs no schema of its own — it reads these columns plus [[REQUIREMENTS_AUTO_CLASSIFICATION]]'s `categoryConfidence`/`classificationStatus`/`DocumentDuplicate`, which land in a separate, independent migration on the same `Document` table.

---

## Platform Rollout Order

| Priority | Platform | Rationale |
|---|---|---|
| 1 | **SharePoint** | Primary target — dominant in Microsoft-shop enterprises and public authorities (e.g. NYPA-like orgs) |
| 2 | **OneDrive for Business / Teams files** | Same Graph API/auth as SharePoint — near-zero marginal connector cost once #1 exists |
| 3 | **Google Drive** | Common where individual departments run G Suite instead of / alongside Microsoft 365 |
| 4 | **Confluence** | Engineering/technical documentation wikis |
| 5 | **Network file shares (SMB/CIFS)** | Legacy but still common in public-sector environments — often the largest unmigrated store; different auth/access model than the OAuth platforms above |
| 6 | **Box / iManage / OpenText / M-Files** | Enterprise content management systems common in legal- and regulatory-heavy public-sector organizations |

Only SharePoint (#1) is in scope for this sprint. The connector interface (FR-1) is what makes #2-6 incremental work later rather than a rebuild.

---

## Licensing & Auth Feasibility (verified 2026-07-02)

Question: does our current Microsoft 365 Business Basic (1 seat, $6/mo) + Entra ID cover what's needed to build the SharePoint OAuth app? **Yes — no additional Microsoft spend required.**

- **Business Basic includes both SharePoint Online and OneDrive for Business** (1TB/user OneDrive, plus pooled SharePoint site storage). Microsoft retired standalone SharePoint-only plans in 2026, so this bundle is the standard path to both.
- **App registration + Microsoft Graph API access is a free-tier Entra ID feature**, bundled with any Microsoft 365 subscription. Entra ID P1/P2 (paid tiers) are only needed for extras like Conditional Access — not required for OAuth app registration or Graph permissions.
- **Only requirement is an admin role** (Global Admin or Application Administrator) to grant admin consent for the app's Graph permissions — with a 1-seat tenant, that's the account that set up the tenant, by default.
- **Recommendation: use `Sites.Selected`, not `Sites.Read.All`.** `Sites.Selected` is an app-only permission that grants access to specific SharePoint site(s) an admin explicitly approves, rather than every site in the tenant — least-privilege by design and the pattern Microsoft now recommends for this exact "one app, one document library" scenario.
- **OneDrive comes for free once SharePoint works**: OneDrive for Business and SharePoint document libraries are both exposed as "drives" under the same Microsoft Graph API. The SharePoint connector's app registration, OAuth flow, and admin consent all carry over to OneDrive — adding it later is a scope addition (`Files.Selected`), not a new app or new integration.

This resolves Open Question #2 in favor of **app-only auth** (not delegated) — see below.

---

## Open Questions

1. **Coordination with Simran (blocking, before either migration lands):** confirm the `Document` status state names (`pending_classification` → `needs_review` → `published`) so [[REQUIREMENTS_AUTO_CLASSIFICATION]]'s `worker/classify.js` and this feature's connector/queue agree on them from the start.
2. ~~Delegated vs. app-only Graph API permissions for SharePoint~~ — **Resolved:** app-only with `Sites.Selected` for ongoing sync, per Licensing & Auth Feasibility above (no per-seat licensing blocker, least-privilege by default). **Refined 2026-08-05:** a narrow delegated scope is also used, but only once, at connect-time, to list sites and grant the app's per-site access — see FR-2. Still open: whether per-user SharePoint file permissions need to be respected in KMS's own RBAC, since app-only access ignores the individual SharePoint user's permission scope — i.e. the connector can see everything in the selected site regardless of who could see what in SharePoint itself. Needs a decision on whether that's acceptable or whether KMS needs to mirror SharePoint's own per-file permissions.
3. ~~Does a synced file inherit `departmentId`/`projectId` from its SharePoint folder/site mapping as a *stronger* signal than content-based classification, or does classification run blind to source location?~~ — **Resolved 2026-08-05:** yes. Department mapping is set explicitly by the super admin at connect-time via the site picker (FR-2), site-level for MVP — this is an authoritative signal, not something classification infers or overrides.
4. What happens to a `Document` if the source file is later deleted or moved in SharePoint — does KMS archive it, leave it orphaned, or re-prompt review?
5. Should the "Sync Now" MVP be rate-limited/confirmed before running (e.g. "this will pull ~200 files, continue?") to avoid an accidental massive ingestion on first connect?
6. Should `dept_admin` see a department-scoped slice of the Needs-Review queue, or is `super_admin`-only correct for the MVP?
7. If a document has both a low-confidence-category flag and a duplicate flag, does confirming one auto-clear the other, or are they always independent actions?

---

## Implementation Timeline

See `TIER1_DAY_BY_DAY_SCHEDULE.md`, Block C, for the current day-by-day build plan. The scheduler (FR-3's automatic periodic run) and delta-cursor efficiency beyond a manual "Sync Now" trigger are deferred to a future sprint — this block ships a manual-trigger MVP, per `Ingestion Pipeline - SharePoint Overview.docx`'s stated scope.

---

## Acceptance Criteria (draft, MVP scope)

- A super admin can connect a SharePoint site to their org (OAuth flow completes, credentials stored encrypted).
- Clicking "Sync Now" pulls files from the connected SharePoint folder into the existing ingestion pipeline as `Document` rows with `sourceProvider = "sharepoint"`.
- Re-running "Sync Now" without new SharePoint changes does not create duplicate `Document` rows.
- A document flagged by classification (manual upload) and a document freshly synced from SharePoint both appear in the same Needs-Review queue, distinguishable only by a source indicator.
- A super admin can accept, reassign, or create-a-project-for any queued document in one action, and the document's status updates to `published` immediately after.
- A non-`super_admin` user cannot view or act on the queue (RBAC regression check).
- Super admin receives one email per sync run summarizing new documents awaiting review.
