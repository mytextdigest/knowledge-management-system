# Tier 1 Alpha — Bug Fix Task List

**Status:** Ready to assign
**Created:** 2026-08-20 (updated 2026-08-20)
**Source:** Findings recorded by Tanzeela, Sandeep, Simran, and Johurul in `TIER1_ALPHA_QA_TEST_PLAN.xlsx` during alpha testing, cross-checked against the current codebase.
**Companion file:** `TIER1_ALPHA_BUG_FIX_TASKS.xlsx` — same 16 bugs as a tracker, with a Summary tab, an "All Bugs" tab, and one tab per assignee.

---

## 1. Raw QA findings, as reported

Everything below is what the testers actually wrote in the spreadsheet (Status / Severity / Notes columns), before any code analysis. Rows with no notes and a plain "Pass" aren't reproduced here — this is every row that had something to say.

### Tanzeela (Super Admin persona)

| Test | Status | Severity | Notes |
|---|---|---|---|
| T11 Rename the organization | Fail | Low | The new organization name appears only after the screen is refreshed |
| T16 Integrations tab overview | Fail | Medium | After clicking Connect SharePoint, an error popped up (tester has no SharePoint account) |
| T63 Connect SharePoint via OAuth | Blocked | Medium | SharePoint connection itself isn't working |
| T64–T67 (site picker / sync / sync history / disconnect) | Blocked | Medium | Cascading blocks from T63 — each requires the prior step |
| T81 *(added by tester)* Dept Admin doc visible in Repository but not in Project | Fail | High | Document uploaded by the Department Admin is visible in the Knowledge Repository with its category, but not inside the relevant project |
| T82 *(added by tester)* Duplicate document not flagged | Fail | High | Same document re-uploaded from the Dept Admin account — no duplicate flag appeared |
| T83 *(added by tester)* Project Chat not functioning | Fail | High | Reproduces for both Super Admin and Dept Admin; Document Chat works with the same setup |
| T84 *(added by tester)* Excel/XLSX document does not open | Fail | High | XLSX preview is blocked |
| T85 *(added by tester)* Reassign action availability | Blocked | Medium | No documents appear in Needs Review for the Manual + Marketing filter, so Reassign can't be verified |
| T86 *(added by tester)* Project document list doesn't match Repository visibility | Fail | High | Documents findable via Repository/category are absent from the corresponding project view |

### Sandeep (Department Admin persona)

| Test | Status | Severity | Notes |
|---|---|---|---|
| T38 Bug-hunt: Dept Admin viewing a colleague's document | Fail | Medium | Regenerate Summary is shown to a Dept Admin viewing another user's document, but the API requires literal ownership |
| T46 Auto-organize / Recluster, owner vs non-owner | Fail | Medium | Recluster is restricted to the literal project owner — a non-owner Super Admin can't recluster |

Everything else on Sandeep's list passed clean (department CRUD, project CRUD, uploads, filters, timeline, drag-and-drop, invite-while-signed-out, dashboard feeds).

### Simran (Employee persona)

| Test | Status | Severity | Notes |
|---|---|---|---|
| T45 Bug-hunt: topic rename/delete by an outside org member | Fail | High | An Employee outside the department may be able to rename/delete topics in another department's project |
| T79 Accept invite while signed in — role/department applied | Fail | High | Employee invite acceptance doesn't consistently apply invited department assignments |

Everything else on Simran's list passed (repository browsing, document chat/summary/pagewise-guide/star/rename/delete, org AI assistant end-to-end, project-CRUD boundary check).

### Johurul (Guest + auth/boundary persona)

| Test | Status | Notes |
|---|---|---|
| T1 Sign up | Pass | Note: styling the OTP/notification emails |
| T3 Sign in | Pass | Note: generic "Invalid email" message should distinguish bad email vs. bad password |
| T4 Forgot/reset password | Pass | Note: reset-password page needs show/hide password toggle + field alignment |
| T27 Guest repository access | Pass | Note: Guest can see documents listed but gets "could not be found, or you don't have access to it" when opening/downloading |
| T68 Billing blocked for non-admin | Pass | Note: billing page needs work, especially monthly/yearly upgrade flow |
| T80 Decline invite + expired token | **Partial** | Bug: declined invite still shows Accept/Decline on reopen — it never expires/gets consumed. Also: invite email button says "Accept Invitation" but opens a page with both Accept and Decline |
| *(additional, unlabeled)* | — | Bug: if a user's current org is locked (inactive subscription / no API key), there's no way to switch to another org they belong to |
| *(additional, "2")* | — | Note: Super Admin currently cannot edit any existing member's role |
| *(additional, "3")* | — | Note: SharePoint app secrets/client IDs need to be added to deployment env variables |

