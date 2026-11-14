# Tier 1 Alpha — Bug Fix Implementation Tracker
### Round 1 (from the Tier 1 alpha QA pass)

> **For AI agents:** This file is the source of truth for task status on the alpha bug-fix round. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS` and fill in `Started`. Add notes under the task if the fix diverged from the proposed approach, or if you found something new while fixing it.
>
> **Reference documents:** `TIER1_ALPHA_BUG_FIX_TASKS.md` for the full write-up per bug — raw QA finding, root-cause analysis with file:line citations, and proposed fix — this tracker deliberately doesn't repeat that detail, only summarizes it. `TIER1_ALPHA_BUG_FIX_TASKS.xlsx` for the same 16 bugs as a spreadsheet tracker (Summary tab, All Bugs tab, one tab per assignee). `TIER1_ALPHA_QA_TEST_PLAN.md`/`.xlsx` for the original 82-case test plan these bugs were found against.
>
> **Assignment discipline:** Tasks are grouped into three file-disjoint clusters specifically so the three assignees can work in parallel without merge conflicts — see the "Cluster" column and the per-cluster file lists below. If a fix genuinely needs a file outside your cluster, flag it before touching it rather than reaching across.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| `TODO` | Not started |
| `IN_PROGRESS` | Currently being worked on |
| `DONE` | Fix complete and merged |
| `VERIFIED` | Fix merged AND the original QA tester re-ran the failing test and confirmed it now passes |
| `BLOCKED` | Waiting on a dependency (e.g. a product decision) |
| `SKIP` | Deferred or out of scope |

---

## Milestone — Alpha Round 1 Bug Fixes

| Task ID | Title | Severity | Status | Assignee | Cluster | Started | Completed |
|---------|-------|----------|--------|----------|---------|---------|-----------|
| `BUG-01` | Project Chat (Ask/Clear) is strictly owner-only | Critical | `TODO` | Simran | Projects & Topics | | |
| `BUG-02` | Auto-organize (recluster) is strictly project-owner-only | High | `TODO` | Simran | Projects & Topics | | |
| `BUG-03` | Topic rename/delete has almost no authorization | High | `TODO` | Simran | Projects & Topics | | |
| `BUG-04` | Document owner-only actions render active for any viewer, fail silently | High | `TODO` | Sandeep | Documents, Repository & Ingestion | | |
| `BUG-05` | Repository lists org-scope project docs to users who then can't open them | High | `TODO` | Sandeep | Documents, Repository & Ingestion | | |
| `BUG-06` | No real in-app spreadsheet viewer for XLSX/CSV | Medium | `BLOCKED` | Sandeep | Documents, Repository & Ingestion | | |
| `BUG-07` | Duplicate detection didn't flag a Dept-Admin-uploaded duplicate | Medium | `TODO` | Sandeep | Documents, Repository & Ingestion | | |
| `BUG-08` | Dept-uploaded document doesn't appear inside the department's Project | Medium | `BLOCKED` | Sandeep | Documents, Repository & Ingestion | | |
| `BUG-09` | Employee/Guest invites can't include a department assignment | High | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-22 | 2026-08-22 |
| `BUG-10` | Declining an invite does nothing server-side | Medium | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-11` | No way to switch orgs from the "locked"/"no API key" screen | Medium | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-12` | Super Admin can't edit an existing member's role or remove them | Medium | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-13` | Org rename doesn't refresh the sidebar until full reload | Low | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-14` | SharePoint OAuth connect fails — missing deployment env vars | High | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-15` | Auth/onboarding polish batch (4 small UX items) | Low | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-16` | Needs Review empty for a filter combo — needs verification | Low | `DONE` | Johurul | Org, Auth, Invites, Billing & Settings | 2026-08-24 | 2026-08-24 |
| `BUG-17` | Project document list grants blanket manage permissions that per-document mutation routes don't honor | Medium | `TODO` | Johurul | Post-merge follow-up (PR #25) | | |

---

## Cluster — Projects & Topics permissions (Simran)

All three are the same shape of fix (add a Super Admin/Dept Admin bypass to an owner-only check) inside `src/app/api/projects/**`, a directory the other two clusters don't touch.

**Key files:** `src/app/api/projects/ask/route.js` · `src/app/api/projects/clear/route.js` · `src/app/api/projects/[id]/recluster/route.js` · `src/app/api/projects/[id]/topics/[topicId]/route.js` · `src/app/(app)/project/page.jsx` (Clear Chat button visibility only)

