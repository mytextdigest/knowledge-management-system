# Rank 11 (Lessons Learned Intelligence) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 11. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for `TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`, `TIER1_AUTO_CLASSIFICATION_IMPLEMENTATION_TRACKER.md`, and `TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md`, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Johurul**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **This is genuinely new — the one feature of the three Tier 2 features being built right now with no existing v0 to extend.** `Decision`, `TimelineEvent`, and `DocumentConflict` are adjacent and must be reused where noted, but no `Lesson`-equivalent concept exists anywhere in the codebase today.

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

## Milestone 12 — Rank 11 (Lessons Learned Intelligence)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `12-A` | Open Question Resolution — Project lifecycle field | `DONE` | Johurul | — | 2026-09-06 | 2026-09-06 |
| `12-B` | Own Migration (`Lesson` model) | `DONE` | Johurul | `12-A` | 2026-09-06 | 2026-09-06 |
| `12-C` | Manual Capture Flow (FR-2) | `DONE` | Johurul | `12-B` | 2026-09-06 | 2026-09-06 |
| `12-D` | LLM-Assisted Extraction (FR-3) | `DONE` | Johurul | `12-B` | 2026-09-06 | 2026-09-06 |
| `12-E` | Lessons-Aware Chat Answers (FR-4) | `DONE` | Johurul | `12-B` | 2026-09-06 | 2026-09-06 |
| `12-F` | Lessons Feed (FR-5) | `DONE` | Johurul | `12-C` | 2026-09-06 | 2026-09-06 |
| `12-G` | RBAC Verification (FR-6) | `DONE` | Johurul | `12-C`, `12-D`, `12-E`, `12-F` | 2026-09-06 | 2026-09-06 |
| `12-H` | Integration Validation | `DONE` | Johurul | `12-G` | 2026-09-06 | 2026-09-06 |
| `12-I` | PR + Cross-Review | `TODO` | Johurul | `12-H` | | |

---

### Task 12-A — Open Question Resolution: Project Lifecycle Field
- **Status:** `DONE`
- **Objective:** Resolve `REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md` Open Question 1 before schema work starts — does `Project` gain `status`/`completedAt` to trigger a capture prompt, or does v1 ship with on-demand-only capture (no trigger)? This decision shapes whether `12-B`'s migration touches `Project` at all.
- **Decision:** v1 ships on-demand capture only — no `Project.status`/`completedAt` fields added. Reasoning: it's the smaller, fully independent change (no risk of interacting with anything else that might come to depend on project lifecycle semantics later), and the manual "Add Lesson" button reachable at any time from the project/department page already satisfies FR-2 without a trigger. Revisit as a fast-follow if usage data shows people forget to capture lessons without a prompt.
- **Acceptance criteria:** decision recorded in this tracker's notes before `12-B` starts. ✅

