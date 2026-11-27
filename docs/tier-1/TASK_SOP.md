# Team Task SOP — Bug Fix Sprint

## Phases
- **Phase 1 — Core functional bugs.** Ship and merge first. These are broken features (uploads, chat, OCR, summaries).
- **Phase 2 — Permission, UX & polish bugs.** Starts once Phase 1 for that area is merged to `dev`. Don't start Phase 2 repository/department work on top of an unmerged Phase 1 branch — rebase first.

## Branching
- Branch off `dev`, one branch per person:
  - Simran: `fix/ingestion-pipeline`
  - Sandeep: `fix/repository`
  - Johurul: `fix/org-chat`
- Keep branches short-lived. Push small PRs as each issue is fixed instead of one big PR at the end.

## Ownership rule (read this before editing any file)
- Each person works only inside their assigned files/folders (listed in the email/task list).
- **`src/app/api/documents/ingest/route.js` is owned by Sandeep.** If Simran's worker fix needs a change here, she pings Sandeep first — no one else edits this file directly.
- **Department API routes (`src/app/api/org/[orgId]/department/**`) are owned by Sandeep; the department UI page (`src/app/(app)/org/[orgId]/department/[deptId]/page.jsx`) is owned by Johurul.** If a department UI fix needs an API contract change (new field, different error shape, etc.), Johurul pings Sandeep first.
- If you need to touch a file outside your zone for any other reason, ask in the team channel before editing it. Don't just do it and hope it merges clean.

## Cross-cutting issues (permissions, mobile, loading states)
Some bugs aren't confined to one folder (e.g. "buttons visible without permission," "mobile responsiveness," "unclear loading/empty states"). These are handled as an **audit pass within your own domain**, not as one ticket for one person:
- Simran audits document-level action buttons (regenerate, star, unassign) tied to her APIs.
- Sandeep audits repository components (upload button, filters, badges, dark mode, mobile).
- Johurul audits chat and department UI.

Do this audit as part of your Phase 2 work, not as a separate handoff.

## PR & Merge process
1. Open a PR from your branch into `dev`.
2. Tag Johurul as reviewer.
3. Keep PRs scoped to one issue at a time where possible — easier to review, easier to revert if something breaks.
4. Johurul merges after review. Merge order: if two PRs touch overlapping files, merge the one that landed first, then the other rebases.
5. Pull latest `dev` before starting each new issue to avoid stale branches.

## Daily sync
- Quick async update (Slack/standup) on: what you're working on, anything blocking you, and whether you need to touch a file outside your zone.

## Testing before PR
- Manually verify the fix in the browser/app for the golden path + at least one edge case.
- Don't mark an issue done on code review alone — confirm the actual bug is gone.
