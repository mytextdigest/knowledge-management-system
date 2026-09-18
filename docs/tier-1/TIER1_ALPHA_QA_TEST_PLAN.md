# Tier 1 Alpha Test Plan — End-to-End UI Testing

**Status:** Ready for alpha testing
**Created:** 2026-08-10 (updated 2026-08-10)
**Scope:** Full click-through of every Tier 1 feature via the UI only (no API/DB testing) — functional correctness *and* Role-Based Access Control (RBAC).
**Companion file:** `TIER1_ALPHA_QA_TEST_PLAN.xlsx` — same 82 test cases in a spreadsheet, ready to upload to Google Sheets for live status/bug tracking. Each tester also has their own tab in the spreadsheet.

---

## 1. Who's testing what

Testing is split 4 ways. **Tanzeela is the designated QA lead and takes the Super Admin persona** — she creates the org and owns every admin-only surface (billing, SharePoint integration, org settings, Needs Review, audit log, dashboard). Johurul already exercised those areas directly while building them, so a fresh set of eyes is more likely to catch real issues; he instead tests as **Guest**, plus general auth/onboarding flows and cross-role permission-boundary probes. Sandeep and Simran cover Department Admin and Employee day-to-day flows respectively, plus role-specific bug-hunt cases.

| Tester | Primary Role/Persona | # Tests Assigned |
|---|---|---|
| Tanzeela | Super Admin (org owner, QA lead) | 30 |
| Sandeep | Department Admin | 19 |
| Simran | Employee | 19 |
| Johurul | Guest + Auth/Onboarding + Cross-role boundary checks | 14 |

**Total test cases: 82** across 15 feature areas, including 7 dedicated "bug-hunt" cases targeting known-risky permission behavior found during code review (see §3).

Some tests are marked **"Pair with"** another tester — these need two people (e.g. one person sends an invite, the other accepts it; one person is the document owner, another is a non-owner admin probing access). Coordinate timing with your pair before starting that test.

---

## 2. One-time environment setup (do this first, in order)

1. Tanzeela creates the organization during onboarding, which automatically makes them Super Admin.
2. Tanzeela invites Sandeep as Department Admin (dept_admin) — grant admin on at least ONE department, leave a SECOND department without granting them admin, to test the negative case.
3. Tanzeela invites Simran as Employee (employee) — add them as a member of at least one department.
4. Tanzeela invites Johurul as Guest (guest).
5. Create at least 2 departments and 2 projects per department before testing begins, so there is real content to browse (not just empty states).
6. Upload at least one document of each type (PDF, DOCX, XLSX/CSV, TXT) so rendering/preview tests are meaningful.
7. Each tester should also personally upload 1-2 documents under their own account — several tests specifically check owner-only vs non-owner behavior.

Org roles you'll be testing with: **Super Admin**, **Department Admin** (`dept_admin`), **Employee**, **Guest** — assigned at the organization level via invites. Departments additionally have their own Member/Admin sub-roles (independent of your org-level role) — you'll encounter these inside each department's Members tab.

---

## 3. Why the "bug-hunt" tests exist

While mapping out the app for this test plan, a few permission patterns stood out as worth deliberately verifying rather than assuming:

- **Document-level actions** (Regenerate Summary, Ask AI, Clear Chat, Star, Rename, Delete, Unassign, Move-to-topic) appear as active, clickable buttons for *anyone who can view* a document (Super Admin, Dept Admin, other department members) — but in the code they're actually gated to the document's **owner only**. That means a Super Admin might click "Delete" on a colleague's document and have it silently do nothing, with no error shown. The bug-hunt tests in §F ask you to click these as a non-owner and simply report what actually happens.
- **Project Chat "Clear Chat"** and **"Auto-organize" (recluster)** are similarly owner-only, but the Clear Chat button is shown to Super Admin/Dept Admin based on a *different* permission check — so it may appear clickable but not work for them.
- **Topic rename/delete** may only require being logged in as *some* org member, not specifically a member of that project's department — worth confirming.
- **Project creation/edit/delete** from the Projects list page shows no visible role restriction in the UI at all — worth confirming the server actually restricts it.

None of this means these are confirmed bugs — it means they're exactly the kind of thing alpha testing should settle with real clicks. Please report the **actual observed behavior** for every bug-hunt test, even if it "seems fine."

---

## 4. How to report results

Use the Excel/Google Sheet — for every test case fill in:
- **Status**: Pass / Fail / Blocked
- **Bug Description / Notes**: what you did, what you expected, what actually happened (screenshots welcome, link them in the notes)
- **Severity**: Low / Medium / High / Critical (only if Status = Fail)
- **Date Tested**

