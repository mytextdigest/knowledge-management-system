# Rank 15 (Project Intelligence) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 15. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for every other Tier 2 feature, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Simran**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_PROJECT_INTELLIGENCE.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **This is a composition feature, not a fresh build.** `src/app/(app)/project/page.jsx`'s `TopicsView`, Timeline panel, and `LessonsPanel` already exist and run in production; `src/lib/knowledgeGraph.js` (Rank 13) and `DocumentRelationship`/`DocumentProjectLink` (Rank 12) already model everything this feature needs except project-scoped expert scoring. Read the requirements doc's Problem Statement before starting — most of this feature's work is wiring, not new subsystems.

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

## Milestone 16 — Rank 15 (Project Intelligence)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `16-A` | Resolve Open Questions 1–3 | `TODO` | Simran | — | | |
| `16-B` | Project-Scoped Expert Computation (FR-2) | `TODO` | Simran | `16-A` | | |
| `16-C` | Related Documents and Projects — Project-Side View (FR-3) | `TODO` | Simran | `16-A` | | |
| `16-D` | Lesson Topic Linkage (FR-4) | `TODO` | Simran | `16-A` | | |
| `16-E` | Project Node as Graph Entry Point (FR-5) | `TODO` | Simran | `16-A` | | |
| `16-F` | Project Intelligence View (FR-1) | `TODO` | Simran | `16-B`, `16-C`, `16-D`, `16-E` | | |
| `16-G` | Integration Validation | `TODO` | Simran | `16-F` | | |
| `16-H` | PR + Cross-Review | `TODO` | Simran | `16-G` | | |

---

### Task 16-A — Resolve Open Questions 1–3
- **Status:** `TODO`
- **Objective:** Decide FR-2's mechanism (extend `refreshTopicExpertise()` vs. query-time bridge), confirm FR-5's graph-entry-point feasibility (does `getKnowledgeGraph()` already accept a `Project` `startNode`), and resolve FR-4 (`Lesson.topic` free text vs. real `Topic` join) before downstream tasks start.
- **Key files:** `worker/knowledgeContext.js` (`refreshTopicExpertise()`), `src/lib/knowledgeGraph.js`, `prisma/schema.prisma` (`Lesson`).
- **Acceptance criteria:** all three decisions recorded in this tracker's notes before `16-B`/`16-D`/`16-E` begin.

### Task 16-B — Project-Scoped Expert Computation
- **Status:** `TODO`
- **Objective:** FR-2 — close the gap where project-scope `Topic` rows never get `TopicExpertise` computed, per the mechanism chosen in `16-A`.
- **Key files:** `worker/knowledgeContext.js`, `worker/cluster.js`.
- **Acceptance criteria:** a project with documents that already have repository-scope `TopicExpertise` data can show "who's an expert in this project's topics" without a `TopicExpertise` schema change.

### Task 16-C — Related Documents and Projects (Project-Side View)
- **Status:** `TODO`
- **Objective:** FR-3 — surface non-`"suggested"` `DocumentProjectLink` rows (plus an `includeSuggested` toggle) and RBAC-scoped `DocumentRelationship`/`DocumentConflict` rows for the project's own documents, from the project side.
- **Key files:** new read helper alongside `src/lib/knowledgeContext.js`'s `getAccessibleOrgRelationships()`; `src/app/(app)/project/page.jsx`.
- **Acceptance criteria:** a project shows documents/related projects connected to it via existing `DocumentProjectLink`/`DocumentRelationship` data, RBAC-scoped identically to the existing document-side and org-relationships views.

### Task 16-D — Lesson Topic Linkage
- **Status:** `TODO`
- **Objective:** FR-4 — resolve and implement `REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md`'s Open Question 2 per `16-A`'s decision. If upgrading to a real join, add `Lesson.topicId` additively; if staying free text, document why and close this task as `SKIP`-equivalent (still `DONE`, since the decision itself is the deliverable).
- **Key files:** `prisma/schema.prisma` (`Lesson`), `src/components/lessons/LessonsPanel.jsx`.
- **Acceptance criteria:** the free-text-vs-join question is explicitly resolved and documented; if joined, existing free-text `Lesson.topic` values are preserved unmodified.

### Task 16-E — Project Node as Graph Entry Point
- **Status:** `TODO`
- **Objective:** FR-5 — let a user reach a project-filtered view of the Rank 13 knowledge graph directly from the project page, pre-filtered to `filters.projectId`, extending `src/lib/knowledgeGraph.js` only if `16-A` found it necessary.
- **Key files:** `src/lib/knowledgeGraph.js`, `src/app/api/org/[orgId]/knowledge-graph/route.js`, `src/app/(app)/project/page.jsx`.
- **Acceptance criteria:** a "View in Knowledge Graph" entry point from the project page opens the existing graph UI already scoped to this project, with no new graph node/edge types introduced.

### Task 16-F — Project Intelligence View
- **Status:** `TODO`
- **Objective:** FR-1 — compose the existing `TopicsView`/Timeline/`LessonsPanel` with the new experts (`16-B`) and related-documents (`16-C`) panels and the graph entry point (`16-E`) into one project-centric view.
- **Key files:** `src/app/(app)/project/page.jsx`, new components under `src/components/project-intelligence/` (or similar) as needed.
- **Acceptance criteria:** a project's page (or linked tab) shows topics, lessons, timeline, experts, and related documents/projects together, without duplicating any existing panel's implementation.

### Task 16-G — Integration Validation
- **Status:** `TODO`
- **Objective:** Full regression pass — confirm existing `TopicsView`/`LessonsPanel`/Timeline panel/document-side project-link suggestions are unregressed, confirm RBAC holds for all newly-surfaced related documents/projects/experts, confirm the graph entry point never exposes unbounded org-wide data from a project-scoped click.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_PROJECT_INTELLIGENCE.md` verified.

### Task 16-H — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on the FR-2 expert-computation mechanism (`16-A`/`16-B`) and RBAC on the new related-documents/projects view (`16-C`), since both carry the most implementation-choice risk.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the expert-computation mechanism and RBAC boundary.
