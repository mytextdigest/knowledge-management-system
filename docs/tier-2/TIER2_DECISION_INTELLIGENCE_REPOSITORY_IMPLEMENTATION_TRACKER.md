# Rank 14 (Decision Intelligence Repository) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 14. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for every other Tier 2 feature, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Johurul**. Open Questions 2–4 in `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md` (outcome-status authorization, repository-page scoping, whether search needs to be semantic) are still unresolved and must be answered as part of `15-A` before the tasks that depend on them proceed.
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
| `15-A` | Resolve Open Questions 2–4 | `TODO` | Johurul | — | | |
| `15-B` | Decision Outcome Field — Schema + Migration (FR-2) | `TODO` | Johurul | `15-A` | | |
| `15-C` | Decision Repository Page (FR-1) | `TODO` | Johurul | `15-A` | | |
| `15-D` | Decision Search (FR-4) | `TODO` | Johurul | `15-C` | | |
| `15-E` | Decision Detail View (FR-5) | `TODO` | Johurul | `15-C` | | |
| `15-F` | Decision-to-Lesson Linkage Display (FR-3) | `TODO` | Johurul | `15-E` | | |
| `15-G` | Outcome Status Write Path (FR-2) | `TODO` | Johurul | `15-B`, `15-E` | | |
| `15-H` | Integration Validation | `TODO` | Johurul | `15-D`, `15-F`, `15-G` | | |
| `15-I` | PR + Cross-Review | `TODO` | Johurul | `15-H` | | |

---

### Task 15-A — Resolve Open Questions 2–4
- **Status:** `TODO`
- **Objective:** Before implementing `15-B` onward, resolve `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md`'s remaining Open Questions: who can change outcome status (Q2); org-level-only vs. department/project-scoped repository view (Q3); whether search needs to be semantic (Q4). Ownership (former Q1) is resolved — Johurul.
- **Key files:** none — a product decision, not code.
- **Acceptance criteria:** Open Questions 2–4 have recorded answers in the requirements doc.

### Task 15-B — Decision Outcome Field: Schema + Migration
- **Status:** `TODO`
- **Objective:** FR-2 — add `Decision.status String @default("active")` (`"active" | "reversed" | "superseded"`). Purely additive; no backfill required.
- **Key files:** `prisma/schema.prisma`, new migration.
- **Acceptance criteria:** `prisma migrate status` clean; all existing `Decision` rows default to `"active"` with no manual backfill step.

### Task 15-C — Decision Repository Page
- **Status:** `TODO`
- **Objective:** FR-1 — a dedicated, sidebar-reachable page listing decisions org-wide (RBAC-scoped), filterable by project/department/date/(once `15-B` lands) outcome status. Follow the existing Experts/Recommendations/Lessons page pattern.
- **Key files:** new page under `src/app/(app)/org/[orgId]/decisions/`, new API route(s) under `src/app/api/org/[orgId]/decisions/`.
- **Acceptance criteria:** page is reachable from the sidebar; decisions shown are RBAC-scoped to what the requesting user could already access via their source documents.

### Task 15-D — Decision Search
- **Status:** `TODO`
- **Objective:** FR-4 — reuse `getDecisionEvidence()`'s RBAC-scoped keyword-search query shape (`src/lib/decisionIntelligence.js`) as the basis for the repository's search, rather than a second implementation.
- **Key files:** `src/lib/decisionIntelligence.js` (extend, don't fork), repository page/API from `15-C`.
- **Acceptance criteria:** repository search returns the same RBAC-scoped result set a chat decision-question would surface, for equivalent query terms.

### Task 15-E — Decision Detail View
- **Status:** `TODO`
- **Objective:** FR-5 — statement, rationale, decided-at date, link to source document, linked lessons (`15-F`), optional related `TimelineEvent` context.
- **Key files:** repository page from `15-C`.
- **Acceptance criteria:** detail view links out to the existing document page rather than duplicating its decision list.

### Task 15-F — Decision-to-Lesson Linkage Display
- **Status:** `TODO`
- **Objective:** FR-3 — where `Lesson.decisionId` references a decision, show those lessons in the decision's detail view. Read-only consumption of the existing relation; no change to lesson authoring.
- **Key files:** repository page from `15-C`/`15-E`.
- **Acceptance criteria:** a decision with linked lessons visibly shows "what we learned" alongside "what was decided."

### Task 15-G — Outcome Status Write Path
- **Status:** `TODO`
- **Objective:** FR-2 — an authorized user (role boundary decided in `15-A`) can change a decision's `status`. Human-driven, never auto-inferred by an LLM, consistent with the Lessons Learned precedent (human-confirmed, never auto-published).
- **Key files:** new API route (e.g. `PATCH /api/org/[orgId]/decisions/[decisionId]`), repository detail view from `15-E`.
- **Acceptance criteria:** only the role(s) decided in `15-A` can change status; the change is visible immediately in the repository view.

### Task 15-H — Integration Validation
- **Status:** `TODO`
- **Objective:** Full regression pass — confirm existing chat decision-grounding, per-document decision display, and project/department timelines are unchanged; confirm RBAC holds on the new repository page and search.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md` verified.

### Task 15-I — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review focused on the outcome-status write path's RBAC (`15-G`) and confirmation that extraction/chat-grounding logic was untouched.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the RBAC boundary for `15-G`.