---

## 2. Root-cause analysis

Each raw finding above was checked against the current code. Status tags:

- **Confirmed** — reproduced a concrete code path that explains the symptom exactly.
- **Needs verification** — plausible root cause identified, but re-testing under controlled conditions should happen before spending fix time.
- **Needs product decision** — behaves as coded, but whether that's *correct* is a product call, not an engineering one.

### Org, Auth, Invites, Billing & Settings — owned by Johurul

Every bug in this cluster lives in the org-management surface — Settings, invites, auth pages, the sidebar, and the billing/locked screens. Keeping one owner here means repeated touches to the same file (Settings page gets 3 separate bugs) happen in one person's branch, not three people's.

<details><summary>Files in this cluster</summary>

- `src/app/(app)/org/[orgId]/settings/page.jsx`
- `src/components/layout/AppSidebar.jsx`
- `src/app/org/invite/[token]/page.jsx`
- `src/app/api/org/[orgId]/invite/route.js`
- `src/app/api/org/invite/[token]/accept/route.js`
- `src/app/api/org/invite/[token]/decline/route.js (new)`
- `src/app/org/[orgId]/billing-locked/page.jsx`
- `src/app/api/org/[orgId]/members/[userId]/route.js (new)`
- `src/app/auth/reset-password/page.jsx`
- `src/lib/mailer.js / email templates`
- `src/app/(app)/org/[orgId]/billing/page.jsx`
- `deployment env config (not app code)`

</details>

#### BUG-09. Employee/Guest invites cannot include a department assignment — no one-step way to invite someone directly into a department

- **Severity:** High
- **Status:** Confirmed
- **Reported in:** T79 (Simran, Fail/High)
- **Root cause:** src/app/(app)/org/[orgId]/settings/page.jsx only renders the department-checkbox picker when `inviteRole === 'dept_admin'` (line ~684), and switching the role dropdown clears any selection (line 667). src/app/api/org/[orgId]/invite/route.js then hard-drops departmentIds for any role other than dept_admin (`departmentIds: role === "dept_admin" ? departmentIds : []`). So there is no way, in one step, to invite an Employee or Guest and have them land in a specific department — an admin has to invite them org-wide, then separately open the target Department → Members tab and add them there. Simran's test expected the invited department to 'stick' the way it does for Dept Admin invites, and it can't, because the feature doesn't exist for that role.
- **Proposed fix:** Show the same department-checkbox picker for Employee/Guest roles (multi-select, not required), and thread departmentIds through the invite route for all roles — writing plain `DepartmentMember` rows with role "member" (not "admin" — see the accept route's upsert, which currently hard-codes role:"admin" for every invited department; that's correct for dept_admin invites but would need a role parameter once employee/guest invites can carry departments too).

#### BUG-10. Declining an invite does nothing server-side — the invite stays valid and re-offers Accept/Decline on reopen

- **Severity:** Medium
- **Status:** Confirmed
- **Reported in:** T80 (Johurul, Partial)
- **Root cause:** src/app/org/invite/[token]/page.jsx:60 — `const handleDecline = () => router.push('/welcome-back');` — purely local navigation, no API call at all. The invite record is never touched, so reopening the same link still shows a live Accept/Decline choice, exactly as Johurul reported.
- **Proposed fix:** Add a `POST /api/org/invite/[token]/decline` route that sets a `declinedAt` (or reuses `acceptedAt`-style terminal state) on the invite, and call it from `handleDecline` before navigating away. While in this area, also address Johurul's secondary note: the invite email's button is labeled 'Accept Invitation' but actually opens a page offering both Accept and Decline — relabel it to something neutral like 'View Invitation' in src/app/api/org/[orgId]/invite/route.js's email template.

