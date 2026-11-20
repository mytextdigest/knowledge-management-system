# Rank 14 (Decision Intelligence Repository) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 14. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for every other Tier 2 feature, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Johurul**. Open Questions 2–4 in `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md` (outcome-status authorization, repository-page scoping, whether search needs to be semantic) are now resolved — see that doc's Open Questions section.
>
> **Reference documents:** `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **This is an extension of existing, merged code, not a fresh build.** `Decision` extraction (`extractDecisions()`, `worker/summarize.js`/`worker/index.js`), chat-grounding (`isDecisionQuestion()`/`getDecisionEvidence()`, `src/lib/decisionIntelligence.js`), per-document decision display, and per-project/department timelines (`TimelineEvent`) all already exist and run in production today. This feature adds a browsable repository surface and optional outcome tracking on top — it does not touch extraction or chat-grounding logic.

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

## Milestone 15 — Rank 14 (Decision Intelligence Repository)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `15-A` | Resolve Open Questions 2–4 | `DONE` | Johurul | — | 2026-09-21 | 2026-09-21 |
| `15-B` | Decision Outcome Field — Schema + Migration (FR-2) | `DONE` | Johurul | `15-A` | 2026-09-21 | 2026-09-21 |
| `15-C` | Decision Repository Page (FR-1) | `DONE` | Johurul | `15-A` | 2026-09-21 | 2026-09-21 |
| `15-D` | Decision Search (FR-4) | `DONE` | Johurul | `15-C` | 2026-09-21 | 2026-09-21 |
| `15-E` | Decision Detail View (FR-5) | `DONE` | Johurul | `15-C` | 2026-09-21 | 2026-09-21 |
| `15-F` | Decision-to-Lesson Linkage Display (FR-3) | `DONE` | Johurul | `15-E` | 2026-09-21 | 2026-09-21 |
| `15-G` | Outcome Status Write Path (FR-2) | `DONE` | Johurul | `15-B`, `15-E` | 2026-09-21 | 2026-09-21 |
| `15-H` | Integration Validation | `DONE` | Johurul | `15-D`, `15-F`, `15-G` | 2026-09-21 | 2026-09-21 |
| `15-I` | PR + Cross-Review | `DONE` | Johurul | `15-H` | 2026-09-26 | 2026-09-26 |

---

### Task 15-A — Resolve Open Questions 2–4
- **Status:** `DONE`
- **Objective:** Before implementing `15-B` onward, resolve `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md`'s remaining Open Questions: who can change outcome status (Q2); org-level-only vs. department/project-scoped repository view (Q3); whether search needs to be semantic (Q4). Ownership (former Q1) is resolved — Johurul.
- **Key files:** none — a product decision, not code.
- **Acceptance criteria:** Open Questions 2–4 have recorded answers in the requirements doc.
- **Notes:** Q2 → document owner or a department admin who can manage the document's (or its project's) department, mirroring `canManageLesson`'s reviewer shape. Q3 → org-level page only, filterable by department/project/date/status. Q4 → no, keep the existing keyword/BM25 approach. See requirements doc's Open Questions section for full reasoning.

### Task 15-B — Decision Outcome Field: Schema + Migration
- **Status:** `DONE`
- **Objective:** FR-2 — add `Decision.status String @default("active")` (`"active" | "reversed" | "superseded"`). Purely additive; no backfill required.
- **Key files:** `prisma/schema.prisma`, `prisma/migrations/20260921000000_add_decision_status/migration.sql`.
- **Acceptance criteria:** `prisma migrate status` clean; all existing `Decision` rows default to `"active"` with no manual backfill step.
- **Notes:** Migration generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel prisma/schema.prisma --script` (same reset-risk avoidance as the Lessons Learned migration), with the same recurring `DROP INDEX "Chunk_embedding_vec_idx"` false positive dropped before applying. Applied with `prisma migrate deploy` to the live Neon dev DB; verified via `prisma.decision.count()` that all 50 existing rows now read `status: "active"`.

### Task 15-C — Decision Repository Page
- **Status:** `DONE`
- **Objective:** FR-1 — a dedicated, sidebar-reachable page listing decisions org-wide (RBAC-scoped), filterable by project/department/date/(once `15-B` lands) outcome status. Follow the existing Experts/Recommendations/Lessons page pattern.
- **Key files:** `src/app/(app)/org/[orgId]/decisions/page.jsx`, `src/app/api/org/[orgId]/decisions/route.js`, `src/components/layout/AppSidebar.jsx` (added "Decisions" nav entry).
- **Acceptance criteria:** page is reachable from the sidebar; decisions shown are RBAC-scoped to what the requesting user could already access via their source documents.
- **Notes:** RBAC scoping lives in `getAccessibleDecisions()` (`src/lib/decisionIntelligence.js`), sharing a `decisionAccessSql()` fragment with `getDecisionEvidence()` so the repository can never see more than chat grounding already allows. Verified via DB dry-run (not browser, per standing preference): a super_admin's query returned rows, the identical query for a non-member/non-superadmin returned zero rows.