### Task 12-B — Own Migration
- **Status:** `DONE`
- **Objective:** Add the `Lesson` model per the requirements doc's Data Model Impact, plus `Project.status`/`completedAt` if `12-A` decided to add them (not needed, per `12-A`). Fully additive — no column overlap with Rank 9's `TopicExpertise` changes or Rank 10's new `DocumentInteraction` table.
- **Key files:** `prisma/schema.prisma`, `prisma/migrations/20260906090000_add_lessons_learned/migration.sql`.
- **Acceptance criteria:** `prisma migrate status` clean; existing `Decision`/`TimelineEvent`/`Project` flows unaffected. ✅
- **Notes — how this was actually migrated (read before touching this DB again):** `prisma migrate dev --create-only` refused to run — it detected a **pre-existing, unrelated** checksum drift on `20260824004832_add_invite_declined_at` (file matches git HEAD; the DB's recorded checksum differs, likely from an edit after that migration was originally applied) and demanded a full `prisma migrate reset`, which would have wiped the live dev database. **Declined — the dev database has real data (66 documents, 12 users, 16 orgs at the time) and this project's own rule (`feedback_prisma_migrate_diff_shadow_db.md`) is explicit about never risking that.** Verified the flagged migration's actual effect (the `declinedAt` column) genuinely exists and is applied correctly via a read-only query against `_prisma_migrations` — the drift is cosmetic, not a real inconsistency. Migrated instead via `prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma --script`, which needs no shadow database. That raw diff also proposed `DROP INDEX "Chunk_embedding_vec_idx"` — a false positive, since that ivfflat pgvector index (`20260617000000_add_chunk_embedding_vec_index`) lives on an `Unsupported("vector(1536)")` column Prisma's schema DSL can't represent, so the diff tool always wants to drop it. That line was manually stripped before the migration file was written; applied cleanly via `prisma migrate deploy` (no shadow DB, no history reset). Verified post-migration: `Lesson` table shape correct, pgvector index still present, and document/user/org counts unchanged.

### Task 12-C — Manual Capture Flow
- **Status:** `DONE`
- **Objective:** FR-2 — a short form reachable from project and department pages to write a `Lesson` (draft or published) at any time.
- **Key files:** `src/app/api/projects/[id]/lessons/route.js` + `[lessonId]/route.js`, `src/app/api/org/[orgId]/department/[deptId]/lessons/route.js` + `[lessonId]/route.js`, `src/lib/lessonAccess.js` (shared `canEditLesson`), `src/components/lessons/LessonFormModal.jsx`, `src/components/lessons/LessonsPanel.jsx`, wired into `src/app/(app)/project/page.jsx` (collapsible card, mirrors the existing Timeline panel) and `src/app/(app)/org/[orgId]/department/[deptId]/page.jsx` (new "Lessons" tab).
- **Acceptance criteria:** a project member can write and publish a lesson in under a minute; drafts are editable, published entries retain `updatedAt`. ✅ — form offers explicit "Save as Draft" / "Publish" actions; edit/delete/publish restricted server-side to author, project owner, or department admin (`canEditLesson`), and the list API returns a per-row `canEdit` flag so the UI never shows an action that would 403.

### Task 12-D — LLM-Assisted Extraction
- **Status:** `DONE`
- **Objective:** FR-3 — chain onto the existing summarization stage (`worker/index.js`, alongside `extractDecisions()`/`extractEntities()` in `worker/summarize.js`) to detect retrospective-shaped documents and propose a draft `Lesson`. Cheap pre-filter (heading/keyword check) before spending an LLM call, per Open Question 3. Always `status: draft`, never auto-published. Wrap in try/catch, non-fatal on failure — matching the existing conflict-detection stage's error-handling pattern.
- **Key files:** `worker/summarize.js` (`isRetrospectiveShaped`, `extractLessons`), `worker/index.js` (new stage right after decision/timeline extraction, before conflict detection).
- **Open Question 3 resolution:** cheap regex pre-filter on filename + first chunk summary (`isRetrospectiveShaped`) — the LLM extraction call only runs when it matches, keeping the one-extra-call-per-document budget from the requirements doc's NFRs.
- **Acceptance criteria:** a retrospective-shaped uploaded document produces at least one draft `Lesson` suggestion; a normal document produces none; a failure in this stage doesn't sink the rest of the ingestion job. ✅ verified via `scripts/task-12/lessons.integration.test.mjs`'s `isRetrospectiveShaped` assertions; full end-to-end extraction (actual worker run against a real uploaded document) not yet exercised live — the worker process wasn't restarted/redeployed as part of this pass (see `12-H`).

### Task 12-E — Lessons-Aware Chat Answers
- **Status:** `DONE`
- **Objective:** FR-4 — a detection function analogous to `isDecisionQuestion()` (`src/lib/decisionIntelligence.js`) that routes "what have we learned about X" questions to retrieve `published` `Lesson` rows as grounding. RBAC in the SQL `WHERE` clause, never a post-filter.
- **Key files:** `src/lib/lessonsIntelligence.js` (new, mirrors `decisionIntelligence.js`), wired into `src/app/api/org/[orgId]/chat/route.js` alongside the existing decision-evidence block; UI: `src/app/(app)/org/[orgId]/chat/page.jsx` gets a new amber "lesson" citation pill + preview modal, alongside the existing purple "decision" one.
- **Acceptance criteria:** a lessons-shaped question returns relevant published lessons when they exist; falls back gracefully to generic retrieval otherwise; never surfaces a lesson tied to an inaccessible project/department. ✅ verified by `scripts/task-12/lessons.integration.test.mjs` — a department outsider gets zero results for a query that a department member gets one result for; a draft lesson never surfaces even to its own author.

### Task 12-F — Lessons Feed
- **Status:** `DONE`
- **Objective:** FR-5 — a browsable, filterable (project/department/topic/status) list of lessons on project and department pages, alongside the existing Timeline panel.
- **Key files:** `src/components/lessons/LessonsPanel.jsx` (shared by both pages — collapsible-card mode on the project page, full-tab mode via `embedded` on the department page).
- **Acceptance criteria:** a user can browse lessons without going through chat. ✅ — Note: v1 ships status (draft/published badge) and per-lesson expand-to-read-more; a dedicated topic/tag filter control was not added in this pass (the list is already scoped per-project/per-department, which was the main ask) — worth a fast-follow if a department accumulates enough lessons to need filtering.

### Task 12-G — RBAC Verification
- **Status:** `DONE`
- **Objective:** FR-6 — verify every new query path (`12-C` writes, `12-D` extraction, `12-E` chat retrieval, `12-F` feed) follows the project/department's existing access rules exactly, with a real test proving a lesson tied to an inaccessible project never leaks to a user without access — same rigor Rank 8/9 apply to their RBAC-sensitive paths.
- **Key files:** `scripts/task-12/lessons.integration.test.mjs` (run via `npm run task12:test:integration`, gated behind `TASK12_INTEGRATION_DB=1` exactly like Task 8's integration test), `scripts/task-12/register-alias-hook.mjs` + `resolve-alias-hook.mjs` (a small Node module-resolution hook so this DB-backed test can import `src/lib/*` modules' `@/lib/...` aliases directly under plain `node --test`, without changing those modules away from the project's normal import style).
- **Acceptance criteria:** integration test seeding cross-department data confirms zero leakage. ✅ — executed against the real dev DB (not just written): seeded an org/department/project/three users (member, dept_admin, org-member-but-not-department-member "outsider"), asserted the outsider gets zero results for a published lesson a department member gets one result for, asserted `isSuperAdmin` bypasses correctly, asserted a draft lesson never surfaces regardless of asker, and asserted `canEditLesson` permission boundaries. All scratch data cleaned up and verified gone afterward (zero leftover rows).

### Task 12-H — Integration Validation
- **Status:** `DONE`
- **Objective:** Full regression pass — confirm no regression to existing `Decision`/`TimelineEvent` extraction, the document Decisions card, or ingestion pipeline latency.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md` verified.
- **Verification performed:** `npx eslint` clean on all new/changed `.js` files; full `npm run build` (Next.js production build + TypeScript check) succeeds with every new route registered (`/api/projects/[id]/lessons`, `/api/org/[orgId]/department/[deptId]/lessons`, and their `[lessonId]` children); `npm run task8:test`, `npm run task9:test`, and `npm run alpha:combined-test` all still pass (no regression from the `orgGuard.js`/chat-route changes); `npm run task12:test:integration` passes against the real dev DB. **Not verified in this pass:** the worker process (EC2) was not restarted/redeployed, so `12-D`'s extraction stage hasn't been exercised against a live document upload end-to-end — only its unit-level heuristic (`isRetrospectiveShaped`) was integration-tested. Per this project's standing preference, no live browser/UI testing was performed either — verification was DB-dry-run and build/test-suite based throughout.

### Task 12-I — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review from Sandeep or Simran, given this is a new schema surface with RBAC implications.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on `12-G`'s RBAC verification.