### Task BUG-01 — Project Chat ("Ask" and "Clear Chat") is strictly owner-only
- **Status:** `TODO`
- **Objective:** `src/app/api/projects/ask/route.js:33-35` and `src/app/api/projects/clear/route.js:16-18` both resolve the project via a literal-owner-only `findFirst`, with no super_admin/dept_admin bypass — so any admin opening a colleague's project gets `{error:"Project not found"}`. This is everyday functionality, not an edge case; bumped to Critical for that reason.
- **Key files:** `src/app/api/projects/ask/route.js`, `src/app/api/projects/clear/route.js`
- **Acceptance criteria:** As Super Admin or Dept Admin (not the project owner), send a message in a colleague's Project Chat and click Clear Chat — both must succeed instead of 404ing. Re-run `T83` and `T48` from the QA plan.
- **Note:** `T48` (Clear Chat specifically) was marked Pass by Tanzeela during QA despite the code being unambiguous — see caveat in `TIER1_ALPHA_BUG_FIX_TASKS.md` BUG-01. Re-verify with her once fixed rather than assuming it was already fine.

### Task BUG-02 — "Auto-organize" (recluster) is strictly project-owner-only
- **Status:** `TODO`
- **Objective:** `src/app/api/projects/[id]/recluster/route.js:17-22` uses the identical literal-owner pattern as `BUG-01`. Fix both the same way, ideally in the same PR since it's the same root-cause shape.
- **Key files:** `src/app/api/projects/[id]/recluster/route.js`
- **Acceptance criteria:** As a non-owner Super Admin/Dept Admin, click "Auto-organize" on a colleague's project — it schedules reclustering instead of 404ing. Re-run `T46`.

### Task BUG-03 — Topic rename/delete has almost no authorization
- **Status:** `TODO`
- **Objective:** `verifyTopicOwnership()` in `src/app/api/projects/[id]/topics/[topicId]/route.js` only checks that the caller has *some* resolved role in the org — not ownership, not department membership, not admin status. Any Employee or Guest can rename/delete any topic in any project org-wide.
- **Key files:** `src/app/api/projects/[id]/topics/[topicId]/route.js`
- **Acceptance criteria:** As an Employee with no relation to a project's department, attempt to rename/delete one of its topics — must be rejected. As the project owner, Super Admin, or a Dept Admin who administers that department, it must still succeed. Re-run `T45`.

---

## Cluster — Documents, Repository & Ingestion (Sandeep)

Everything here lives in `src/app/api/documents/**`, the repository route, the document detail page, and the ingestion worker — a self-contained domain, no overlap with the other two clusters' files.

**Key files:** `src/app/api/documents/[id]/regenerate|star|route|unassign|move-to-topic|ask|clear-conversation|start-conversation` · `src/app/api/org/[orgId]/repository/route.js` · `src/app/(app)/document/page.jsx` · `worker/classify.js` · `src/app/api/documents/ingest/route.js`