### Task 15-D — Decision Search
- **Status:** `DONE`
- **Objective:** FR-4 — reuse `getDecisionEvidence()`'s RBAC-scoped keyword-search query shape (`src/lib/decisionIntelligence.js`) as the basis for the repository's search, rather than a second implementation.
- **Key files:** `src/lib/decisionIntelligence.js` (`getAccessibleDecisions()`, extended not forked — shares `decisionAccessSql()`, `tokenize()`, `computeBM25()` with `getDecisionEvidence()`).
- **Acceptance criteria:** repository search returns the same RBAC-scoped result set a chat decision-question would surface, for equivalent query terms.
- **Notes:** Without a `query`, results are a plain paginated listing ordered by `decidedAt`/`created_at`; with one, it fetches a wider candidate pool and reranks with the same `computeBM25()` call `getDecisionEvidence()` uses.

### Task 15-E — Decision Detail View
- **Status:** `DONE`
- **Objective:** FR-5 — statement, rationale, decided-at date, link to source document, linked lessons (`15-F`), optional related `TimelineEvent` context.
- **Key files:** `src/app/api/org/[orgId]/decisions/[decisionId]/route.js` (GET), `src/components/decisions/DecisionDetailModal.jsx`.
- **Acceptance criteria:** detail view links out to the existing document page rather than duplicating its decision list.
- **Notes:** Detail view is a modal (matches the existing `ExpertScoreModal` pattern) rather than a separate route, opened from the repository page's list. Access re-checked server-side per decision via `canAccessDecisionDocument()` (`src/lib/decisionAccess.js`), not just inherited from the list query.

### Task 15-F — Decision-to-Lesson Linkage Display
- **Status:** `DONE`
- **Objective:** FR-3 — where `Lesson.decisionId` references a decision, show those lessons in the decision's detail view. Read-only consumption of the existing relation; no change to lesson authoring.
- **Key files:** `src/app/api/org/[orgId]/decisions/[decisionId]/route.js`, `src/components/decisions/DecisionDetailModal.jsx`.
- **Acceptance criteria:** a decision with linked lessons visibly shows "what we learned" alongside "what was decided."
- **Notes:** Reads `Decision.lessons` (the existing `Lesson.decisionId` relation) as-is; a draft (unpublished) lesson is still shown but visibly marked "Draft — not yet published" rather than hidden, since this is the decision owner's own view of what followed, not a public knowledge surface.

### Task 15-G — Outcome Status Write Path
- **Status:** `DONE`
- **Objective:** FR-2 — an authorized user (role boundary decided in `15-A`) can change a decision's `status`. Human-driven, never auto-inferred by an LLM, consistent with the Lessons Learned precedent (human-confirmed, never auto-published).
- **Key files:** `src/lib/decisionAccess.js` (`canManageDecision()`), `src/app/api/org/[orgId]/decisions/[decisionId]/route.js` (PATCH).
- **Acceptance criteria:** only the role(s) decided in `15-A` can change status; the change is visible immediately in the repository view.
- **Notes:** Verified via DB dry-run against a real decision/document pair: the document's owner can manage it, an unrelated member cannot, and a super_admin always can. The list/detail GET paths and this write path share no code (write path never trusts client-echoed access from the list), so a stale/forged `canManage` flag client-side has no effect — the PATCH route re-derives it server-side.
- **Extension (post-15-H, same day):** added `Decision.statusNote` (migration `20260921010000_add_decision_status_note`, additive, nullable) alongside `status`. `DecisionDetailModal` now edits status/note as a local draft and saves both in one PATCH via a "Save" button, rather than the earlier instant-click-per-status behavior. `getDecisionEvidence()` now selects `status`/`statusNote` too, and `formatDecisionContext()`/`DECISION_INSTRUCTION` (`src/lib/decisionIntelligence.js`) fold a non-`"active"` outcome and its note into chat grounding context, so a decision cited in chat surfaces why it no longer holds instead of being quoted as if it still does. See requirements doc's updated FR-2 and Interface Contract with Existing Extraction/Chat-Grounding. Verified via DB dry-run (write + revert) and a standalone `formatDecisionContext()` render.

### Task 15-H — Integration Validation
- **Status:** `DONE`
- **Objective:** Full regression pass — confirm existing chat decision-grounding, per-document decision display, and project/department timelines are unchanged; confirm RBAC holds on the new repository page and search.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md` verified.
- **Notes:** `extractDecisions()`, `isDecisionQuestion()`, and the exported shape/signature of `getDecisionEvidence()` are untouched — only its internal access-check duplication was factored out into `decisionAccessSql()`, which `getDecisionEvidence()` now calls too (behavior-preserving refactor, confirmed by re-running its exact prior SQL logic against the live DB and getting identical results). `npx next build` passes clean with the new routes/pages included. Caught and fixed one real bug during dry-run verification: the first draft of `getAccessibleDecisions()`'s `ORDER BY` referenced `dec."createdAt"`, but `Decision.createdAt` is `@map("created_at")` — Postgres raised `column dec.createdAt does not exist` until corrected to `dec.created_at`.

### Task 15-I — PR + Cross-Review
- **Status:** `DONE`
- **Objective:** Submit this feature's PR. Request review focused on the outcome-status write path's RBAC (`15-G`) and confirmation that extraction/chat-grounding logic was untouched.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the RBAC boundary for `15-G`.