If a test can't be run because a prior step blocked you, mark it **Blocked** and note which test it's blocked on rather than skipping it silently.

---

## 5. Test Cases

### A. Authentication & Account

#### T1. Sign up with a new email

- **Assigned to:** Johurul
- **Role/Persona:** New user
- **Preconditions:** Use an email not already registered.
- **Steps:**
  1. Go to the Sign Up page.
  2. Enter email + password, and try submitting WITHOUT checking the Terms & Conditions box (should be blocked).
  3. Check the Terms & Conditions box and submit.
- **Expected Result:** Blocked with a clear message when T&Cs unchecked. On valid submit, you're routed to the Verify OTP screen.

#### T2. Verify OTP + resend cooldown

- **Assigned to:** Johurul
- **Role/Persona:** New user
- **Preconditions:** Just completed sign up.
- **Steps:**
  1. On the Verify OTP screen, enter an incorrect 6-digit code and submit.
  2. Click 'Resend OTP' and confirm it goes into a ~30s cooldown (disabled/counting down).
  3. Check email/inbox for the real code, enter it, submit.
- **Expected Result:** Wrong code shows an inline error. Resend is rate-limited. Correct code verifies the account and routes to Sign In.

#### T3. Sign in (valid + invalid credentials)

- **Assigned to:** Johurul
- **Role/Persona:** Any registered user
- **Preconditions:** Account already verified.
- **Steps:**
  1. Try signing in with a wrong password — confirm an inline error appears, not a crash.
  2. Sign in with correct credentials.
- **Expected Result:** Wrong password is rejected gracefully. Correct login lands on Welcome Back / org home.

#### T4. Forgot password → reset password flow

