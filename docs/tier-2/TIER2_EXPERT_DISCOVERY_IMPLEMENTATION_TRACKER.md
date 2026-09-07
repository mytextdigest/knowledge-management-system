# Rank 9 (Expert Discovery) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 9. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for `TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md`, `TIER1_AUTO_CLASSIFICATION_IMPLEMENTATION_TRACKER.md`, and `TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Sandeep**, continuing his ownership of Rank 8 (Knowledge Context Engine), which this feature extends. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_EXPERT_DISCOVERY.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement. `docs/tier-1/TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md` for the Rank 8 foundation this builds on (`TopicExpertise`, `getAccessibleExperts`, `refreshTopicExpertise`).
>
> **This is an extension of existing, merged code, not a fresh build.** `TopicExpertise`, `getAccessibleExperts()`, and the chat "Suggested people to ask" panel already exist and are in production. Read `worker/knowledgeContext.js` and `src/lib/knowledgeContext.js` in full before starting `10-A` — most tasks here modify that code in place rather than adding a parallel system.
>
> **RBAC is still the highest-risk part of this feature**, inherited directly from Rank 8. Task `9-G` on the Rank 8 tracker was left `IN_PROGRESS` specifically because the RBAC regression test was never actually executed against seeded data. Task `10-F` below closes that gap — do not treat it as optional or as someone else's leftover task.

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

## Milestone 10 — Rank 9 (Expert Discovery)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `10-A` | Schema Extension (`TopicExpertise` source/confirmation/decay fields) | `DONE` | Sandeep | — | 2026-09-06 | 2026-09-06 |
| `10-B` | Standalone Expert Directory (FR-1) | `DONE` | Sandeep | `10-A` | 2026-09-06 | 2026-09-06 |
| `10-C` | Project-Scope Expertise (FR-2) | `DONE` | Sandeep | `10-A` | 2026-09-06 | 2026-09-06 |
| `10-D` | Expertise Confirmation / Correction (FR-3) | `DONE` | Sandeep | `10-A`, `10-B` | 2026-09-06 | 2026-09-06 |
| `10-E` | Recency-Weighted Scoring (FR-4) | `DONE` | Sandeep | `10-A` | 2026-09-06 | 2026-09-06 |
| `10-F` | RBAC Integration Test — closes Rank 8's `9-G` (FR-5) | `IN_PROGRESS` | Sandeep | `10-C` | 2026-09-06 | |
| `10-G` | Expertise on Document/Topic Pages (FR-6) | `DONE` | Sandeep | `10-B` | 2026-09-06 | 2026-09-06 |
| `10-H` | Integration Validation | `IN_PROGRESS` | Sandeep | `10-D`, `10-E`, `10-F`, `10-G` | 2026-09-06 | |
| `10-I` | PR + Cross-Review | `TODO` | Sandeep | `10-H` | | |

---

### Task 10-A — Schema Extension
- **Status:** `DONE`
- **Objective:** Add `TopicExpertise.source`, `confirmedBy`, `lastSignalAt` per `REQUIREMENTS_EXPERT_DISCOVERY.md`'s Data Model Impact. Purely additive to an existing table — no coordination needed with Rank 10 (Recommendation Engine) or Rank 11 (Lessons Learned), which don't touch this table.
- **Key files:** `prisma/schema.prisma`, new migration.
- **Acceptance criteria:** `prisma migrate status` clean; existing `getAccessibleExperts()`/`refreshTopicExpertise()` unaffected until `10-B`+ start using the new columns.
- **Reminder:** never pass the live shared-dev `DATABASE_URL` as `--shadow-database-url` for `prisma migrate diff` (per `feedback_prisma_migrate_diff_shadow_db.md`) — use a separate scratch database.

### Task 10-B — Standalone Expert Directory
- **Status:** `DONE`
- **Objective:** FR-1 — build the browsable/searchable expert surface. Resolve Open Question 1 (dedicated page vs. embedded panel) before starting UI work.
- **Key files:** extend `getAccessibleExperts()` in `src/lib/knowledgeContext.js` (or a new sibling function if the query shape diverges enough) rather than forking its RBAC logic; new route/page under `src/app/(app)/org/[orgId]/...`; reuses `GET /api/org/[orgId]/context/experts` or a new endpoint if the query params diverge from the chat use case.
- **Acceptance criteria:** a user can search by topic/free text and get a ranked, RBAC-correct list without composing a chat question first.