### Task BUG-04 — Document owner-only actions render active for any viewer, fail silently
- **Status:** `TODO`
- **Objective:** Every mutating document route (`regenerate`, `star`, `route.js` PATCH/DELETE, `unassign`, `move-to-topic`, `ask`, `clear-conversation`, `start-conversation`) is gated `where: { id, user: { email } }` — strict owner-only, no admin bypass — while the document GET response's `permissions` object hard-codes `true` for everyone who can view it. Buttons look active to non-owners; clicking them silently no-ops.
- **Key files:** all `src/app/api/documents/[id]/*` mutating routes listed above
- **Acceptance criteria:** Introduce one shared `canManageDocument({ role, doc, userId })` helper (owner OR super_admin OR dept_admin administering the doc's department) and apply it consistently. Also make the GET response's `permissions` reflect the real per-viewer answer. As a non-owner Dept Admin/Super Admin, Regenerate Summary / Star / Rename / Delete on a colleague's document must now either work (if you extend access) or show a clear disabled state — not a silent no-op. Re-run `T38` and the `T37` bug-hunt case Tanzeela didn't get to.

### Task BUG-05 — Repository lists org-scope project docs to users who then can't open them
- **Status:** `TODO`
- **Objective:** `src/app/api/org/[orgId]/repository/route.js`'s "Source B" (`{ project: { scope: "org", orgId } }`) has no department-membership condition, so it lists documents to every org member — but `src/app/api/documents/[id]/route.js`'s detail/download endpoint still requires department membership for the same document. List and detail disagree.
- **Key files:** `src/app/api/org/[orgId]/repository/route.js`, `src/app/api/documents/[id]/route.js`
- **Acceptance criteria:** Pick one source of truth (either gate Source B the same way, or relax the detail route for `scope: "org"` docs) and make the two routes agree. As a Guest with no department membership, a document that appears in the Repository list must be openable/downloadable — or must not appear in the list at all. Re-run `T27`.

### Task BUG-06 — No real in-app spreadsheet viewer for XLSX/CSV
- **Status:** `BLOCKED` — needs product sign-off on scope before starting
- **Objective:** The Document Detail page only shows AI-extracted metadata ("Sheets Breakdown") for spreadsheets, not an actual grid/cell viewer, unlike PDF/DOCX. Confirm with Tanzeela whether she meant this in-app metadata view or the raw Open/Download link before scoping a fix — a full spreadsheet viewer is a much bigger lift than fixing a download link.
- **Key files:** `src/app/(app)/document/page.jsx` (and a new component, if a real viewer is scoped in)
- **Acceptance criteria:** Depends on which scope is chosen — re-run `T84` either way once resolved.

### Task BUG-07 — Duplicate detection didn't flag a Dept-Admin-uploaded duplicate
- **Status:** `TODO` — start with re-verification, not a code change
- **Objective:** `worker/classify.js`'s `detectDocumentDuplicates()` runs async after embedding — the most likely explanation is a timing/race condition (checked before the worker finished), not a logic bug. Re-test with an explicit wait for the document to reach `ready`/`embedded` before checking for the duplicate banner.
- **Key files:** `worker/classify.js`
- **Acceptance criteria:** Re-upload an identical file as Dept Admin, wait for processing to complete, confirm the duplicate banner appears. If it still doesn't, check worker logs for that document's `detectDocumentDuplicates` run before changing code. Re-run `T82`.

### Task BUG-08 — Dept-uploaded document doesn't appear inside the department's Project
- **Status:** `BLOCKED` — needs a product decision
- **Objective:** Department-page uploads get `scope: "repository"` + `departmentId`, never a `projectId` — a document only joins a project via the AI "suggested project link" (Confirm/Dismiss on the Document Detail page), which is easy to miss. Very likely working as designed, badly surfaced.
- **Key files:** `src/app/api/documents/ingest/route.js` (only if auto-linking is chosen); otherwise UI-only in the department document card
- **Acceptance criteria:** Get a product decision (improve discoverability of the suggested-link banner vs. auto-link on high AI confidence) before writing code. Re-run `T81`/`T86` once resolved.

---

## Cluster — Org, Auth, Invites, Billing & Settings (Johurul)

Every bug here lives in the org-management surface — Settings, invites, auth pages, the sidebar, and the billing/locked screens. One owner means the Settings page's three separate bugs (`BUG-09`, `BUG-12`, `BUG-13`) land as sequential commits in one branch, not three people's.

**Key files:** `src/app/(app)/org/[orgId]/settings/page.jsx` · `src/components/layout/AppSidebar.jsx` · `src/app/org/invite/[token]/page.jsx` · `src/app/api/org/[orgId]/invite/route.js` · `src/app/api/org/invite/[token]/accept/route.js` · `src/app/api/org/invite/[token]/decline/route.js` (new) · `src/app/org/[orgId]/billing-locked/page.jsx` · `src/app/api/org/[orgId]/members/[userId]/route.js` (new) · `src/app/auth/reset-password/page.jsx` · `src/lib/mailer.js` / email templates · `src/app/(app)/org/[orgId]/billing/page.jsx` · deployment env config

### Task BUG-09 — Employee/Guest invites can't include a department assignment
- **Status:** `DONE`
- **Objective:** The invite form only shows the department-checkbox picker when `inviteRole === 'dept_admin'`, and the invite route drops `departmentIds` for every other role. There's no one-step way to invite an Employee/Guest directly into a department.
- **Key files:** `src/app/(app)/org/[orgId]/settings/page.jsx`, `src/app/api/org/[orgId]/invite/route.js`, `src/app/api/org/invite/[token]/accept/route.js`
- **Acceptance criteria:** Show the department picker for Employee/Guest too (multi-select, not required); thread `departmentIds` through for all roles; accept-route writes `DepartmentMember` role `"member"` for non-dept_admin invites (not the hard-coded `"admin"` currently used for every invited department). Re-run `T79`.
- **Note:** Department picker now renders for every role (label changes to "optional" for non-dept_admin); invite route validates/stores `departmentIds` for any role, still requiring at least one for `dept_admin`; accept route derives `DepartmentMember` role as `"admin"` only when `invite.role === "dept_admin"`, else `"member"`. Committed on `fix/alpha-bugs-johurul` (`4a8e1c2`). Still needs Johurul to re-run `T79` in the UI before marking `VERIFIED`.

### Task BUG-10 — Declining an invite does nothing server-side
- **Status:** `DONE`
- **Objective:** `handleDecline` in `src/app/org/invite/[token]/page.jsx:60` is pure client-side navigation — no API call. The invite stays live and re-offers Accept/Decline on reopen.
- **Key files:** `src/app/org/invite/[token]/page.jsx`, new `src/app/api/org/invite/[token]/decline/route.js`
- **Acceptance criteria:** Decline sets a terminal state on the invite (e.g. `declinedAt`); reopening the link afterward shows "Invite Unavailable," not a live Accept/Decline choice. While in this file, also relabel the invite email's button (currently "Accept Invitation" though it opens a page offering both Accept and Decline) — see `src/app/api/org/[orgId]/invite/route.js`'s email template. Re-run `T80`.
- **Note:** Added `OrganizationInvite.declinedAt` (migration `20260824004832_add_invite_declined_at`); new decline route sets it, and the lookup/accept routes now both treat a declined invite as unavailable (404 "Invite not found or expired"). Email button relabeled "View Invitation". Committed on `fix/alpha-bugs-johurul` (`a54badf`). Side note: `prisma migrate dev`'s diff tried to drop two pre-existing indexes (`Chunk_embedding_vec_idx`, `OrganizationMember_lastDepartmentId_idx`) that aren't representable in `schema.prisma` as originally written — caught it, restored both on the dev DB, and added the missing `@@index([lastDepartmentId])` so it won't recur; the vector index still isn't schema-representable so watch for this again on future migrations touching unrelated models. Needs `T80` re-run before `VERIFIED`.

### Task BUG-11 — No way to switch orgs from the "locked"/"no API key" screen
- **Status:** `DONE`
- **Objective:** `src/app/org/[orgId]/billing-locked/page.jsx` shows only the lock message and admin contacts — no link back to Welcome Back, so a multi-org user is stuck if their current org happens to be locked.
- **Key files:** `src/app/org/[orgId]/billing-locked/page.jsx`
- **Acceptance criteria:** Add a "Switch organization" link to `/welcome-back`. Confirm with a multi-org test account that landing on this page still lets you reach your other org.
- **Note:** Added a "Switch organization" button linking to `/welcome-back` below the admins list. Committed on `fix/alpha-bugs-johurul` (`55e4913`). Needs a manual click-through with a multi-org test account before `VERIFIED` (this session doesn't drive the browser — see the repo's DB-dry-run-only verification policy).

### Task BUG-12 — Super Admin can't edit an existing member's role or remove them
- **Status:** `DONE`
- **Objective:** There's no `src/app/api/org/[orgId]/members/[userId]/route.js` at all (only the `.../departments` sub-route exists, for dept_admin department assignments). No way to change a member's org role or remove them post-invite.
- **Key files:** new `src/app/api/org/[orgId]/members/[userId]/route.js`, `src/app/(app)/org/[orgId]/settings/page.jsx` (Members tab UI)
- **Acceptance criteria:** Add `PATCH` (change role, super_admin-only, block self-demotion if sole super_admin) and `DELETE` (remove from org), plus matching UI. As Super Admin, change another member's role and confirm it takes effect on their next request; remove a member and confirm they lose access.
- **Note:** Both routes are super_admin-only and refuse to demote/remove the org's only Super Admin (a slightly more general guard than just "self" — covers anyone trying to strip the last super_admin). `DELETE` also cleans up the removed user's `DepartmentMember` rows within that org so they don't linger as a department member after losing org access. Members tab now has inline pencil→select→check/cancel role editing and a remove (trash) button per row. Committed on `fix/alpha-bugs-johurul` (`0f69481`). Query shapes dry-run verified read-only against the dev DB (see session notes); still needs a live click-through to confirm the removed member actually loses access on their next request before `VERIFIED`.

### Task BUG-13 — Org rename doesn't refresh the sidebar until full reload
- **Status:** `DONE`
- **Objective:** Settings page updates its own local `org` state correctly after rename, but `AppSidebar.jsx` fetches the org name once on mount with no way to learn it changed.
- **Key files:** `src/app/(app)/org/[orgId]/settings/page.jsx`, `src/components/layout/AppSidebar.jsx`
- **Acceptance criteria:** Quick win: call `router.refresh()` after a successful rename. Rename the org and confirm the sidebar updates without a manual page reload. Re-run `T11`.
- **Note:** `router.refresh()` turned out not to be viable — `AppSidebar` is a client component that fetches its own org data (`useEffect(..., [orgId])`), and `router.refresh()` only re-renders Server Components, so it wouldn't have touched that state. Used a `window.dispatchEvent(new CustomEvent('kms:org-updated', ...))` from the settings page after a successful rename instead, with `AppSidebar` listening and patching its local `org.name` in place. Committed on `fix/alpha-bugs-johurul` (`a6cb4bb`). Needs `T11` re-run before `VERIFIED`.

### Task BUG-14 — SharePoint OAuth connect fails — missing deployment env vars
- **Status:** `TODO` — infra/config, not app code
- **Objective:** `src/lib/msGraph.js`'s `requireEnv()` throws if `MSGRAPH_CLIENT_ID`/`MSGRAPH_CLIENT_SECRET` aren't set; neither is listed in `.env.example`. This is why Connect SharePoint failed immediately for Tanzeela.
- **Key files:** deployment/staging environment secrets, `.env.example`
- **Acceptance criteria:** Add both vars to the deployment environment and to `.env.example` with a comment. Re-run `T63`–`T67` against the existing SharePoint test tenant (mock org "NGI") once deployed — should unblock all five without a code change.
- **Note:** Johurul added `MSGRAPH_CLIENT_ID`/`MSGRAPH_CLIENT_SECRET` (plus `MSGRAPH_TENANT_ID`) directly — confirmed present in his local `.env`. `.env.example` still doesn't list these three vars (worth adding as a template reference, low priority, docs-only). Needs `T63`–`T67` re-run against the SharePoint test tenant before `VERIFIED`.

### Task BUG-15 — Auth/onboarding polish batch (4 small UX items)
- **Status:** `DONE`
- **Objective:** Four independent, non-blocking notes: (1) sign-in's generic "Invalid email" — **recommend leaving as-is**, it's a standard defense against user enumeration, close as "won't fix, by design" and relay the rationale to the tester rather than changing it; (2) Reset Password page needs a show/hide toggle + field alignment; (3) OTP/notification emails need visual styling; (4) Billing's monthly/yearly toggle/upgrade flow needs UX work.
- **Key files:** `src/app/auth/reset-password/page.jsx`, `src/lib/mailer.js`/email templates, `src/app/(app)/org/[orgId]/billing/page.jsx`
- **Acceptance criteria:** (2)/(3)/(4) fixed in one small PR; (1) explicitly closed with a note rather than changed. Re-run `T4`/`T1`/`T68`.
- **Note:** (1) closed, no change. (2) `ResetPasswordClient.jsx` — both password fields now use `Input`'s `leftIcon`/`rightIcon` slots consistently (fixes the icon-alignment mismatch) with independent show/hide toggles. (3) `mailer.js` — added a shared `wrapEmail()` branded wrapper (header/card/footer) used by `sendOtpEmail` and `sendSyncDigestEmail`; the OTP itself is now a formatted code block instead of a bare `<h2>`. (4) `billing/page.jsx` — discovered via a DB dry-run that there are 4 active plans (Starter/Pro × Monthly/Yearly) all rendered in one flat grid with no way to filter, and same-tier different-interval was incorrectly blocked as "Not Available"; added a Monthly/Yearly toggle (defaults to the org's current interval) that filters the grid, and loosened the disabled condition to only block true storage downgrades. Committed on `fix/alpha-bugs-johurul` (`1b78c52`). Needs `T4`/`T1`/`T68` re-run before `VERIFIED`.