- **Assigned to:** Johurul
- **Role/Persona:** Any registered user
- **Steps:**
  1. From Sign In, click 'Forgot password?' and submit your email.
  2. Note the message is generic either way (doesn't reveal whether the email exists).
  3. On the Reset Password screen, enter the OTP from email + a new password + confirm password (try mismatched confirm first to check validation).
  4. Submit with matching passwords.
- **Expected Result:** Generic 'if this email exists...' message shown. Mismatched confirm is blocked client-side. Valid reset redirects to Sign In, and you can log in with the new password.

#### T5. Change password while logged in + sign out

- **Assigned to:** Johurul
- **Role/Persona:** Any logged-in user
- **Steps:**
  1. Go to Settings → Change Password.
  2. Change your password (enter current + new).
  3. Sign out.
  4. Sign back in with the NEW password to confirm it actually took effect.
- **Expected Result:** Password change succeeds and old password no longer works; new password does. Sign out clears the session and returns you to Sign In.

### B. Org Onboarding (Super Admin)

#### T6. Create a new organization

- **Assigned to:** Tanzeela
- **Role/Persona:** New user (becomes Super Admin)
- **Preconditions:** Fresh account with no org membership yet.
- **Steps:**
  1. Sign up / sign in with a brand-new account.
  2. You should land on the 'Create organization' onboarding screen — enter an org name and submit.
- **Expected Result:** Organization is created and you're taken straight into the Billing step of onboarding. Your role in this org is Super Admin.

#### T7. Onboarding — subscribe to a plan

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin, onboarding
- **Preconditions:** Just created the org.
- **Steps:**
  1. On the Billing onboarding step, toggle Monthly/Yearly and review plan cards.
  2. Subscribe to a plan.
- **Expected Result:** Redirects to Stripe Checkout; after completing payment you land back in the app on the API Key onboarding step.

#### T8. Onboarding — OpenAI API key setup

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin, onboarding
- **Preconditions:** Subscription active.
- **Steps:**
  1. Enter an obviously invalid key and click 'Verify Key' — confirm it's rejected with an error.
  2. Enter a real, valid OpenAI key and click 'Verify Key'.
  3. Once verified, click 'Save & Continue'.
- **Expected Result:** Invalid key is rejected with a clear message and 'Save & Continue' stays hidden until verified. Valid key saves and advances to the Celebrate screen.

#### T9. Celebrate screen is one-time only

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Just finished the API key step.
- **Steps:**
  1. Confirm the celebration/completion screen appears and click 'Go to home page'.
  2. Manually navigate back to the onboarding celebrate URL for the same org.
- **Expected Result:** First visit shows the celebration and marks onboarding complete. Revisiting the URL afterward redirects straight to the org home instead of re-showing it.

#### T10. Welcome Back screen / org switching

- **Assigned to:** Tanzeela
- **Role/Persona:** User in one or more orgs
- **Preconditions:** Belongs to at least one org.
- **Steps:**
  1. Sign in and observe the 'Welcome Back' screen.
  2. If you belong to more than one org, switch between them.
- **Expected Result:** Welcome Back lists your org(s) and lets you enter one; the app remembers your last-active org on next login.

### C. Org Settings

#### T11. Rename the organization

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Go to Settings → General tab.
  2. Change the organization name and Save.
- **Expected Result:** Name updates and is reflected across the app (sidebar/header).

#### T12. Invite members with each role (dept_admin / employee / guest) `SETUP`

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Settings → Members tab → Invite Member.
  2. Choose role 'Department Admin' — confirm you CANNOT submit until you also pick at least one department.
  3. Send invites for one dept_admin, one employee, and one guest (use real test emails for your 3 teammates).
- **Expected Result:** Role dropdown only offers Department Admin / Employee / Guest (not Super Admin). Dept-admin invite is blocked until a department is chosen. Invited users receive an invite link/email.

#### T13. Reassign a Department Admin's departments

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** At least one dept_admin exists (e.g. Sandeep) and 2+ departments exist.
- **Steps:**
  1. Settings → Members tab, find the dept_admin row, click 'Manage departments'.
  2. Toggle which departments they administer, Save.
- **Expected Result:** Checklist reflects current department assignments and saving updates them (verify by having that dept_admin test access to the added/removed department).

#### T14. Department CRUD from Settings

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Settings → Departments tab → create a new department.
  2. Rename it using the pencil icon.
  3. Delete it using the trash icon — if a confirmation about existing content appears, confirm twice as prompted.
- **Expected Result:** Create/rename/delete all work only for Super Admin (pencil/trash icons should not appear for dept_admin or employee viewing the same tab). Delete asks for confirmation, especially if the department has documents/projects.

#### T15. OpenAI API key management

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Settings → API Key tab.
  2. Replace the existing key with a new valid one, Save.
  3. Clear the field and Save to remove the key entirely.
- **Expected Result:** Key can be set, replaced, and removed. 'Configured' badge reflects current state. (Cross-check: after removing the key, org-level AI Chat should show the 'no API key configured' message — see Test on org chat.)

#### T16. Integrations tab overview

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Settings → Integrations tab.
- **Expected Result:** Shows SharePoint (and any other connectors) with connection status, site count, and last sync date; 'Manage' navigates to the connector's own page.

### D. Department Management

#### T17. Open a department and confirm its 4 tabs

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin (admin of this department)
- **Steps:**
  1. Open a department you administer.
  2. Confirm Documents / Projects / Members / Timeline tabs all load.
- **Expected Result:** All 4 tabs render without errors.

#### T18. Upload documents scoped to a department

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Documents tab → Upload Document.
  2. Drag-and-drop (or browse) 2-3 files of mixed types (.pdf/.docx/.xlsx/.csv/.txt), try exceeding 10 files or an unsupported type to confirm it's rejected.
  3. Pick a required Document Type category, submit.
- **Expected Result:** Only accepted file types/count are allowed; clear error otherwise. Upload succeeds and documents appear (possibly first in Needs Review, depending on classification).

#### T19. Filter documents in the department view

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Preconditions:** Department has several documents with different categories/types/lifecycle states.
- **Steps:**
  1. Apply Category, File Type, Lifecycle, and Date-range filters one at a time and in combination.
- **Expected Result:** Each filter narrows results correctly; clearing filters restores the full list.

#### T20. Lifecycle transitions — allowed vs. blocked for Dept Admin

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Preconditions:** Have one document you administer, and (if possible) one document in a department you do NOT administer.
- **Steps:**
  1. On a document in a department you ADMINISTER: change draft → published, then published → archived. Confirm both succeed.
  2. Try published → retired or archived → anything: confirm the option is not offered / is rejected (Super Admin only).
  3. If you have access to a document in a department you do NOT administer, try any lifecycle change there too.
- **Expected Result:** Dept Admin can publish and archive only within departments they administer; retiring/un-archiving/reverting to draft is Super-Admin-only; attempting a transition in a department you don't administer is rejected.

#### T21. Classification, duplicate, and lifecycle-suggestion banners

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Preconditions:** A document flagged 'needs review' with a suggested category/department, and/or a possible-duplicate flag.
- **Steps:**
  1. Open the classification review panel on a flagged document, adjust the suggested category/department, accept it.
  2. On a document with a duplicate-signal banner, click Confirm, then on another try Dismiss.
  3. On a document with a lifecycle-suggestion banner, dismiss it.
- **Expected Result:** Accepting classification updates the doc's category/department. Confirming a duplicate flag marks it; dismissing clears the banner. Lifecycle-suggestion banner dismiss removes it without changing lifecycle.

#### T22. Project CRUD within a department

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Projects tab → New Project (name + description).
  2. Hover a project card → Edit (pencil) → change name/description, Save.
  3. Hover → Delete (trash) → confirm.
- **Expected Result:** Create/edit/delete all succeed for the department's admin.

#### T23. Department member management + bulk add-members modal

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Members tab → Add member by email with role Member or Admin.
  2. Remove a member (trash/X icon), confirm the prompt.
  3. Create a brand-new department as Super Admin (or watch Tanzeela do it) and confirm the 'Add Members' bulk modal auto-opens right after creation, letting you multi-select org members with per-row role.
- **Expected Result:** Add/remove work and reflect immediately in the list. New-department bulk-add modal appears automatically once, with working multi-select + per-row role.

#### T24. Department Timeline tab

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Preconditions:** Department has some documents with extracted decisions.
- **Steps:**
  1. Open the Timeline tab.
- **Expected Result:** Read-only, dated list of decision events with rationale and a link back to the source document.

### E. Central Repository

#### T25. Browse and filter the repository

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. Open Repository. Apply Department, Category, File Type, Lifecycle, and Date filters, individually and combined.
  2. Try pagination (Previous/Next).
- **Expected Result:** Filters and pagination work; result count updates correctly; empty-filter combos show a clean empty state.

#### T26. Upload + Open/Preview/Download from Repository

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. Upload Document from the Repository page (choose a department, or 'Org-wide document').
  2. On an existing PDF, use Preview (should open inline) and Download.
  3. On any document, use 'Open' (new tab) and 'View Details' (goes to the document page).
- **Expected Result:** Upload succeeds; preview/download/open/view-details all work for accessible documents.

#### T27. Guest role — read-only repository access

- **Assigned to:** Johurul
- **Role/Persona:** Guest
- **Steps:**
  1. Open Repository as a Guest.
  2. Confirm there is NO 'Upload Document' button.
  3. Confirm you can still browse/open/download documents you have access to.
- **Expected Result:** Guest cannot upload but retains read access to documents shared with them.

#### T28. Employee cannot change document lifecycle

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. On any repository document card, look for a 'Change status…' lifecycle control.
- **Expected Result:** No lifecycle-change control is available to a plain employee (dept_admin/super_admin only).

### F. Document Detail Page

#### T29. Preview rendering across file types

- **Assigned to:** Simran
- **Role/Persona:** Employee (owner or with access)
- **Preconditions:** Have access to at least one PDF, DOCX, XLSX/CSV, and TXT document.
- **Steps:**
  1. Open each file type's document page and confirm the preview renders (PDF viewer w/ pages, DOCX text, spreadsheet with sheet/column breakdown, plain text).
- **Expected Result:** Each format renders without errors or a broken viewer.

#### T30. Chat with a document you own

- **Assigned to:** Simran
- **Role/Persona:** Employee (document owner)
- **Preconditions:** Own at least one uploaded document.
- **Steps:**
  1. Open the Chat tab, ask a question about the document's content.
  2. While it's answering, click the cancel/stop icon.
  3. Ask again, let it finish, then use Copy / Print / Expand on the message.
  4. Use the trash icon to Clear Chat, confirm the dialog.
- **Expected Result:** Answer is relevant and (where applicable) cites sources. Cancel stops the in-flight response. Copy/print/expand controls work. Clear Chat empties the conversation after confirming.

#### T31. Summary tab — generate, regenerate, copy, print

- **Assigned to:** Simran
- **Role/Persona:** Employee (document owner)
- **Steps:**
  1. Open Summary tab on an owned document.
  2. Click Regenerate Summary (or Generate if none exists), wait for completion.
  3. Copy the summary text and Print it.
- **Expected Result:** Summary (re)generates successfully, button disables while processing, copy/print both work.

#### T32. Pagewise Summary reading guide

- **Assigned to:** Simran
- **Role/Persona:** Employee (document owner)
- **Preconditions:** A multi-page document.
- **Steps:**
  1. Open the Pagewise Summary tab and page/scroll through the document.
  2. Expand/collapse a couple of page cards.
- **Expected Result:** Key points and reflection questions generate per page as you progress; progress indicator advances; expand/collapse works.

#### T33. Fullscreen viewer with zoom

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. Click Fullscreen on a PDF/TXT/DOCX document.
  2. Zoom in, zoom out, and reset.
- **Expected Result:** Fullscreen modal opens correctly and zoom controls behave as expected.

#### T34. Star a document and filter by it

- **Assigned to:** Simran
- **Role/Persona:** Employee (document owner)
- **Steps:**
  1. Star one of your own documents.
  2. Go to its Project page (or wherever a Starred filter exists) and confirm it's included.
- **Expected Result:** Starring persists and the Starred filter correctly includes it.

#### T35. Rename and delete your own document

- **Assigned to:** Simran
- **Role/Persona:** Employee (document owner)
- **Preconditions:** Use a disposable test upload, not a document others depend on.
- **Steps:**
  1. Rename the document.
  2. Delete it and confirm the confirmation dialog appears before it's removed.
- **Expected Result:** Rename updates the filename everywhere it's shown. Delete requires confirmation and actually removes it.

#### T36. Suggested project link — confirm/dismiss

- **Assigned to:** Simran
- **Role/Persona:** Employee (document owner or admin)
- **Preconditions:** A document with a suggested project link.
- **Steps:**
  1. Click Confirm on a suggested project link.
  2. On another, click Dismiss.
- **Expected Result:** Confirm attaches the document to that project; Dismiss removes the suggestion without linking.

#### T37. [Bug-hunt] Admin viewing a colleague's document — do owner-only actions actually work? `BUG-HUNT`

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin, viewing a document owned by someone else
- **Preconditions:** Open a document uploaded by Sandeep or Simran (not you), while logged in as Super Admin.
- **Steps:**
  1. Try: Regenerate Summary, Ask a question in Chat, Clear Chat, Star, Rename, Delete.
  2. For each, note whether it visibly works, silently does nothing, or shows an error.
- **Expected Result:** Record actual behavior for each action — the buttons appear enabled/active regardless of ownership, so this is specifically checking whether that's misleading. Report anything that looks 'broken' (button clickable but nothing happens, no error shown) as a bug.

#### T38. [Bug-hunt] Dept Admin viewing a colleague's document in their own department `BUG-HUNT`

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin, viewing a document owned by someone else in a department they administer
- **Preconditions:** Open a teammate's document in a department you administer.
- **Steps:**
  1. Try the same set of actions: Regenerate Summary, Ask, Clear Chat, Star, Rename, Delete.
  2. Note pass/fail/silent-fail for each.
- **Expected Result:** Same as above — document and report actual behavior, especially anything that looks clickable but does nothing.

### G. Projects & Topics

#### T39. Project CRUD from the Projects list

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Projects page → search/filter by name.
  2. Create a new project (choose department).
  3. Edit an existing project's name/description.
  4. Delete a project you created, confirm the dialog.
- **Expected Result:** Search filters client-side instantly; create/edit/delete all succeed.

#### T40. [Bug-hunt] Can an Employee or Guest create/edit/delete a project via the Projects list? `BUG-HUNT`

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Preconditions:** The Projects list page shows New Project / Edit / Delete controls to everyone who can reach it, with no visible role restriction in the UI.
- **Steps:**
  1. As Employee, try creating a new project.
  2. Try editing and deleting a project you do NOT own (created by someone else).
- **Expected Result:** Note whether this succeeds or is blocked. This is specifically testing whether the lack of a visible restriction means there's also no restriction on the server — report actual outcome either way.

#### T41. Upload documents into a project

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Open a project → Upload.
  2. Upload a file, set category and Private/Public visibility.
  3. Re-upload a file with the exact same name to confirm duplicate-filename detection.
- **Expected Result:** Upload succeeds with required fields; re-uploading the same filename surfaces a clear duplicate-filename error inline.

#### T42. Topic clustering view

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Preconditions:** A project with several documents, some auto-clustered into topics.
- **Steps:**
  1. Open a project and review the Topic groups plus the always-present 'Unassigned' group.
  2. Toggle grid/list view and try the search box and Starred/Unselected filter chips.
- **Expected Result:** Documents are grouped sensibly by topic; view toggle, search, and filter chips all work.

#### T43. Drag-and-drop a document between topics

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin (or document owner)
- **Steps:**
  1. Drag a document row by its grip handle onto a different Topic header.
  2. Drag a document onto 'Unassigned' to unassign it.
- **Expected Result:** Document moves to the target topic (or becomes unassigned) and the UI updates without a full reload.

#### T44. Rename and delete a topic

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Click the pencil icon on a topic header, rename it inline.
  2. Click the trash icon on a topic header, confirm the browser confirm dialog.
- **Expected Result:** Rename and delete both succeed.

#### T45. [Bug-hunt] Can any org member rename/delete a topic in someone else's project? `BUG-HUNT`

- **Assigned to:** Simran
- **Role/Persona:** Employee, not part of the project's department
- **Preconditions:** Find a project in a department you are NOT a member of.
- **Steps:**
  1. Try renaming a topic in that project.
  2. Try deleting a topic in that project.
- **Expected Result:** Note whether this is blocked or allowed — topic rename/delete may only require being *some* org member rather than being scoped to that project/department. Report the actual outcome.

#### T46. Auto-organize / Recluster — as project owner vs. non-owner admin `BUG-HUNT`

- **Assigned to:** Sandeep (pair with Tanzeela)
- **Role/Persona:** Dept Admin
- **Preconditions:** A project you personally created/own, with unassigned documents.
- **Steps:**
  1. As the project owner, click 'Auto-organize' (Sparkles icon) on the Unassigned group and confirm it clusters documents into topics.
  2. Now have Tanzeela (Super Admin, NOT the project owner) open the same project and try 'Auto-organize' too.
- **Expected Result:** Works for the owner. For Tanzeela: note whether it works, fails silently, or shows an error — recluster may be restricted to the literal project owner even for Super Admin.

#### T47. Project Chat — ask AI, restricted to selected documents

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin (project owner)
- **Steps:**
  1. Select/deselect a couple of documents in the project (FileText/'Select' button).
  2. Ask the Project Chat a question that only an unselected document could answer — confirm it's not used as a source.
  3. Ask a question a selected document can answer.
- **Expected Result:** Only selected documents are used as chat context; the assistant should decline or ignore unselected-document content.

#### T48. [Bug-hunt] 'Clear Chat' button shown to non-owner admin — does it work? `BUG-HUNT`

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin, viewing a project owned by someone else
- **Preconditions:** Open a project owned by Sandeep or Simran, where the 'Clear Chat' trash icon is visible to you (Super Admin/Dept Admin have this visible via a 'canManage' permission).
- **Steps:**
  1. Click Clear Chat and confirm.
  2. Note the actual result.
- **Expected Result:** Note whether it succeeds or fails — project chat clearing may be restricted to the literal owner server-side even though the button is shown to admins. Report the actual outcome (this specifically checks for a button that's visible but non-functional).

#### T49. Project Timeline

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Open the 'Timeline (N)' accordion in a project with tracked decisions.
- **Expected Result:** Shows dated decision events with rationale and links back to source documents.

### H. Org AI Assistant

#### T50. Ask a question and watch it stream

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Preconditions:** Org has a valid OpenAI key configured.
- **Steps:**
  1. Start a New Conversation in org Chat.
  2. Ask a question you know the answer to (based on uploaded docs).
  3. Watch the answer stream token-by-token and check the confidence badge (high/med/low).
- **Expected Result:** Answer streams in smoothly with a 'Thinking…' state, then shows a confidence badge.

#### T51. Citations — document and decision sources

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. Ask a question that should cite a document.
  2. Click a source/citation chip — confirm the modal shows filename/department/project and an 'Open Source Document' link.
  3. If a 'Decision' (purple) citation appears, click it and confirm it shows the statement + rationale.
- **Expected Result:** Both citation types open correctly-formatted modals; opening the source document works in a new tab.

#### T52. Rate an answer (thumbs up/down)

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. On a completed AI answer, click thumbs-up.
  2. Click it again to un-rate.
  3. Click thumbs-down on another answer.
- **Expected Result:** Rating toggles correctly and persists on reload.

#### T53. Conversation management — rename & delete

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. Rename a conversation via the pencil icon (inline edit).
  2. Delete a conversation via the trash icon.
- **Expected Result:** Rename saves inline; delete removes it from the sidebar list immediately.

#### T54. Suggested experts panel

- **Assigned to:** Simran
- **Role/Persona:** Employee
- **Steps:**
  1. Type a question (2+ characters) and watch for a 'suggested experts' / people-to-ask panel.
- **Expected Result:** Panel populates with relevant people based on the question topic.

#### T55. Conversation privacy across users

- **Assigned to:** Johurul (pair with Simran)
- **Role/Persona:** Two different users (pair with Simran)
- **Preconditions:** Simran has at least one org-chat conversation.
- **Steps:**
  1. As Johurul (a different user), open org Chat and confirm you do NOT see Simran's conversations in your sidebar, and cannot load/rename/delete them directly.
- **Expected Result:** Each user only ever sees, renames, deletes, and rates their own conversations.

#### T56. No-API-key friendly error message

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Temporarily remove the org's OpenAI key (Settings → API Key → clear & save).
- **Steps:**
  1. With no key configured, ask a question in org Chat.
  2. Afterwards, re-add a valid key so other testers aren't blocked.
- **Expected Result:** Shows a friendly message like 'This organization has no OpenAI API key configured. Ask a super admin to set one in Settings.' instead of a generic error/crash.

### I. Needs Review Queue

#### T57. Non-super-admin cannot access Needs Review

- **Assigned to:** Johurul
- **Role/Persona:** Guest or Employee
- **Steps:**
  1. Navigate directly to the Needs Review URL for the org.
- **Expected Result:** Redirected away to the Repository page (not a blank/error page).

#### T58. Filter the review queue

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Some documents pending review (manual + SharePoint-sourced if available).
- **Steps:**
  1. Filter by Source (Manual/SharePoint) and by Department, individually and combined.
- **Expected Result:** Filters narrow the queue correctly.

#### T59. Accept a suggested document as-is

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. On a queued document, click Accept.
- **Expected Result:** Document is confirmed/published with its suggested classification and disappears from the queue.

#### T60. Reassign a document to a different department / new project

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Click Reassign on a queued document.
  2. Pick a different department.
  3. Check 'Assign to a new project under this department', name it, submit.
- **Expected Result:** Reassign-only works; reassign-with-new-project creates the project and links the document.

#### T61. Resolve a duplicate flag from the queue

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** A queued document flagged as a possible duplicate.
- **Steps:**
  1. Click Confirm on the duplicate banner for one document.
  2. Click Dismiss on another.
- **Expected Result:** Confirm/Dismiss both clear the duplicate banner appropriately.

### J. SharePoint Integration

#### T62. Non-super-admin cannot access the SharePoint integration page

- **Assigned to:** Johurul
- **Role/Persona:** Guest
- **Steps:**
  1. Navigate directly to the SharePoint integration URL for the org.
- **Expected Result:** Redirected to Settings (not a blank/error page).

#### T63. Connect SharePoint via OAuth

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Use the existing test tenant set up for SharePoint testing (mock org 'NGI', nextgenerationinnovation.onmicrosoft.com) rather than a real customer tenant.
- **Steps:**
  1. Settings → Integrations → SharePoint → Connect SharePoint.
  2. Complete the Microsoft OAuth consent flow with the test tenant credentials.
- **Expected Result:** OAuth completes and redirects back into the app's site-picker step. If it fails, the page shows a specific connectError banner, not a silent failure.

#### T64. Site picker — map sites to departments

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Just completed OAuth connect.
- **Steps:**
  1. On the site picker, map at least one SharePoint site to a department.
  2. Try clicking Confirm with nothing mapped — should be blocked.
  3. Map correctly and Confirm.
- **Expected Result:** Confirm is disabled/blocked until at least one site→department mapping is chosen; valid confirm proceeds to the connected state.

#### T65. Manual sync + sync history

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** SharePoint connected with at least one site mapped.
- **Steps:**
  1. Click 'Sync Now'.
  2. Watch Sync History for a new run entry, and confirm it eventually shows completed/failed with a files-found count.
- **Expected Result:** Sync run appears with correct status and counts; failures show a useful error message rather than nothing.

#### T66. Synced documents land in Needs Review

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** A completed sync run with files found.
- **Steps:**
  1. Go to Needs Review, filter Source = SharePoint.
  2. Confirm the newly synced files appear there for classification.
- **Expected Result:** Synced files show up correctly tagged as SharePoint-sourced and can be Accepted/Reassigned like manual uploads.

#### T67. Disconnect SharePoint

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Click Disconnect, confirm the dialog.
- **Expected Result:** Integration returns to a disconnected state; a reconnect flow is still available afterward.

### K. Billing & Subscription

#### T68. Non-super-admin is blocked from Billing

- **Assigned to:** Johurul
- **Role/Persona:** Dept Admin, Employee, or Guest
- **Steps:**
  1. Navigate directly to the Billing page URL.
- **Expected Result:** Shows 'Only the org's super admin can manage billing' with a way back to the Dashboard — not a crash.

#### T69. View current plan and usage / tier comparison

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Open Billing.
  2. Review current plan, usage (storage), and other plan cards.
  3. Confirm plans at or below your current tier show a disabled 'Not Available' / 'Current Plan' state rather than an active Upgrade button.
- **Expected Result:** Current plan and usage are shown accurately; downgrade/same-tier options are correctly disabled.

#### T70. Upgrade plan via Stripe

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Click Upgrade on a higher tier plan.
- **Expected Result:** Redirects to Stripe Checkout/portal to complete the upgrade.

#### T71. Manage billing & payment via Stripe portal

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Click 'Manage billing & payment'.
- **Expected Result:** Redirects to the Stripe customer portal for payment method / invoice management.

### L. Dashboard & Knowledge Health

#### T72. Employee/Guest cannot reach the Dashboard

- **Assigned to:** Johurul
- **Role/Persona:** Employee or Guest
- **Steps:**
  1. Navigate directly to the Dashboard URL for the org.
- **Expected Result:** Redirected to the org home page — Dashboard is Super Admin/Dept Admin only.

#### T73. Stat tiles + API-key nudge banner

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Steps:**
  1. Open Dashboard, click each stat tile (Documents/Members/Departments/Projects) and confirm it deep-links to the right page.
  2. With no API key configured, confirm the 'Set up API key' banner appears; with a key configured, confirm it's gone.
- **Expected Result:** All 4 tiles navigate correctly; the API-key banner only shows for Super Admin with no key configured.

#### T74. Knowledge Health section

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin or Dept Admin
- **Preconditions:** Enough Q&A/document activity to populate health data.
- **Steps:**
  1. Review the Answer Confidence tile (avg % + high/med/low distribution).
  2. Click the Open Conflicts tile — review the modal listing conflicting document pairs, and click through to a document.
  3. Review the Top Knowledge Gaps tile.
- **Expected Result:** All three sub-sections render real data (or a sensible empty state) without errors; the conflicts modal links work.

#### T75. Recently Created Projects & Documents feeds

- **Assigned to:** Sandeep
- **Role/Persona:** Dept Admin
- **Steps:**
  1. Review the 'Recently Created Projects' and 'Recently Created Documents' lists.
  2. Click into a couple of items.
- **Expected Result:** Lists show the most recent items (max 5 each) and clicking navigates to the right project/document.

### M. Audit Log & Security

#### T76. Org chat audit log — filter + pagination

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Some chat activity has occurred, including at least one denied/unauthorized attempt if possible.
- **Steps:**
  1. Settings → Audit Log tab.
  2. Filter by outcome: All / Answered / Denied.
  3. Paginate with Previous/Next.
- **Expected Result:** Log entries show question, user, timestamp, and cited docs; filters and pagination work correctly.

#### T77. Security events feed

- **Assigned to:** Tanzeela
- **Role/Persona:** Super Admin
- **Preconditions:** Some role grants and department create/rename/delete events have occurred (from earlier tests).
- **Steps:**
  1. Review the Security Events sub-section of the Audit Log tab.
- **Expected Result:** Shows a read-only feed of role grants and department lifecycle events (create/rename/delete) matching what actually happened during testing.

### N. Invite Acceptance

#### T78. Accept an invite while signed out

- **Assigned to:** Sandeep
- **Role/Persona:** Newly invited user, not yet signed in
- **Preconditions:** Tanzeela has sent you an invite email/link (see Setup).
- **Steps:**
  1. Open the invite link in a private/incognito window (not signed in).
  2. Confirm you're prompted to sign in, and that after signing in you land back on the invite page automatically.
- **Expected Result:** Unauthenticated visitors see 'You need to sign in to accept this invitation' with a working sign-in redirect back to the invite.

#### T79. Accept an invite while signed in — role/departments applied correctly

- **Assigned to:** Simran
- **Role/Persona:** Newly invited user, signed in
- **Steps:**
  1. Open your invite link while already signed in.
  2. Confirm the displayed role/department(s) match what Tanzeela actually invited you as.
  3. Click Accept.
- **Expected Result:** Displayed role/department(s) are accurate; after accepting you land in the org with exactly that role and department access — verify by checking what you can/can't see.

#### T80. Decline invite, and expired/invalid token handling

- **Assigned to:** Johurul
- **Role/Persona:** Newly invited user
- **Preconditions:** Ask Tanzeela for a spare invite to decline, and reuse an already-accepted or manually expired invite link for the second part.
- **Steps:**
  1. Open an invite and click Decline — confirm no org membership is created (you're routed to Welcome Back).
  2. Open an already-used or expired invite link.
  3. Confirm you get an 'Invite Unavailable' message, not a crash.
- **Expected Result:** Decline creates no membership. Invalid/expired tokens show a clear 'Invite Unavailable' state with a way back to your orgs.

### O. Permission Boundary Sweep

#### T81. Direct-URL access sweep for admin-only pages `BUG-HUNT`

- **Assigned to:** Johurul
- **Role/Persona:** Guest (repeat as Employee if time allows)
- **Steps:**
  1. While signed in as Guest, try navigating directly (typing the URL) to: Dashboard, Settings, Needs Review, Billing, SharePoint Integration.
  2. Note for each: blocked with redirect, or actually loads content it shouldn't.
- **Expected Result:** Every admin-only page should redirect a Guest away cleanly. Report any URL that actually renders admin content for a Guest — that's a real bug, not just a UI nuisance.

#### T82. Guest cannot invite others or see admin controls

- **Assigned to:** Johurul
- **Role/Persona:** Guest
- **Steps:**
  1. As Guest, open whatever Settings/Members view is reachable.
  2. Confirm there's no 'Invite Member' button and no way to change anyone's role.
- **Expected Result:** Guest has view-only access with no path to invite or manage members.

