# SharePoint Ingestion Pipeline — Review & Demo Guide

**Rank 3 / Tier 1, `feature/task-7-sharepoint-ingestion-pipeline`, tasks `7-A` through `7-H` — all `DONE`.**
Only `7-I` (PR + cross-review) is left. This doc is for *you* to review the work, click through a real demo, and track bugs as you find them. Update the checkboxes as you go — this file is yours to mark up.

Full task-by-task build notes (much more detail than this doc) live in `TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`. This doc is the "get oriented and click through it" version.

---

## ⚠️ Before you demo — one real blocker

The one-time "Connect SharePoint" flow requests a **delegated** Graph permission (`Sites.FullControl.All`) to list sites and grant the app access to the ones you pick. So far only the **Application** permission `Sites.Selected` has been added to the Entra app (`KMS SharePoint Connector`) — that was done back when we manually validated the connector via Graph Explorer, before any of this code existed.

- [x] In the Entra portal → `KMS SharePoint Connector` → **API permissions** → **Add a permission** → Microsoft Graph → **Delegated permissions** → add `Sites.FullControl.All` → grant admin consent. **Done.**

Without this, clicking "Connect SharePoint" in the browser will get through the Microsoft sign-in screen but fail at listing sites. Everything else (Sync Now, Needs Review, Accept/Reassign/Create Project, email digest) has already been tested against the real system and doesn't need this — only the *initial connect* flow does, since the NGI test org is already connected from earlier testing.

---

## 🔄 Updated after your first review pass (same day)

You asked for two changes, both implemented:

1. **Restructured navigation.** SharePoint no longer has its own tab in Settings. There's now a **"Integrations"** tab in Settings that lists every connector (just SharePoint for now) with its connection status, and a **"Manage"** button that takes you to a dedicated page: `/org/[orgId]/integrations/sharepoint`. That dedicated page has everything the old tab had (connect, site picker, connected-sites view, Sync Now, sync history) **plus a new Disconnect button** — this is a genuinely new capability, there was no way to disconnect before today.
2. **Widened the Settings page** from `max-w-3xl` to `max-w-5xl` to cut down the left/right whitespace, matching the width already used by the Dashboard and Needs Review pages.

Everything below is updated to match. Section 2 and 3 reflect the new structure; re-check section 4's checklist since the navigation path changed even though the underlying logic didn't.

---

## 1. What this feature does, in one paragraph

A super admin connects a SharePoint site to their KMS org (one-time OAuth flow), maps it to a department. Clicking "Sync Now" pulls files from that site into KMS's existing upload pipeline (same chunk → embed → summarize flow manual uploads use) as new `Document` rows, but they land in a **Needs Review** queue first, not the live repository. A super admin reviews each one — Accept, Reassign to a different department, or spin up a new Project for it — which publishes it. Re-running Sync Now doesn't create duplicates for unchanged files. Every sync run that finds something new sends one digest email to the org's super admins.

---

## 2. File map — where everything lives, what it does

### Schema
| File | What it is |
|---|---|
| `prisma/schema.prisma` | `OrgIntegration` (per-org connection + encrypted tokens + site↔department mapping), `SyncRun` (per-sync-run log), `Document.sourceProvider`/`externalId`/`externalModifiedAt` (dedup key) |
| `prisma/migrations/20260806000000_add_ingestion_pipeline_schema/` | The main migration |
| `prisma/migrations/20260806010000_org_integration_refresh_token_nullable/` | Small fix: SharePoint's auth has no refresh token |
| `prisma/migrations/20260806020000_org_integration_unique_org_provider/` | Small fix: one `OrgIntegration` row per org+provider |

### Core libraries (`src/lib/`)
| File | What it does |
|---|---|
| `crypto.js` | AES-256-GCM encrypt/decrypt — used for `OrgIntegration.accessToken` at rest |
| `msGraph.js` | Every Microsoft Graph call: delegated auth URL + code exchange, app-only client-credentials token, list sites, grant site permission, delta query, file download |
| `connectors/base.js` | The connector *interface* (`listChanges`, `downloadFile`, `getFolderTree`) — the contract any future connector (Google Drive, Confluence...) implements |
| `connectors/sharepoint.js` | SharePoint's implementation of that interface |
| `connectors/index.js` | Factory: `getConnector("sharepoint", {...})` |
| `integrationSetup.js` | The encrypted httpOnly cookie that bridges the OAuth callback → site picker → confirm steps (never touches the DB, 10-min TTL) |
| `mailer.js` | Added `sendSyncDigestEmail(...)` — reuses the existing mailer/transporter |

