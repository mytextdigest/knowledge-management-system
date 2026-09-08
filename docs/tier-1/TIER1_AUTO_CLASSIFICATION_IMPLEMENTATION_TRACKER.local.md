# Rank 4 (Automatic Knowledge Classification) — Implementation Tracker
### Tier 1 Completion Plan — Classification Engine

> **For AI agents:** This file is the source of truth for task status on Rank 4. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Unlike earlier Tier 1 blocks (`CKA_IMPLEMENTATION_TRACKER.md`, `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md`, `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md`), this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Simran**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `TIER1_COMPLETION_PLAN.md` §6 for why this now runs in parallel with Rank 3 and Rank 8 rather than as a sequential block. `TIER1_DAY_BY_DAY_SCHEDULE.md` for the current schedule (self-paced, not day-by-day). `REQUIREMENTS_AUTO_CLASSIFICATION.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **Coordination note (not a task dependency, but blocking before `8-A`):** the `Document` status value contract (`pending_classification` → `needs_review` → `published`) must be agreed with Johurul (owner of `TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`) before this feature's migration lands — see `REQUIREMENTS_AUTO_CLASSIFICATION.md`'s Interface Contract section. This is a naming agreement, not shared code; nothing else in this tracker depends on Rank 3's implementation. Note that the Needs-Review queue UI itself is Rank 3's task (`7-E`/`7-F`), not this tracker's — this feature only needs to produce correct signals for that queue to read.

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

## Milestone 8 — Rank 4 (Automatic Knowledge Classification)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `8-A` | Own Migration | `TODO` | Simran | — | | |
| `8-B` | Category Classification | `TODO` | Simran | `8-A` | | |
| `8-C` | Department Suggestion | `TODO` | Simran | `8-B` | | |
| `8-D` | Duplicate / Near-Duplicate Detection | `TODO` | Simran | `8-A` | | |
| `8-E` | Lifecycle Staleness Suggestion | `TODO` | Simran | `8-A` | | |
| `8-F` | Re-classification on Update | `TODO` | Simran | `8-B`, `8-C`, `8-D` | | |
| `8-G` | Integration Testing | `TODO` | Simran | `8-C`, `8-D`, `8-E`, `8-F` | | |
| `8-H` | PR + Cross-Review | `TODO` | Simran | `8-G` | | |

---

### Task 8-A — Own Migration
- **Status:** `TODO`
- **Objective:** Land this feature's schema. Fully self-contained — no shared Day-1 gate with another owner, since Rank 3's migration touches different `Document` columns and can merge in either order (see Interface Contract in `REQUIREMENTS_AUTO_CLASSIFICATION.md`). The only prerequisite is the status-contract naming agreement with Johurul (see header note).
- **Key files to create/modify:**
  - `prisma/schema.prisma` — `Document + categoryConfidence Float?` / `+ classificationStatus String?`, new `DocumentDuplicate` model. Exact shape in `REQUIREMENTS_AUTO_CLASSIFICATION.md` → Data Model Impact.
  - New migration file.
  - Before writing this migration, check whether `Topic`/`TopicDocument` (already in schema) can be reused/extended for category classification instead of introducing a parallel concept (per the doc's note under Data Model Impact) — decide and record the reasoning here.
- **Acceptance criteria:** `prisma migrate status` shows schema up to date; existing upload/chunk/embed/summarize flow unaffected.
- **Reminder (per `feedback_prisma_migrate_diff_shadow_db.md`-style incident earlier in this project):** never pass the live shared-dev `DATABASE_URL` as `--shadow-database-url` for `prisma migrate diff` — use a separate, empty scratch database. Pull latest `dev` and rebase before opening this migration's PR.

### Task 8-B — Category Classification
- **Status:** `TODO`
- **Objective:** FR-1 — classify a document into exactly one category from the existing taxonomy (Policies, SOPs, Reports, Meeting Knowledge, Product Knowledge, Historical Documents, Other) during the worker `chunk`/`summarize` stage, storing a `categoryConfidence` score. Below-threshold confidence leaves `category = null` ("Uncategorized"), not a guess.
- **Key files to create/modify:**
  - `worker/classify.js` (new) — classification LLM call, wired into the existing worker pipeline alongside `summarizeChunks`. One additional LLM call per document max (cost-control NFR).
  - Must run for both `scope=repository` and `scope=project` documents promoted later to org scope.
- **Acceptance criteria:** a newly uploaded repository document receives a `category` (or is explicitly left "Uncategorized") without any user input.
- **Open question to resolve during implementation:** per-document or per-chunk-then-aggregate classification (spreadsheets with multiple sheets may need per-sheet category) — see requirements doc Open Question #1.

### Task 8-C — Department Suggestion
- **Status:** `TODO`
- **Objective:** FR-2 — suggest a `departmentId` from document content and the uploader's `DepartmentMember` memberships. Advisory only; never silently overrides an explicitly-chosen department. Skip entirely if the org has zero departments.
- **Acceptance criteria:** a department suggestion is computed and stored, ready for the Needs-Review queue (Rank 3) to display.

### Task 8-D — Duplicate / Near-Duplicate Detection
- **Status:** `TODO`
- **Objective:** FR-3 — compare the new document's embedding against existing `scope=repository` documents in the org; flag matches above a similarity threshold as a possible duplicate, never a hard rejection.
- **Acceptance criteria:** uploading a document near-identical to an existing one creates a `DocumentDuplicate` row flagging it, not a silent rejection.
- **Open question to resolve during implementation:** does duplicate detection compare against `scope=project` org-promoted documents too, or only `scope=repository` — see requirements doc Open Question #3.

### Task 8-E — Lifecycle Staleness Suggestion
- **Status:** `TODO`
- **Objective:** FR-4 — periodic batch job flagging `published` documents uncited/unaccessed for N days as `archived`-candidates. Suggestion-only, surfaced as a dismissible signal in the Repository UI lifecycle filter; never an automatic transition.
- **Open question to resolve during implementation:** staleness window (N days) — configurable per org or fixed default, see requirements doc Open Question #4.

### Task 8-F — Re-classification on Update
- **Status:** `TODO`
- **Objective:** FR-5 — if a document's content is replaced (re-upload, same filename/id), re-run category/department/duplicate detection (`8-B`–`8-D`) against the new content.
- **Acceptance criteria:** a content-replaced document gets fresh classification results, not stale ones from the original upload.

### Task 8-G — Integration Testing
- **Status:** `TODO`
- **Objective:** Verify classification signals (`categoryConfidence`, `classificationStatus`, `DocumentDuplicate`) are correct and readable by Rank 3's Needs-Review queue. No existing upload/chat/search flow should regress in latency or correctness (NFR).
- **Notes:** if Rank 3's PR (`TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`) hasn't merged yet, verify these signals are written correctly via direct DB query rather than blocking this feature's PR on the queue UI being live — the queue's own tracker verifies the display/action side.

### Task 8-H — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Have at least one other person (Johurul or Sandeep) review before merge to `dev`, per this project's standard close-out practice.

---

## Deferred (this feature) — Tracked for Fast-Follow

Not tasks in this milestone; listed so they aren't lost.

| Item | Why deferred | Where specified |
|---|---|---|
| Cross-document relationship mapping, topic graphs, expertise discovery | Separate feature | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` (Rank 8) |
| Needs-Review queue UI and its actions | Owned by Rank 3, not this feature | `REQUIREMENTS_INGESTION_PIPELINE.md` |
| Who reviews the Needs-Review queue (`super_admin` only vs. also `dept_admin`) | Open question, RBAC decision owned by Rank 3 | `REQUIREMENTS_AUTO_CLASSIFICATION.md` Open Question #2 |
