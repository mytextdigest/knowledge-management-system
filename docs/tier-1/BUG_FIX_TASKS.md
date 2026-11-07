# Bug Fix Sprint — Task Assignments

Source: `KMS UI Bugs.pdf` (Reported by Tanzeela). This replaces the previous bug list in
this file — that sprint's work is done. See `TASK_SOP.md` for general process (branching,
PR/merge flow, daily sync); ownership zones below supersede the ones listed there.

**Note on numbering:** the source report jumps from T-7 to T-9 — there is no T-8 in the
original PDF. Nothing has been dropped; the list below is complete (T-1 through T-7, T-9
through T-11).

**Note on assignment:** T-11 concerns an unrecognized Super Admin account under Simran's
name. To avoid asking her to audit her own account, that whole group (T-9/T-10/T-11) is
assigned to Johurul instead — confirmed with the team lead.

Grouping below is optimized so **no two engineers edit the same file**. Each bug lists its
root-cause lead (from reading the current code, not just the bug title) so you're not
starting from zero.

---

## Sandeep — Repository Upload & Filtering
Branch: `fix/repository-upload-filters`

Files (yours alone — no other group touches these):
- `src/components/repository/UploadToRepositoryModal.jsx`
- `src/components/repository/RepositoryFilters.jsx`
- `src/app/api/org/[orgId]/repository/route.js`

1. **T-2 — File type restriction.** `UploadToRepositoryModal.jsx` line 132 sets
   `accept=".pdf,.txt,.md,.csv,.xlsx,.xls"` on the file input — `.doc`/`.docx` are missing.
   The backend (`documents/ingest/route.js`) doesn't restrict file types at all, so this is
   a pure frontend fix: extend the `accept` list (and any client-side validation) to match
   what the repository actually supports.

2. **T-3 — Missing DOC option in "All Types" filter.** `RepositoryFilters.jsx`'s file-type
   `<select>` only offers PDF / Spreadsheet / Text. The backend's `FILE_TYPE_EXTS` map in
   `repository/route.js` already buckets `.doc`/`.docx` under `"text"` — so filtering
   technically returns DOC files today, just mislabeled/hidden under "Text". Decide with
   Sandeep's own judgment (or a quick check-in) whether to (a) add a distinct `"doc"` value
   to both the dropdown and `FILE_TYPE_EXTS`, or (b) relabel "Text" to make clear it
   includes DOC files. Touches both files listed above.

3. **T-4 — Category filtering broken for DOC files.** `category` filtering in
   `repository/route.js` (`if (category) andConditions.push({ category })`) applies
   uniformly regardless of file type — there's no code path that special-cases PDFs. Verify
   in the running app first: reproduce with an actual DOC upload before assuming the bug is
   in this file — it may turn out to be a data issue (DOC uploads not getting a `category`
   value stored at ingest time) rather than a query bug. If it's the latter, the fix is in
   `UploadToRepositoryModal.jsx`'s category `<select>`/submit path, not the API.

4. **T-1 is *not* in this group** — see Johurul's list below; the actual bug lives in the
   department page's state handling, not the upload modal.

---

## Simran — Document Viewing, Lifecycle & Dashboard
Branch: `fix/document-viewing-lifecycle`

Files (yours alone):
- `src/components/repository/RepositoryDocumentCard.jsx`
- `src/app/(app)/document/page.jsx`
- `src/app/api/documents/[id]/route.js`
- `src/app/api/documents/[id]/lifecycle/route.js`
- `src/app/(app)/org/[orgId]/dashboard/page.jsx`

5. **T-6 — Client-side exception on "View Details".** Root cause identified:
   `GET /api/documents/[id]/route.js` (line 16-19) scopes the lookup to
   `where: { id, user: { email: session.user.email } }` — **owner only**. Repository/
   department documents are meant to be viewable by any permitted org/department member
   (see how `repository/route.js` does RBAC via `resolveOrgRole` + department membership),
   not just whoever uploaded them. So clicking "View Details" on a document you didn't
   personally upload returns 404 today. Separately, `document/page.jsx` sets `doc` state
   straight from the fetch response in several places (e.g. line 239, line 530) without
   checking for an error shape, then does unguarded `doc.filename.split(".")` (lines 287,
   315, 431, 470, 492, 505, 701) — if `doc` is ever a non-null error object instead of a
   real document, this throws and crashes the page instead of showing an error state. Fix
   both: (a) correct the RBAC in the GET route to match repository access rules, (b) guard
   the frontend against a doc-shaped-wrong response so a future auth/edge case degrades to
   an error message, not a crash.

6. **T-5 — Lifecycle state issue.** The backend already supports this —
   `documents/[id]/lifecycle/route.js` has a full `PATCH` with role-gated transitions
   (draft → published → archived/retired, etc.) — it's just never called from the UI.
   `RepositoryDocumentCard.jsx` shows the lifecycle badge (line 122) but has no control to
   change it. Add a transition UI (dropdown/menu gated by role, calling the existing PATCH
   endpoint) to the card. Also check whether `UploadToRepositoryModal.jsx` should let an
   uploader pick "Draft" instead of always defaulting to Published at creation time — if so,
   flag to Sandeep since that's his file.