### API routes
| Route | What it does |
|---|---|
| `GET /api/org/[orgId]/integrations` | Lists every known connector (registry of one, so far: SharePoint) + this org's connection status for each — backs the Settings "Integrations" tab |
| `GET /api/org/[orgId]/integrations/sharepoint/connect` | Redirects browser to Microsoft's consent screen |
| `GET /api/integrations/sharepoint/callback` | **Fixed path** (matches what's registered in Entra). Receives the OAuth code, sets the setup cookie, redirects to the site picker on the dedicated SharePoint page |
| `GET /api/org/[orgId]/integrations/sharepoint/sites` | Lists the org's SharePoint sites + KMS departments, for the picker |
| `POST /api/org/[orgId]/integrations/sharepoint/confirm` | Grants the app access to chosen sites, mints the ongoing app-only token, saves `OrgIntegration` |
| `GET /api/org/[orgId]/integrations/sharepoint` | Current connection status (used by the dedicated SharePoint page) |
| `DELETE /api/org/[orgId]/integrations/sharepoint` | **New: Disconnect.** Marks the integration `disconnected` (keeps history/config for a possible reconnect), which also makes Sync Now correctly refuse to run. Does **not** revoke the Sites.Selected grant on Microsoft's side — see the note on the dedicated page |
| `POST /api/org/[orgId]/integrations/sharepoint/sync` | **"Sync Now."** Just creates a `SyncRun` + enqueues a job — the real work happens in the worker |
| `GET /api/org/[orgId]/integrations/sharepoint/sync-runs` | Sync history (last 20 runs) |
| `GET /api/org/[orgId]/needs-review` | The review queue — documents awaiting confirmation |
| `POST /api/org/[orgId]/needs-review/[docId]/confirm` | Accept / Reassign / Create-Project — one endpoint, body shape decides which |

### Worker
| File | What changed |
|---|---|
| `worker/index.js` | New `sharepoint_sync` job type. Walks each connected site's delta, downloads changed files, uploads to S3, creates/updates `Document` rows, skips files that haven't actually changed (dedup), fires the *existing unmodified* chunk→embed→summarize pipeline, and sends the digest email when it finds something new |

### UI
| File | What's there |
|---|---|
| `src/app/(app)/org/[orgId]/settings/page.jsx` | **"Integrations"** tab (replaces the old "SharePoint" tab): a simple list — connector name, status, a "Manage" button per row. Page widened to `max-w-5xl`. |
| `src/app/(app)/org/[orgId]/integrations/sharepoint/page.jsx` | **New dedicated page.** Everything the old Settings tab had — connect button, site/department picker, connected-sites view, Sync Now, sync history — **plus the new Disconnect button** |
| `src/app/(app)/org/[orgId]/needs-review/page.jsx` | The **Needs Review** page: table of pending documents, source/department filters, Accept + Reassign buttons, a modal for reassign/new-project |
| `src/components/layout/AppSidebar.jsx` | New **"Needs Review"** nav link (only visible to super admins) |

---

## 3. How it all connects — the actual data flow

```
Super admin: Settings → Integrations tab → "Manage" on SharePoint → dedicated page
  → clicks "Connect SharePoint"
  → redirected to Microsoft, signs in, consents
  → callback sets a short-lived cookie, redirects back to the dedicated page's site picker
  → admin picks site(s) + maps each to a department, clicks Confirm
  → OrgIntegration row created: encrypted app-only token + { tenantId, sites: [{siteId, departmentId, ...}] }

Super admin clicks "Sync Now"
  → SyncRun row created (status: running), job enqueued to the same SQS queue the app already uses
  → worker picks it up: walks each site's delta, downloads new/changed files,
    uploads to S3, creates Document rows (lifecycle: "draft", sourceProvider: "sharepoint"),
    fires the SAME chunk→embed→summarize pipeline manual uploads use
  → SyncRun marked completed, cursor saved per-site (so next sync only sees what's new)
  → if anything new was found, one digest email goes to the org's super admins

Super admin opens "Needs Review"
  → sees every document with lifecycle: "draft" (currently: SharePoint-synced only —
    see the Rank 4 note below)
  → Accept / Reassign / Create Project → document's lifecycle flips to "published"
    → it now shows up in the normal Knowledge Repository like any manual upload
```

---

## 4. What's already been verified (by me, against the real system) vs. what needs your own click-through

I tested everything below against the **real dev DB, real SharePoint test tenant, and the real worker process** — but at the API/HTTP level (using a minted session, not a mouse). I deliberately haven't driven a browser myself. The actual pixels-on-screen experience is worth you clicking through once.

**Already proven working (API-level, real system):**
- [x] OAuth token round-trips correctly through encryption (not stored as plaintext)
- [x] Sync Now → worker → Documents created with correct department, `lifecycle: "draft"`
- [x] Re-running sync doesn't duplicate unchanged files; correctly re-processes genuinely changed ones
- [x] Needs Review queue lists the right documents
- [x] Accept / Reassign / Create Project all correctly publish + update department/project
- [x] Digest email fires exactly once per sync run that finds something new
- [x] Every route rejects a non-super-admin (403), allows a super admin

**You should click through yourself:**
- [ ] The actual "Connect SharePoint" button → Microsoft consent screen → site picker UI (the Entra blocker is resolved now, so this should go all the way through)
- [ ] The site/department picker's visual layout — does it read clearly?
- [ ] Settings → Integrations tab → "Manage" → dedicated SharePoint page navigation feels right
- [ ] Sync Now button + sync history list rendering on the dedicated page
- [ ] **Disconnect button** — click it, confirm the integration shows "Disconnected" in the Integrations tab list, confirm Sync Now is no longer offered/works, then reconnect to restore it for further testing (verified the underlying logic works, haven't clicked the actual button myself)
- [ ] Needs Review table — filters, badges, the Reassign modal
- [ ] Clicking through to a document from the queue (`View` link → document preview page)
- [ ] Confirm the digest email actually lands in the inbox and reads well (subject line, link works)
- [ ] General visual/UX polish — none of this has had a design pass, only a functional one

---

## 5. Suggested demo script

1. **Settings → Integrations tab.** Show SharePoint listed as connected (2 sites). Click **Manage** → lands on the dedicated SharePoint page.
2. **Click "Sync Now."** Point out the sync history list updating.
3. *(Optional)* **Click Disconnect**, show the status flip, then reconnect via "Connect SharePoint" to show that flow too.
4. **Switch to the "Needs Review" page** in the sidebar. Show the newly-synced document(s) — filename, source badge, department, date.
5. **Accept** one document → point out it's gone from the queue.
6. **Reassign** another → show the department dropdown, submit, gone from queue.
7. **Create Project** on a third → show the new-project checkbox + name field, submit.
8. **Go to the Knowledge Repository** (or the department page) → show the now-published documents sitting there like any manual upload.
9. **Check the inbox** (`nexgeninnovation2018@gmail.com`) for the digest email from the sync run.
10. *(Optional, if you want to show RBAC)* log in as a non-super-admin and show the "Needs Review" nav link isn't even there, and the Integrations tab isn't either.

---

## 6. Known gaps — not bugs, deliberately out of scope

- **Classification half of the Needs Review queue is empty.** Rank 4 (Simran's auto-classification work, `pr-21`) hasn't merged to `dev` yet. Once it does, the queue needs one small query change (already commented inline in `src/app/api/org/[orgId]/needs-review/route.js`) to also show classification-flagged manual uploads.
- **No automatic cron scheduler.** MVP is manual "Sync Now" only — a periodic auto-sync is explicitly deferred.
- **No folder-level department splitting.** One SharePoint site maps to exactly one department. Splitting one site into multiple departments by sub-folder is deferred.
- **Deleted/moved SharePoint files aren't reconciled.** If a file is deleted or renamed in SharePoint, KMS doesn't currently detect or archive it (this is Open Question #4 in the requirements doc — genuinely undecided, not forgotten).
- **No per-file SharePoint permission mirroring.** The connector is app-only and sees everything in a connected site regardless of who could see what in SharePoint itself (Open Question #2, also genuinely undecided).

---

## 7. Test data currently sitting in the mock "NGI" org

So none of this surprises you when you go poking around:

- **Org:** "NGI" (`nexgeninnovation2018@gmail.com`, super admin)
- **Departments:** General, Engineering, Finance
- **SharePoint sites connected:** Engineering, Finance (both on the `nextgenerationinnovation.onmicrosoft.com` test tenant)
- **A handful of synced/published test documents** in Engineering and Finance from earlier testing — real content (code review guidelines, incident response runbook, financial policy docs), harmless
- **One "7-F Test Project"** under Engineering, created during testing — safe to delete or rename if it's in the way
- **One test employee account:** `rbac-test-employee@nexgeninnovation.test` — created purely to verify a non-super-admin gets rejected everywhere. Safe to delete, or keep for future RBAC checks.

---

## 8. Your bug log (fill this in as you go)

| # | Where | What's wrong | Status |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

---

## 9. When you're ready to close this out

`7-I` is the only remaining task: submit the PR, get a review from Simran or Sandeep before merging to `dev`. I haven't committed or pushed anything yet — everything above is sitting uncommitted on `feature/task-7-sharepoint-ingestion-pipeline`, waiting for you to review first.