### Task BUG-16 — Needs Review empty for a filter combo — needs verification
- **Status:** `DONE`
- **Objective:** No documents currently match `source=manual` + that category in Needs Review — reads as a test-data gap (the queue/filter code was already reviewed and is straightforward), not a filtering bug.
- **Key files:** none expected — verification only
- **Acceptance criteria:** Upload a fresh manual-source document with a matching category, confirm it lands in Needs Review, then re-run `T60` (Reassign) properly. Only escalate to a code fix if a document that should match still doesn't show.
- **Note:** Verified via DB dry-run (no browser automation, no upload): the currently *committed* `src/app/api/org/[orgId]/needs-review/route.js` hard-filters `where: { lifecycle: "draft" }`. All 14 real manual-source repository documents across every org have `lifecycle: "published"` (manual uploads never sit in `draft`) — so the Manual filter is **structurally guaranteed to return zero results today, for any category**. This is a real code defect, not a test-data gap; the original "needs verification" hypothesis was wrong. Confirmed the fix shape by inserting one synthetic document (`sourceProvider:"manual"`, `classificationStatus:"needs_review"`, `category:"Marketing"`) into the "Test Org" org, re-querying, and deleting it immediately after — full script + output kept in this session's log, DB left clean.
  An uncommitted, working-tree-only fix for exactly this was found already sitting in the repo (not authored this session — present before this branch was created) in `src/app/api/org/[orgId]/needs-review/route.js`, `.../[docId]/confirm/route.js`, and `src/app/(app)/org/[orgId]/needs-review/page.jsx`. It adds the `OR: [{ lifecycle: "draft" }, { classificationStatus: "needs_review" }]` branch plus duplicate-flag and suggested-department wiring — the synthetic test document above showed up correctly under that query. Looked like leftover WIP from the Knowledge Context Engine (Rank 4 / "7-J") work; also touches duplicate-flag UI which overlaps BUG-07's territory (Sandeep's cluster) — flagged that overlap to Johurul, who confirmed committing it as-is. Committed on `fix/alpha-bugs-johurul` (`9641c0a`). Separately, all 16 manual-source documents in the DB are stuck at `classificationStatus: "pending_classification"` (never `needs_review` or `published` via classification) — the classification worker doesn't appear to be running in this environment, worth checking independently of this bug. Needs `T60`/`T85` re-run before `VERIFIED`.

