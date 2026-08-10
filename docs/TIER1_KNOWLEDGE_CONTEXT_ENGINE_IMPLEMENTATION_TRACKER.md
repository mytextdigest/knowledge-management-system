# Rank 8 (Knowledge Context Engine) — Implementation Tracker
### Tier 1 Completion Plan — Relationships, Topics, and Expertise

> **For AI agents:** This file is the source of truth for task status on Rank 8. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Unlike earlier Tier 1 blocks (`CKA_IMPLEMENTATION_TRACKER.md`, `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md`, `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md`), this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Sandeep**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `TIER1_COMPLETION_PLAN.md` §6 for why this now runs in parallel with Rank 3 and Rank 4 rather than as the last sequential block. `TIER1_DAY_BY_DAY_SCHEDULE.md` for the current schedule (self-paced, not day-by-day). `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **No coordination needed to start.** This feature's schema (`Topic.scope`, `DocumentRelationship`, `TopicExpertise`, `DocumentProjectLink`) shares no columns with Rank 3 or Rank 4's migrations — `Topic` itself already exists (landed in Block A). The only soft dependency is functional, not schema-level: classification's (Rank 4) category output is one input signal for expertise discovery, not a blocker — do not wait on Rank 4's PR to start or merge this feature.
>
> **RBAC is the highest-risk part of this feature.** FR-3 (Expertise Discovery) and FR-5 (Relationship-Aware Search & Chat) directly surface people-to-document and document-to-document associations — getting the RBAC boundary wrong here doesn't just produce a wrong answer, it leaks the existence of a document or a person's association with one to someone who shouldn't see either. Every query in `9-D`/`9-F` must filter access in the SQL `WHERE` clause, never post-filter.

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

## Milestone 9 — Rank 8 (Knowledge Context Engine)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `9-A` | Own Migration | `TODO` | Sandeep | — | | |
| `9-B` | Org-Wide Topic Model | `TODO` | Sandeep | `9-A` | | |
| `9-C` | Document Relationship Graph | `TODO` | Sandeep | `9-A` | | |
| `9-D` | Expertise Discovery | `TODO` | Sandeep | `9-B` | | |
| `9-E` | Document-to-Project Linking | `TODO` | Sandeep | `9-A` | | |
| `9-F` | Relationship-Aware Search & Chat | `TODO` | Sandeep | `9-C` | | |
| `9-G` | Integration Testing + RBAC Regression Check | `TODO` | Sandeep | `9-D`, `9-E`, `9-F` | | |
| `9-H` | PR + Cross-Review | `TODO` | Sandeep | `9-G` | | |

---

### Task 9-A — Own Migration
- **Status:** `TODO`
- **Objective:** Land this feature's schema. Fully self-contained — `Topic` already exists (Block A), this only adds a `scope` column plus three new tables. No coordination needed with Rank 3 or Rank 4.
- **Key files to create/modify:**
  - `prisma/schema.prisma` — `Topic + orgId String?` / `+ scope String @default("project")`, new `DocumentRelationship` model, new `DocumentProjectLink` model, new `TopicExpertise` model. Exact shape in `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` → Data Model Impact.
  - New migration file.
- **Acceptance criteria:** `prisma migrate status` shows schema up to date; existing search/chat/repository flows unaffected.
- **Reminder (per `feedback_prisma_migrate_diff_shadow_db.md`-style incident earlier in this project):** never pass the live shared-dev `DATABASE_URL` as `--shadow-database-url` for `prisma migrate diff` — use a separate, empty scratch database. Pull latest `dev` and rebase before opening this migration's PR.

### Task 9-B — Org-Wide Topic Model
- **Status:** `TODO`
- **Objective:** FR-1 — extend topic clustering beyond per-project (`Topic.projectId`) to `scope=repository` documents at the org level, so a topic (e.g. "Vendor Contracts") is discoverable independent of department/project. Reuse `centroidEmbedding`/`keywordDistribution` from the existing `Topic` model rather than inventing a new representation, unless it doesn't scale.
- **Open question to resolve during implementation:** is this a new batch job, or an extension of whatever clustering currently produces `Topic` rows for projects (`worker/cluster.js`)? Reusing the existing job is strongly preferred — see requirements doc Open Question #1.
- **Acceptance criteria:** an org-wide topic exists independent of any single project, derived from `scope=repository` documents.

### Task 9-C — Document Relationship Graph
- **Status:** `TODO`
- **Objective:** FR-2 — persist explicit "references"/"supersedes"/"related-to" relationships between documents, computed as a background job after ingestion (never inline). Surface "Related Documents" on the document detail page (`src/app/(app)/document/page.jsx`) and repository cards.
- **Acceptance criteria:** a document detail page shows at least one "related document" link backed by persisted relationship data, not a live similarity query. Computation runs as a background job and adds no upload/chat/search latency.

### Task 9-D — Expertise Discovery
- **Status:** `TODO`
- **Objective:** FR-3 — for a topic or document, identify connected people (uploader, frequent citer via `OrgMessage`, department members whose documents cluster in that topic). Surface "who should I ask about X" in Enterprise Chat. **RBAC-critical** — must never surface a person as an "expert" on a document the asking user can't access; enforce in SQL `WHERE`, never post-filter, consistent with `vectorSearch.js`'s existing pattern.
- **Open question to resolve before this task is meaningfully startable:** how is "citation" tracked today? `OrgMessage` stores chat content but citations are recomputed per-response, not persisted — this task's citer-frequency signal likely needs a schema change to `OrgMessage` first (may require revisiting `9-A`). See requirements doc Open Question #2.
- **Acceptance criteria:** a chat or search query about a topic surfaces at least one relevant person, respecting the asking user's RBAC — verified by a query that returns zero people when the asking user has no access to the underlying documents. Expertise discovery must not expose personally-identifying activity (e.g. exact questions asked), only association.

### Task 9-E — Document-to-Project Linking
- **Status:** `TODO`
- **Objective:** FR-4 — detect when a repository document references an existing `Project` by name/context, offer an advisory link (never auto-merged/auto-linked without confirmation).
- **Acceptance criteria:** a repository document that clearly references an existing project surfaces a `DocumentProjectLink` suggestion, confirmable/dismissable in one click.

### Task 9-F — Relationship-Aware Search & Chat
- **Status:** `TODO`
- **Objective:** FR-5 — expand `orgSearch()`/chat results with "also see" results pulled from the relationship graph (`9-C`), not just raw vector similarity. Same RBAC constraint as `9-D`: a related document mentioned in a chat answer must be one the asking user can access.
- **Open question to resolve during implementation:** injection threshold for a relationship-derived "also see" result in a chat answer — always when data exists, or above a relationship-weight threshold to avoid noisy tangents. See requirements doc Open Question #5.
- **Acceptance criteria:** a chat answer can reference a relationship-derived related document without ever surfacing one the asking user lacks access to.

### Task 9-G — Integration Testing + RBAC Regression Check
- **Status:** `TODO`
- **Objective:** Full RBAC regression across `9-D` and `9-F` — the two highest-risk FRs in this feature. Confirm every new query path (topic model, relationship graph, expertise, project-linking) goes through SQL-`WHERE` RBAC filtering, never a post-filter. Confirm background jobs (`9-B`, `9-C`) add no latency to upload/search/chat.
- **Notes:** dedicate real time here — this is the feature's highest-blast-radius task given the "leaks existence of a document/person association" failure mode called out at the top of this file.

### Task 9-H — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Have at least one other person (Johurul or Simran) review before merge to `dev`, per this project's standard close-out practice — given the RBAC sensitivity of this feature, request the review explicitly focus on `9-D`/`9-F`'s query-level access control, not just functional correctness.

---

## Deferred (this feature) — Tracked for Fast-Follow

Not tasks in this milestone; listed so they aren't lost.

| Item | Why deferred | Where specified |
|---|---|---|
| `FR-P2-1` Knowledge Graph, `FR-P2-3` Relationship Discovery, `FR-P2-4` Expert Discovery (Rank 1 Phase 2) | Depended on this feature's data — buildable once `9-A`–`9-C`/`9-D` ship | `TIER1_COMPLETION_PLAN.md` §3, `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md` |
| `FR-P3-1` Multi-Hop Reasoning, `FR-P3-3` Root Cause Analysis (Rank 1 Phase 3) | Depended on this feature's relationship graph — buildable once `9-C` ships | `TIER1_COMPLETION_PLAN.md` §3, `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md` |
| Building a general-purpose graph database | Model relationally in Postgres unless query patterns prove that inadequate | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` Scope |
| Real-time collaborative editing / document versioning graphs | Out of scope for this capability | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` Scope |

**Once this feature ships, revisit the deferred Phase 2/3 FRs above** — schedule a short follow-up pass to close them out using this feature's now-real relationship graph, rather than the throwaway versions building them earlier would have required.