#### BUG-11. No way to switch organizations from the "organization is locked" / "no API key" screen

- **Severity:** Medium
- **Status:** Confirmed
- **Reported in:** Johurul, additional note (unlabeled row)
- **Root cause:** src/app/org/[orgId]/billing-locked/page.jsx renders only the lock message and a list of that org's Super Admins to contact — there's no link back to Welcome Back or an org switcher, so a user who belongs to multiple orgs is stuck if their *current* org happens to be locked/keyless, even though they have a perfectly usable other org.
- **Proposed fix:** Add a 'Switch organization' / 'Back to my organizations' link to `/welcome-back` on this page.

#### BUG-12. No way for a Super Admin to change an existing member's org-level role (or remove them from the org)

- **Severity:** Medium
- **Status:** Confirmed
- **Reported in:** Johurul, additional note ("2. Right now super admin cannot edit any role")
- **Root cause:** There is no `src/app/api/org/[orgId]/members/[userId]/route.js` at all — the only per-member org-level route that exists is .../members/[userId]/departments/route.js (which only edits a dept_admin's department assignments). Once someone's invite is accepted, their org role is permanent short of a direct DB edit, and there's no member-removal path either (only department-level removal exists).
- **Proposed fix:** Add the missing route with PATCH (change role, super_admin-only, probably disallow self-demotion if they're the only super_admin) and DELETE (remove from org), plus the corresponding UI controls in the Settings → Members tab.

#### BUG-13. Org name change doesn't refresh in the sidebar/header until a full page reload

- **Severity:** Low
- **Status:** Confirmed
- **Reported in:** T11 (Tanzeela, Fail/Low)
- **Root cause:** src/app/(app)/org/[orgId]/settings/page.jsx correctly updates its own local `org` state after a successful rename (`setOrg((o) => ({ ...o, name: data.name }))`), but src/components/layout/AppSidebar.jsx fetches the org name independently, once, in a `useEffect` keyed only on `orgId` — it has no way to learn the name changed short of a remount.
- **Proposed fix:** Simplest fix: lift org name into a shared context/store (or just re-fetch on a custom event / router refresh) so AppSidebar re-renders when Settings saves a rename. A quick win short of a full context refactor: have the Settings save handler call `router.refresh()` after a successful rename.

#### BUG-14. SharePoint OAuth connect fails immediately in the test/deployed environment

- **Severity:** High
- **Status:** Confirmed (infra/config, not app logic)
- **Reported in:** T16 (Tanzeela, Fail/Medium); T63–T67 (Tanzeela, Blocked/Medium — cascading from T63); Johurul, additional note ("3. Adding sharepoint app secrets and ids in the deployment env variables")
- **Root cause:** src/lib/msGraph.js's `requireEnv()` throws immediately if `MSGRAPH_CLIENT_ID` / `MSGRAPH_CLIENT_SECRET` aren't set, and both `.../connect/route.js` and `.../confirm/route.js` depend on them. These two variables aren't listed in .env.example at all. This matches Tanzeela's screenshot of an immediate failure on clicking 'Connect SharePoint,' and Johurul independently flagged the same root cause from the infra side. The test tenant itself is already set up (mock org 'NGI', nextgenerationinnovation.onmicrosoft.com — see project memory) — this is purely about the app's env vars not being present wherever this was tested.
- **Proposed fix:** Add `MSGRAPH_CLIENT_ID` / `MSGRAPH_CLIENT_SECRET` (and confirm `NEXT_PUBLIC_APP_URL` is correct for the redirect URI) to the deployment/staging environment's secrets, and add them to `.env.example` with a comment so this doesn't silently regress again. This unblocks T63–T67 as a side effect — no code fix needed unless the deployed values turn out to be wrong, not missing.

#### BUG-15. Auth/onboarding polish batch: sign-in error specificity, reset-password page layout, OTP email styling, billing plan-toggle UX

- **Severity:** Low
- **Status:** Confirmed — cosmetic/UX, bundle as one pass
- **Reported in:** T3, T4, T1 (Johurul, notes on Pass results); T68 (Johurul, note on Pass result)
- **Root cause:** Four small, independent UX notes from Johurul, none blocking: (1) T3 — sign-in shows a generic 'Invalid email' for both a wrong email and a wrong password; (2) T4 — the Reset Password page has no show/hide toggle on its two password fields and they're visually misaligned; (3) T1 — OTP/notification emails need visual styling; (4) T68 — the Billing page's monthly/yearly toggle and upgrade flow needs UX work.
- **Proposed fix:** (1) Deliberately recommend AGAINST making this more specific — a generic error is a standard defense against user enumeration (an attacker probing which emails have accounts). Close this one as 'won't fix, by design' and let Johurul relay the rationale to the tester rather than changing it. (2)/(3)/(4) are straightforward front-end polish — fold into a single small PR.

#### BUG-16. Needs Review queue showed nothing for a Manual + "Marketing" filter combination

- **Severity:** Low
- **Status:** Needs verification — likely a test-data gap, not a code defect
- **Reported in:** T85 (Tanzeela, custom, Blocked/Medium)
- **Root cause:** No documents currently sit in Needs Review matching `source=manual` + that department/category combination — this reads as an empty result set from missing test fixtures rather than a filtering bug (the Needs Review queue and filter code were already reviewed in an earlier pass and are straightforward). Confirm a real unconfirmed document exists with that exact source+category combination before spending fix time here.
- **Proposed fix:** Upload a fresh test document with source=manual and category=Marketing, confirm it lands in Needs Review, and re-run T60 (Reassign) properly. Only escalate to a code bug if a document that should match still doesn't show.

### Projects & Topics permissions — owned by Simran

All three bugs are the same shape of fix (add a Super Admin/Dept Admin bypass to an owner-only check) inside src/app/api/projects/**, a directory nobody else touches this round.

<details><summary>Files in this cluster</summary>

- `src/app/api/projects/ask/route.js`
- `src/app/api/projects/clear/route.js`
- `src/app/api/projects/[id]/recluster/route.js`
- `src/app/api/projects/[id]/topics/[topicId]/route.js`
- `src/app/(app)/project/page.jsx (Clear Chat button visibility only)`

</details>

#### BUG-01. Project Chat ("Ask" and "Clear Chat") is strictly owner-only — Super Admin/Dept Admin get "Project not found"

- **Severity:** Critical
- **Status:** Confirmed
- **Reported in:** T83 (Tanzeela, custom); T48 (Tanzeela, marked Pass — see caveat); T47 (Sandeep, Pass — tested as owner)
- **Root cause:** src/app/api/projects/ask/route.js:33-35 and src/app/api/projects/clear/route.js:16-18 both resolve the project with `prisma.project.findFirst({ where: { id: projectId, user: { email: session.user.email } } })` — a literal-owner-only match with no super_admin/dept_admin bypass. Anyone who isn't the exact creator gets `{error:"Project not found"}`. This is core, everyday functionality (not an edge case), so it reproduces constantly whenever an admin opens a colleague's project — exactly what Tanzeela hit in T83 on both her Super Admin account and while acting as Dept Admin.
- **Caveat:** T48 (the paired bug-hunt test for Clear Chat specifically) was marked Pass by Tanzeela. Given the code is unambiguous and T83 explicitly says the failure "reproduces for both Super Admin and Department Admin," T48 was most likely run against a project Tanzeela happened to own, not a true non-owner case — flag this to her rather than treating it as a contradiction.
- **Proposed fix:** Replace the ownership-only `findFirst` in both routes with the same pattern already used correctly elsewhere (e.g. `canManageProjectLink` in src/lib/knowledgeContextPolicy.js): allow the literal owner, OR super_admin, OR a dept_admin who administers the project's department (via `canManageDepartment` from src/lib/orgGuard.js).

#### BUG-02. "Auto-organize" (recluster) is strictly project-owner-only, no admin bypass

- **Severity:** High
- **Status:** Confirmed
- **Reported in:** T46 (Sandeep, Fail/Medium)
- **Root cause:** src/app/api/projects/[id]/recluster/route.js:17-22 uses the identical literal-owner `findFirst` pattern as BUG-01. A Super Admin or Dept Admin opening a colleague's project sees the 'Auto-organize' button (no client-side gating) but the request 404s.
- **Proposed fix:** Same fix pattern as BUG-01 — extend the ownership check to include super_admin / department-administering dept_admin.

#### BUG-03. Topic rename/delete has almost no authorization — any org member (even a Guest, even outside the project's department) can rename or delete any topic

- **Severity:** High
- **Status:** Confirmed
- **Reported in:** T45 (Simran, Fail/High)
- **Root cause:** src/app/api/projects/[id]/topics/[topicId]/route.js — the `verifyTopicOwnership()` helper (despite its name) does NOT check ownership, department membership, or admin status at all. It only calls `resolveOrgRole(email, orgId)` and checks `if (!role) return null`. Since every invited role (super_admin, dept_admin, employee, guest) resolves to a truthy role, this is effectively 'any member of the org, full stop' — broader than what Simran's test even set out to prove (she tested Employee; a Guest would pass the same check).
- **Proposed fix:** Add a real check: caller is super_admin, OR dept_admin administering the project's department (`canManageDepartment`), OR the project owner. Rename the helper once it actually does what its name says.

### Documents, Repository & Ingestion — owned by Sandeep

Everything here lives in src/app/api/documents/**, the repository route, the document detail page, and the ingestion worker — a self-contained domain that doesn't overlap the other two clusters' files at all.

<details><summary>Files in this cluster</summary>

- `src/app/api/documents/[id]/regenerate/route.js`
- `src/app/api/documents/[id]/star/route.js`
- `src/app/api/documents/[id]/route.js`
- `src/app/api/documents/[id]/unassign/route.js`
- `src/app/api/documents/[id]/move-to-topic/route.js`
- `src/app/api/documents/[id]/ask/route.js`
- `src/app/api/documents/[id]/clear-conversation/route.js`
- `src/app/api/documents/[id]/start-conversation/route.js`
- `src/app/api/org/[orgId]/repository/route.js`
- `src/app/(app)/document/page.jsx`
- `worker/classify.js`
- `src/app/api/documents/ingest/route.js`

</details>

#### BUG-04. Document owner-only actions (Regenerate Summary, Ask, Clear Chat, Star, Rename, Delete, Unassign, Move-to-topic) render as active for any viewer but silently fail for non-owners

- **Severity:** High
- **Status:** Confirmed
- **Reported in:** T38 (Sandeep, Fail/Medium); T37 (Tanzeela, left blank — not completed)
- **Root cause:** Every mutating document route — src/app/api/documents/[id]/regenerate/route.js, star/route.js, route.js (PATCH/DELETE), unassign/route.js, move-to-topic/route.js, ask/route.js, clear-conversation/route.js, start-conversation/route.js — queries with `where: { id, user: { email: session.user.email } } }`, i.e. strict document-owner-only, with no super_admin/dept_admin bypass. Meanwhile the document GET response's `permissions` object (`canRegenerate`, `canStar: true`, `canUnassign: true`) is hard-coded true for anyone who can *view* the document, so the UI shows all of these as active, clickable buttons regardless of ownership. Sandeep confirmed this concretely for Regenerate Summary in T38; the same code pattern applies to every action in this list.
- **Proposed fix:** Introduce one shared helper (e.g. `canManageDocument({ role, doc, userId })`, following the existing `canManageProjectLink` pattern in src/lib/knowledgeContextPolicy.js) — owner OR super_admin OR dept_admin administering the doc's department — and use it consistently across all the routes above. Also fix the GET response's `permissions` object to reflect the real per-user answer instead of a hard-coded `true`, so the UI can grey out buttons the viewer can't actually use.

#### BUG-05. Repository listing shows org-scope-promoted project documents to users with no department membership — but opening/downloading them 404s

- **Severity:** High
- **Status:** Confirmed
- **Reported in:** T27 (Johurul, marked Pass with a bug noted in the notes field)
- **Root cause:** src/app/api/org/[orgId]/repository/route.js builds its result set as `sourceA OR sourceB`. `sourceA` (plain repository-scoped docs) correctly restricts non-admins to `departmentId: null OR departmentId IN userDeptIds`. `sourceB` (`{ project: { scope: "org", orgId } }` — documents from projects promoted to org-wide visibility) has **no department-membership condition at all** — it matches for every org member regardless of role or department. But src/app/api/documents/[id]/route.js (the detail/download endpoint) computes `departmentId = doc.departmentId ?? doc.project?.departmentId ?? null` and requires a `DepartmentMember` row for non-admins when that's set — which it usually still is, even for an org-scope-promoted project. Net effect: a Guest (or any employee outside that department) sees the document in the Repository list, but opening or downloading it returns "This document could not be found, or you don't have access to it." — exactly what Johurul reported.
- **Proposed fix:** Either (a) apply the same department-membership OR condition to `sourceB` in the repository route so the list only shows what the detail route will actually serve, or (b) if org-scope promotion is meant to override department gating, relax the same check in the detail route for `project.scope === "org"` documents. Pick one source of truth — right now the two routes disagree.

#### BUG-06. No real in-app spreadsheet viewer for XLSX/CSV — only extracted metadata is shown

- **Severity:** Medium
- **Status:** Confirmed (scope needs product sign-off)
- **Reported in:** T84 (Tanzeela, custom, Fail/High)
- **Root cause:** In src/app/(app)/document/page.jsx, spreadsheet files (`isSpreadsheet` = xlsx/xls/csv) only render a 'Sheets Breakdown' built from AI-extracted metadata (sheet names, column headers, row ranges from worker/extractSpreadsheet.js chunks) — there is no actual grid/cell viewer, unlike PDF (react-pdf) or DOCX (mammoth). Separately, the Repository card's quick-'Preview' modal is PDF-only, so for XLSX the only other path is 'Open'/'Download' of the raw file, which browsers don't render inline. Confirm with Tanzeela which of these two she meant before scoping the fix — building an actual spreadsheet grid component is a bigger lift than fixing an Open/Download link.
- **Proposed fix:** Short term: clarify 'Sheets Breakdown' is metadata, not a live preview, and make sure Open/Download at least prompts a file save rather than a broken inline render. Longer term (separate ticket, not this alpha-fix pass): add a real spreadsheet grid component for the Document Detail page.

#### BUG-07. Duplicate-document detection did not flag an identical file re-uploaded by a Dept Admin

- **Severity:** Medium
- **Status:** Needs verification
- **Reported in:** T82 (Tanzeela, custom, Fail/High)
- **Root cause:** worker/classify.js `detectDocumentDuplicates()` runs asynchronously, after chunking/embedding completes — not synchronously on upload. It compares `contentHash` (exact match) and embedding cosine similarity against `scope: "repository"` docs in the same org (departmentId isn't filtered, so a department upload IS a valid candidate/target in principle). The most likely explanation is a timing/race condition: the check for the duplicate flag happened before the worker finished processing the second upload. Re-test by uploading, waiting for the document to reach 'ready'/'embedded' status, THEN re-checking for the duplicate banner, before treating this as a logic bug rather than a race condition.
- **Proposed fix:** Re-test with an explicit wait for processing to finish. If it still doesn't flag, check worker logs for that document's `detectDocumentDuplicates` run — likely candidates: `contentHash` computed differently for the two uploads (e.g. includes filename/metadata), or the embedding step hadn't produced chunks yet when the comparison ran.

#### BUG-08. Document uploaded to a department doesn't appear inside that department's Project

- **Severity:** Medium
- **Status:** Needs product decision — likely working as designed, poor discoverability
- **Reported in:** T81 (Tanzeela, custom, Fail/High); T86 (Tanzeela, custom, Fail/High — same root cause as T81)
- **Root cause:** src/app/api/documents/ingest/route.js sets `scope: "repository"` with `departmentId` for department-page uploads, and explicitly does NOT set a `projectId` (only project-page uploads do). A department-scoped document only becomes associated with a specific project via the AI-generated 'suggested project link' shown on the Document Detail page (Confirm/Dismiss — see src/app/api/documents/[id]/project-links/[linkId]/route.js), which the uploader has to notice and act on. Tanzeela almost certainly hadn't confirmed that suggestion, which is why the document shows in Repository/category but not inside the project. This is very likely intended behavior, badly surfaced.
- **Proposed fix:** Product decision needed: either (a) confirm this is intended and improve discoverability — e.g. a visible badge/banner on the department's document card ('Suggested for Project X — confirm to add') instead of requiring a detour to the Document Detail page, or (b) auto-link when the AI's confidence is high enough. Don't 'fix' this as a hard bug until product confirms which.

---

## 3. Task assignment

Assignment is by **file cluster**, not by raw bug count — the goal is that each person's fixes live in files nobody else is touching this round, so branches merge without conflicts. Sandeep gets the Documents/Repository/Ingestion cluster and Simran gets Projects/Topics — a deliberate swap from an earlier pass, giving Sandeep the larger, more varied 5-bug cluster. Effort isn't perfectly even across all three, but the file boundaries are clean:

| Assignee | Cluster | # Bugs | Severity mix |
|---|---|---|---|
| Johurul | Org, Auth, Invites, Billing & Settings | 8 | 2 High, 3 Medium, 3 Low |
| Simran | Projects & Topics permissions | 3 | 1 Critical, 2 High |
| Sandeep | Documents, Repository & Ingestion | 5 | 2 High, 3 Medium |

**Working agreement to keep it conflict-free:**
1. Each person branches off `main`/`dev` and stays inside their cluster's file list (§2, collapsible box per cluster) for this pass — if a fix genuinely needs a file outside your cluster, flag it in standup before touching it.
2. Johurul's cluster touches `settings/page.jsx` three separate times (BUG-09, BUG-12, BUG-13) — do those as separate commits in one branch/PR rather than three interleaved branches, so there's no self-conflict either.
3. Land PRs in any order — there's no cross-cluster dependency between the three lists below.

### Johurul — Org, Auth, Invites, Billing & Settings

- [ ] **BUG-09** (High) — Employee/Guest invites cannot include a department assignment — no one-step way to invite someone directly into a department
- [ ] **BUG-10** (Medium) — Declining an invite does nothing server-side — the invite stays valid and re-offers Accept/Decline on reopen
- [ ] **BUG-11** (Medium) — No way to switch organizations from the "organization is locked" / "no API key" screen
- [ ] **BUG-12** (Medium) — No way for a Super Admin to change an existing member's org-level role (or remove them from the org)
- [ ] **BUG-13** (Low) — Org name change doesn't refresh in the sidebar/header until a full page reload
- [ ] **BUG-14** (High) — SharePoint OAuth connect fails immediately in the test/deployed environment
- [ ] **BUG-15** (Low) — Auth/onboarding polish batch: sign-in error specificity, reset-password page layout, OTP email styling, billing plan-toggle UX
- [ ] **BUG-16** (Low) — Needs Review queue showed nothing for a Manual + "Marketing" filter combination

### Simran — Projects & Topics permissions

- [ ] **BUG-01** (Critical) — Project Chat ("Ask" and "Clear Chat") is strictly owner-only — Super Admin/Dept Admin get "Project not found"
- [ ] **BUG-02** (High) — "Auto-organize" (recluster) is strictly project-owner-only, no admin bypass
- [ ] **BUG-03** (High) — Topic rename/delete has almost no authorization — any org member (even a Guest, even outside the project's department) can rename or delete any topic

### Sandeep — Documents, Repository & Ingestion

- [ ] **BUG-04** (High) — Document owner-only actions (Regenerate Summary, Ask, Clear Chat, Star, Rename, Delete, Unassign, Move-to-topic) render as active for any viewer but silently fail for non-owners
- [ ] **BUG-05** (High) — Repository listing shows org-scope-promoted project documents to users with no department membership — but opening/downloading them 404s
- [ ] **BUG-06** (Medium) — No real in-app spreadsheet viewer for XLSX/CSV — only extracted metadata is shown
- [ ] **BUG-07** (Medium) — Duplicate-document detection did not flag an identical file re-uploaded by a Dept Admin
- [ ] **BUG-08** (Medium) — Document uploaded to a department doesn't appear inside that department's Project

---

## 4. How to track progress

Use the Excel/Google Sheet — for every bug fill in:
- **Dev Status**: Not Started / In Progress / Fixed / Verified
- **PR Link**
- **Notes**: anything that changed the original diagnosis, or a decision made along the way

Once a fix lands, the original QA tester should re-run the exact test case(s) listed in "Reported in" against the fix before marking it Verified.
