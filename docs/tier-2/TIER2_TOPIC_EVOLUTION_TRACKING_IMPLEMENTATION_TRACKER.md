# Rank 16 (Topic Evolution Tracking) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 16. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for every other Tier 2 feature, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Johurul**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_TOPIC_EVOLUTION_TRACKING.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **This is genuinely new ground, not an extension.** Unlike Ranks 12–15, there is no existing history/snapshot data for this feature to build on — `Topic`/`TopicDocument` only ever hold current state, and this codebase has no periodic-job infrastructure today. Read the requirements doc's Problem Statement before starting — the schema and scheduling decisions in `17-A` block everything else.

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

## Milestone 17 — Rank 16 (Topic Evolution Tracking)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `17-A` | Resolve Open Questions 1–5 | `TODO` | Johurul | — | | |
| `17-B` | Topic Snapshot Model — Schema + Migration (FR-1) | `TODO` | Johurul | `17-A` | | |
| `17-C` | Snapshot Capture Job (FR-2) | `TODO` | Johurul | `17-B` | | |
| `17-D` | Topic Lifecycle Handling (FR-4) | `TODO` | Johurul | `17-B` | | |
| `17-E` | Topic Trend View (FR-3) | `TODO` | Johurul | `17-C`, `17-D` | | |
| `17-F` | Integration Validation | `TODO` | Johurul | `17-E` | | |
| `17-G` | PR + Cross-Review | `TODO` | Johurul | `17-F` | | |

---

### Task 17-A — Resolve Open Questions 1–5
- **Status:** `TODO`
- **Objective:** Decide snapshot cadence, the scheduling mechanism (in-process interval vs. a real scheduler — this codebase has neither today), which topic scope(s) to track, the vocabulary-drift metric, and whether to shape the schema for a future Knowledge Gap Detection capability (recommendation: no). These decisions gate `17-B` onward.
- **Key files:** `worker/index.js` (current queue/event-driven model, for scheduling-mechanism context), `prisma/schema.prisma` (`KnowledgeGap`, shape precedent only).
- **Acceptance criteria:** all five decisions recorded in this tracker's notes before `17-B` begins.

### Task 17-B — Topic Snapshot Model: Schema + Migration
- **Status:** `TODO`
- **Objective:** FR-1 — add the new, additive `TopicSnapshot` model per the requirements doc's Data Model Impact section, with a nullable `topicId` and denormalized `topicName` so history survives topic deletion (see `17-D`).
- **Key files:** `prisma/schema.prisma`, new migration under `prisma/migrations/`.
- **Acceptance criteria:** migration applies cleanly with no backfill step; no existing `Topic`/`TopicDocument` field or behavior changes.

### Task 17-C — Snapshot Capture Job
- **Status:** `TODO`
- **Objective:** FR-2 — a scheduled (per `17-A`'s cadence/mechanism decision) job that writes one `TopicSnapshot` row per active topic in the chosen scope, capturing `documentCount`, a keyword summary, and an expert count from `TopicExpertise`. Must be idempotent per period (no duplicate rows on a retried/re-triggered run) and must not run inline with ingestion.
- **Key files:** `worker/cluster.js` (read-only reference for `Topic`/`TopicDocument` shape), new job file (location depends on `17-A`'s scheduling-mechanism decision).
- **Acceptance criteria:** running the job twice for the same period produces no duplicate `TopicSnapshot` rows; ingestion/classification/recluster latency is unaffected.

### Task 17-D — Topic Lifecycle Handling
- **Status:** `TODO`
- **Objective:** FR-4 — ensure a `Topic` row's deletion (`adjustTopicOnDocumentRemoval()`'s delete-on-empty path) does not cascade-delete its `TopicSnapshot` history; the trend view must be able to render a retired topic's history using the denormalized `topicName` alone.
- **Key files:** `worker/cluster.js` (`adjustTopicOnDocumentRemoval()`), `prisma/schema.prisma` (`TopicSnapshot.topic` relation `onDelete: SetNull`).
- **Acceptance criteria:** deleting a `Topic` (via the existing empty-topic cleanup path) leaves its prior `TopicSnapshot` rows intact and queryable, labeled as belonging to a retired topic.

### Task 17-E — Topic Trend View
- **Status:** `TODO`
- **Objective:** FR-3 — a per-topic view of its snapshot history: volume series, vocabulary drift (per `17-A`'s chosen diff metric), and contributor change. Reachable from existing Expert Discovery/topic-browsing surfaces. Must degrade gracefully (not error) for a topic with fewer than two snapshots.
- **Key files:** new page/component under an existing topic-browsing surface (exact location depends on `17-A`'s scope decision — likely alongside Expert Discovery's repository-scope topic browsing if that scope is chosen).
- **Acceptance criteria:** a topic with ≥2 snapshots shows volume/vocabulary/contributor trend; a topic with <2 snapshots shows a graceful "not enough history yet" state; a retired topic's history is visible and clearly labeled.

### Task 17-F — Integration Validation
- **Status:** `TODO`
- **Objective:** Full regression pass — confirm no ingestion/classification/recluster latency regression, confirm RBAC on trend data matches underlying document access, confirm the capture job's idempotency under a simulated re-run, confirm retired-topic history handling.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_TOPIC_EVOLUTION_TRACKING.md` verified.

### Task 17-G — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on the scheduling mechanism (`17-A`/`17-C`, since it's new infrastructure for this codebase) and the topic-lifecycle/retired-topic handling (`17-D`).
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the scheduling mechanism and lifecycle-handling decisions.