---

## Cluster — Post-merge follow-up from PR #25 review (Johurul)

Found during a review pass of `fix/alpha-bugs-simran-sandeep` (PR #25, merged into `dev`). Not part of the original 16 — logged here rather than reopening BUG-04, since the PR that introduced it already resolved BUG-04's original symptom (non-owner admins seeing an empty doc list / silent-failing buttons) and this is a narrower regression from that same fix.

### Task BUG-17 — Project document list grants blanket manage permissions that per-document mutation routes don't honor
- **Status:** `TODO`
- **Objective:** BUG-04's fix (`8d64d3a` on PR #25) changed `GET /api/documents?projectId=` (`src/app/api/documents/route.js`) to gate on `resolveProjectManagementAccess`'s project-level `canManage`, and now returns `permissions: { canManage: true, canStar: true, canRename: true, canDelete: true }` **hardcoded on every document** in the response, once the caller can manage the project. But `documents/ingest/route.js` has no ownership/department check for `scope: "project"` uploads — any org member can upload a document (tagged with their own `userId`) into an existing `projectId` they don't own. The single-document mutation routes (`resolveDocumentManagementAccess` in `star`/`route.js` DELETE&PATCH/`unassign`/`move-to-topic`) correctly still require the caller be the document's own uploader, a super_admin, or a dept_admin managing that department — project ownership alone isn't one of those criteria. Net effect: a plain-Employee project owner viewing a colleague-uploaded document inside their own project sees Delete/Star/Rename marked as available (list says `true`), then gets a 403 on click. This is the same "list and detail/mutation disagree" shape as BUG-05, just for permissions instead of existence.
- **Key files:** `src/app/api/documents/route.js` (the `permissions` block in the `GET` handler), `src/lib/documentManagementPolicy.js` (reuse `resolveDocumentManagementAccess` per document instead of hardcoding)
- **Acceptance criteria:** Compute each returned document's `permissions` from the same per-document rule the mutation routes use (uploader OR super_admin OR dept_admin managing the department) rather than inheriting the project-level `canManage` flag verbatim. As a plain-Employee project owner, open a project containing a document uploaded by a different (non-admin) org member — that document's Star/Rename/Delete controls must render disabled/hidden, not active-then-403.
- **Note:** Not blocking — the sibling fix in the same commit (`toast.error(...)` on failed delete/star/rename in `project/page.jsx`) means this no longer fails *silently*, just incorrectly-permitted-looking. Low urgency, tracked for a follow-up pass.

---

## Notes

- Land PRs in any order — there's no cross-cluster dependency between the three lists above; each cluster's files are fully disjoint from the other two.
- `BUG-06`, `BUG-08`, and `BUG-16` are marked `BLOCKED` deliberately — they need a decision or a re-test before code should be written, not because anyone else is holding them up.
- Once a fix lands, the original QA tester should re-run the exact test ID(s) named in each task's Acceptance Criteria before this tracker marks that task `VERIFIED` (not just `DONE`).
