# Rank 10 (Knowledge Recommendation Engine) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 10. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for `TIER1_AUTO_CLASSIFICATION_IMPLEMENTATION_TRACKER.md`, `TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`, and `TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md`, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Simran**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_KNOWLEDGE_RECOMMENDATION_ENGINE.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **This is an extension of existing, merged code, not a fresh build.** `src/lib/recommendations.js`, `GET /api/org/[orgId]/recommendations`, and `RelatedWorkPanel.jsx` already exist, already work, and are currently just unmounted from the department page (commit `80d3657`). Read `11-A` before touching anything else — the very first step is getting an actual answer on why the panel was hidden, not assuming.

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

## Milestone 11 — Rank 10 (Knowledge Recommendation Engine)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `11-A` | Resolve Panel-Hiding Decision + Re-Establish Surface (FR-1) | `TODO` | Simran | — | | |
| `11-B` | Document Interaction Signal — Schema + Migration (FR-2) | `TODO` | Simran | — | | |
| `11-C` | Interaction Write Path | `TODO` | Simran | `11-B` | | |
| `11-D` | Feedback-Weighted Ranking (FR-3) | `TODO` | Simran | — | | |
| `11-E` | Relationship-Graph-Aware Recommendations (FR-4) | `TODO` | Simran | — | | |
| `11-F` | Department/Role-Aware Recommendations (FR-5) | `TODO` | Simran | `11-A` | | |
| `11-G` | Admin Effectiveness Visibility (FR-6) | `TODO` | Simran | `11-C` | | |
| `11-H` | Integration Validation | `TODO` | Simran | `11-D`, `11-E`, `11-F`, `11-G` | | |
| `11-I` | PR + Cross-Review | `TODO` | Simran | `11-H` | | |

---

### Task 11-A — Resolve Panel-Hiding Decision + Re-Establish Surface
- **Status:** `TODO`
- **Objective:** FR-1 — before any other work, confirm with whoever hid `RelatedWorkPanel` in commit `80d3657` why it was hidden (no reason is recorded in the commit message or any doc). Decide: restore as-is on the department page, redesign, relocate, or deliberately retire in favor of the new semantic search added in that same commit — and document whichever it is here.
- **Key files:** `src/app/(app)/org/[orgId]/department/[deptId]/page.jsx` (currently has `RelatedWorkPanel` import and usage commented out), `src/components/recommendations/RelatedWorkPanel.jsx`.
- **Acceptance criteria:** at least one recommendation surface is visibly reachable in the product, with the placement decision explicitly recorded in this tracker's notes.

### Task 11-B — Document Interaction Signal: Schema + Migration
- **Status:** `TODO`
- **Objective:** FR-2 — add the `DocumentInteraction` model per `REQUIREMENTS_KNOWLEDGE_RECOMMENDATION_ENGINE.md`'s Data Model Impact. Coordinate the final field shape with Sandeep (owner of [[REQUIREMENTS_EXPERT_DISCOVERY]], Rank 9) before finalizing, since his feature will consume this model once it exists — see both docs' Interface Contract sections.
- **Key files:** `prisma/schema.prisma`, new migration.
- **Acceptance criteria:** `prisma migrate status` clean; purely additive, no column overlap with any other in-flight feature.

### Task 11-C — Interaction Write Path
- **Status:** `TODO`
- **Objective:** Wire a write to `DocumentInteraction` into the document-view request path (`src/app/(app)/document/page.jsx` and/or its backing API route). Fire-and-forget / best-effort — must not become a blocking dependency of the document-view response.
- **Acceptance criteria:** viewing a document creates an interaction row, with no measurable latency regression on the view request.

### Task 11-D — Feedback-Weighted Ranking
- **Status:** `TODO`
- **Objective:** FR-3 — read `OrgMessage.feedback` in `src/lib/recommendations.js` and adjust `collapseByDocument()`'s scoring: boost documents behind `"helpful"`-marked answers, suppress ones behind `"not_helpful"`.
- **Acceptance criteria:** a document behind a `not_helpful` answer is demonstrably deprioritized in that user's next recommendation set.

### Task 11-E — Relationship-Graph-Aware Recommendations
- **Status:** `TODO`
- **Objective:** FR-4 — extend `getRecommendations()` to pull additional candidates via `DocumentRelationship`, reusing the same graph `expandWithRelatedDocuments()` (`src/lib/knowledgeContext.js`) already uses for chat, rather than a second implementation of graph traversal.
- **Acceptance criteria:** a document structurally related (via `DocumentRelationship`) to a user's recent activity can appear in recommendations even without strong embedding similarity to their `OrgMemberMemory` topics.

### Task 11-F — Department/Role-Aware Recommendations
- **Status:** `TODO`
- **Objective:** FR-5 — a department-wide trending/aggregate view for `dept_admin`, distinct from an individual's personalized proactive list. Depends on `11-A`'s resolved surface placement.
- **Acceptance criteria:** a `dept_admin` can see department-level recommended/trending content, not just their own personal feed.

### Task 11-G — Admin Effectiveness Visibility
- **Status:** `TODO`
- **Objective:** FR-6 — a narrow summary (most-recommended documents, zero-click-through recommendations) reusing the `GET /api/org/[orgId]/health` aggregation pattern. Depends on `11-C`'s interaction data existing to aggregate over.
- **Acceptance criteria:** an admin can see a basic effectiveness summary without this becoming a general analytics feature.

### Task 11-H — Integration Validation
- **Status:** `TODO`
- **Objective:** Full regression pass — confirm `ORG_OPENAI_KEY_MISSING` handling still works, confirm no chat/search/repository-listing regression, confirm interaction writes (`11-C`) don't leak individual-level data to unintended viewers (see requirements doc NFRs and Open Question 3).
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_KNOWLEDGE_RECOMMENDATION_ENGINE.md` verified.

### Task 11-I — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on `11-C`'s RBAC/privacy handling of interaction data, given the precedent set by Rank 8's "leaks existence of association" failure mode.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the interaction-data privacy boundary.