### Task 10-C — Project-Scope Expertise
- **Status:** `DONE`
- **Objective:** FR-2 — extend `refreshTopicExpertise()` (`worker/knowledgeContext.js`) to score `Topic.scope = 'project'` topics, and make `getAccessibleExperts()`'s access check branch correctly by topic scope instead of assuming repository-only access rules for every row.
- **Acceptance criteria:** a person's project-only contributions surface as expertise, gated by the project's actual access rule (not the repository rule).

### Task 10-D — Expertise Confirmation / Correction
- **Status:** `DONE`
- **Objective:** FR-3 — self-confirm/dismiss and `dept_admin`-confirm actions; `refreshTopicExpertise()` must not silently overwrite a `confirmed`/`dismissed` row's `source`.
- **Acceptance criteria:** confirming or dismissing an entry survives the next background refresh run.

### Task 10-E — Recency-Weighted Scoring
- **Status:** `DONE`
- **Objective:** FR-4 — decay factor on `TopicExpertise.score` using `lastSignalAt`. Resolve Open Question 3 (fixed vs. configurable half-life) before implementation; default to a fixed constant if no strong reason to make it configurable.
- **Acceptance criteria:** a stale-but-heavy historical contributor no longer permanently outranks recent activity.

### Task 10-F — RBAC Integration Test (closes Rank 8 Task 9-G)
- **Status:** `IN_PROGRESS`
- **Objective:** FR-5 — a real DB-backed test seeding cross-department data, querying `getAccessibleExperts()` as a low-privilege user, asserting zero results for a department they can't access. This supersedes the source-pattern string assertions in `scripts/task-9/*.test.mjs` for this specific query path.
- **Acceptance criteria:** test passes; Rank 8's `TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md` Task `9-G` can be updated to `DONE` referencing this test.
- **Note:** dedicate real time here per this tracker's header warning — this is the highest-blast-radius task in this milestone.

### Task 10-G — Expertise on Document/Topic Pages
- **Status:** `DONE`
- **Objective:** FR-6 — surface "people who know this" on `src/app/(app)/document/page.jsx`, reusing `10-B`'s query scoped to the document's topic.
- **Acceptance criteria:** a document detail page shows relevant experts alongside the existing Decisions/Related Documents cards, with no regression to either.

### Task 10-H — Integration Validation
- **Status:** `IN_PROGRESS`
- **Objective:** Full regression pass across `10-C`–`10-G` — confirm no latency regression to upload/chat/search (scoring stays in the existing background job chain), confirm the existing chat "Suggested people to ask" panel still works unchanged.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_EXPERT_DISCOVERY.md` verified.

### Task 10-I — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on `10-C`'s access-check branching and `10-F`'s test, given this feature's RBAC history (the `isOrgAdmin`/`isSuperAdmin` bug found in Rank 8's original `9-D`).
- **Acceptance criteria:** merged to `dev` with at least one other reviewer's explicit sign-off on the RBAC-sensitive paths.


## Implementation Notes — 2026-09-06

- **10-B placement decision:** dedicated `/org/[orgId]/experts` page, linked from the application sidebar. This resolves the Rank 8 open question without coupling expert discovery to chat.
- **10-C RBAC:** repository and project topic branches are enforced inside SQL. Repository queries additionally prevent a mixed cross-department topic from leaking an expert association from an inaccessible department.
- **10-D:** self-confirm/dismiss and department-admin confirmation are one-click actions. Topic visibility is checked independently of whether a `TopicExpertise` row already exists, so an authorized admin can designate an SME.
- **10-E:** fixed 90-day half-life. Only `view`/`download` interactions count as expertise signals; recommendation impressions do not.
- **10-F:** DB-backed test is implemented in `scripts/task-10/expert-rbac.integration.test.mjs`, including a shared-topic cross-department leak case. Status remains `IN_PROGRESS` until executed against PostgreSQL.
- **10-H:** source/static validation is complete. Full DB-backed RBAC execution and browser regression are still required before merge.