7. **T-7 — Dashboard buttons not working.** `dashboard/page.jsx`'s stat tiles (Documents,
   Members, Departments, Recently Created Documents — lines 100-110, 144-172) are static
   `<div>`s with no `onClick`/navigation, unlike the "Recently Created Projects" list right
   next to them which is already a working `<button>` (line 124-138). Wire the missing
   tiles to their equivalent list pages (`/org/[orgId]/repository`, settings members/
   departments tabs, etc.), following the existing button's pattern.

---

## Johurul — Departments & Access Control
Branch: `fix/departments-access-control`

Files (yours alone):
- `src/app/(app)/org/[orgId]/department/[deptId]/page.jsx`
- `src/app/(app)/org/[orgId]/settings/page.jsx`
- `src/app/api/org/[orgId]/department/[deptId]/route.js` (**new file** — doesn't exist yet)
- `src/app/api/org/[orgId]/department/[deptId]/members/route.js`
- `src/lib/orgGuard.js`
- `src/app/api/org/[orgId]/invite/route.js`
- `src/app/api/org/invite/[token]/accept/route.js`
- `src/app/api/org/[orgId]/members/route.js`

8. **T-1 — Upload popup appears unexpectedly (department repository).** Likely root cause:
   `department/[deptId]/page.jsx` keeps `uploadOpen` in component state (line 48), but
   Next.js reuses the same component instance across navigations within the `[deptId]`
   dynamic route. If a user opens the upload modal, then navigates to a *different*
   department via the sidebar without explicitly closing it, `uploadOpen` doesn't reset —
   so the modal reappears on the new department's page. Reproduce this specific flow first;
   if confirmed, reset `uploadOpen` (and other tab-scoped state) in the `[orgId, deptId]`
   effect at line 80.

9. **T-9 — No delete/rename for departments.** There is currently no
   `department/[deptId]/route.js` at all — only `department/route.js` (list/create) and
   `department/[deptId]/members/*`. You'll need to add `PATCH` (rename) and `DELETE`
   handlers, gated to `super_admin` (use `isSuperAdmin`/`isOrgAdmin` from `orgGuard.js`).
   For delete, check what should happen to the department's documents/projects/members
   (reassign to org-wide vs. block deletion if non-empty) — worth a quick product decision
   before writing the migration-adjacent logic. Wire the UI into the "Departments" tab of
   `settings/page.jsx` (~line 608 onward), next to the existing create-department form.

10. **T-10 — Super Admin department access.** `orgGuard.js`'s `resolveOrgRole` only reads
    `OrganizationMember` — super admins are an org-level role and are never automatically
    added as `DepartmentMember` rows. That's why they show as "non-members" in the
    department Members tab (`department/[deptId]/page.jsx` ~line 507-593, and
    `department/[deptId]/members/route.js`'s `GET`, which lists from `DepartmentMember`
    only). This needs a product decision (flagged in the source report itself): either (a)
    treat super_admin as an implicit member everywhere department membership is displayed/
    checked, or (b) leave the DB model as-is but make the UI clearly distinguish "org-level
    access" from "explicit department membership" instead of just omitting them. Don't
    silently pick one — this changes who can see/manage what.

11. **T-11 — Unexpected Super Admin role (Simran's account).** This is an audit task, not a
    code-only fix: trace how the role was granted. Check `AuditLog`/`ChatAuditLog` entries
    (there's recent work in this repo adding audit logging — see `invite/route.js` and
    `invite/[token]/accept/route.js` for how `super_admin` can be assigned, and
    `members/route.js` for any direct role-update path). Confirm whether it came through a
    normal invite flow with `role: "super_admin"`, a direct DB change, or a privilege-
    escalation bug in one of those routes. Report findings before deciding on a fix —
    the fix might be closing a real escalation path, or it might just be tightening the
    invite UI/audit trail.

---

## Process

- Branch off `dev`. One branch per person, as listed above.
- This split has **zero shared files** between the three groups — no need to coordinate
  merge order within this phase. If a fix turns out to need a file outside your list (e.g.
  T-6's RBAC fix leading you into `repository/route.js`), ping the file's owner first.
- Small, frequent PRs per issue rather than one big PR at the end. Tag Johurul as reviewer
  (Johurul's own PRs go to Sandeep or Simran for review instead).
- Several of these bugs (T-3, T-4, T-9, T-10) have an open product question noted above —
  resolve that with the team before writing the fix, not after.
- Manually verify each fix in the running app (golden path + at least one edge case) before
  opening a PR — several of these bugs (T-1, T-6) are state/timing-dependent and won't show
  up from a code read alone.


