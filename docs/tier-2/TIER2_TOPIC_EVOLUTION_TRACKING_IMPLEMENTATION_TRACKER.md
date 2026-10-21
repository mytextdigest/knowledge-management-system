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
| `17-A` | Resolve Open Questions 1–5 | `DONE` | Johurul | — | 2026-09-29 | 2026-09-29 |
| `17-B` | Topic Snapshot Model — Schema + Migration (FR-1) | `DONE` | Johurul | `17-A` | 2026-09-29 | 2026-09-29 |
| `17-C` | Snapshot Capture Job (FR-2) | `DONE` | Johurul | `17-B` | 2026-09-29 | 2026-09-29 |
| `17-D` | Topic Lifecycle Handling (FR-4) | `DONE` | Johurul | `17-B` | 2026-09-29 | 2026-09-29 |
| `17-E` | Topic Trend View (FR-3) | `DONE` | Johurul | `17-C`, `17-D` | 2026-09-29 | 2026-09-29 |
| `17-F` | Integration Validation | `IN_PROGRESS` | Johurul | `17-E` | 2026-09-29 | |
| `17-G` | PR + Cross-Review | `TODO` | Johurul | `17-F` | | |

---

### Task 17-A — Resolve Open Questions 1–5
- **Status:** `DONE`
- **Objective:** Decide snapshot cadence, the scheduling mechanism (in-process interval vs. a real scheduler — this codebase has neither today), which topic scope(s) to track, the vocabulary-drift metric, and whether to shape the schema for a future Knowledge Gap Detection capability (recommendation: no). These decisions gate `17-B` onward.
- **Key files:** `worker/index.js` (current queue/event-driven model, for scheduling-mechanism context), `prisma/schema.prisma` (`KnowledgeGap`, shape precedent only).
- **Acceptance criteria:** all five decisions recorded in this tracker's notes before `17-B` begins.
- **Decisions recorded 2026-09-29:**
  1. **Cadence:** weekly. `capturedAt`/`periodStart` key off the ISO week start (Monday 00:00 UTC), matching the PRD's "Monthly" usage cadence at a cheaper-than-daily granularity.
  2. **Scheduling mechanism:** no in-process interval, no new subsystem. Found real precedent already in this codebase for exactly this shape of problem: `scripts/task-8/flag-stale-documents.mjs` and `scripts/task-5d/detect-knowledge-gaps.mjs` are both standalone scripts invoked periodically by an external ops-level scheduler, not built-in cron. `scripts/task-17/capture-topic-snapshots.mjs` follows the same pattern, wired to `npm run task17:capture-snapshots`.
  3. **Scope tracked:** repository-scope only, per the doc's own recommendation — also the only scope `refreshTopicExpertise()` ever populates `TopicExpertise` for today, so `expertCount` is meaningful without any Rank 15-style gap-closing work.
  4. **Vocabulary drift metric:** simple top-keyword-set diff (added/dropped) between chronologically adjacent snapshots, computed at read time in `getTopicTrendWithPrisma` — not precomputed/stored.
  5. **Knowledge Gap Detection shaping:** no — `TopicSnapshot` is shaped only for this feature's own FR-3 needs.
  - **Schema deviation from this doc's original proposal, recorded here per 17-A's own convention:** the proposed schema's single `topicId String?` cannot serve as the trend view's grouping key, because once a topic is deleted `onDelete: SetNull` nulls every one of its snapshot rows' `topicId` to the same `null` — indistinguishable from any other retired topic. Added `topicRef String` (non-nullable, set once at first capture, never changed) as the actual grouping identity; `topicId` remains as the live FK used only to detect "is this topic still alive." Also added `periodStart DateTime` (the idempotency key — `capturedAt` alone would never collide on a re-run) and `departmentIds String[]` / `hasUnrestrictedDoc Boolean` (denormalized RBAC footprint — see `17-D`'s note for why this is necessary). See `src/lib/topicSnapshotQuery.mjs`'s header comment for the full reasoning.

### Task 17-B — Topic Snapshot Model: Schema + Migration
- **Status:** `DONE`
- **Objective:** FR-1 — add the new, additive `TopicSnapshot` model per the requirements doc's Data Model Impact section, with a nullable `topicId` and denormalized `topicName` so history survives topic deletion (see `17-D`).
- **Key files:** `prisma/schema.prisma`, new migration under `prisma/migrations/`.
- **Acceptance criteria:** migration applies cleanly with no backfill step; no existing `Topic`/`TopicDocument` field or behavior changes.
- **Notes:** implemented as `prisma/migrations/20260929000000_add_topic_snapshot/` — one new table only, applied via `prisma migrate deploy` against the Neon dev DB (`prisma migrate diff` against the live schema also surfaced an unrelated pre-existing `Chunk_embedding_vec_idx` drop, which was deliberately excluded from this migration — not this feature's drift to fix). See `17-A`'s note for the two fields (`topicRef`, `periodStart`) and the RBAC pair (`departmentIds`, `hasUnrestrictedDoc`) added beyond the doc's original proposal.

### Task 17-C — Snapshot Capture Job
- **Status:** `DONE`
- **Objective:** FR-2 — a scheduled (per `17-A`'s cadence/mechanism decision) job that writes one `TopicSnapshot` row per active topic in the chosen scope, capturing `documentCount`, a keyword summary, and an expert count from `TopicExpertise`. Must be idempotent per period (no duplicate rows on a retried/re-triggered run) and must not run inline with ingestion.
- **Key files:** `worker/cluster.js` (read-only reference for `Topic`/`TopicDocument` shape), new job file (location depends on `17-A`'s scheduling-mechanism decision).
- **Acceptance criteria:** running the job twice for the same period produces no duplicate `TopicSnapshot` rows; ingestion/classification/recluster latency is unaffected.
- **Notes:** implemented as `scripts/task-17/capture-topic-snapshots.mjs`, wired to `npm run task17:capture-snapshots` (optional `-- --org=<id>` filter). Verified by hand against the real dev DB (2026-09-29): ran twice back-to-back against all 4 existing repository-scope topics — second run produced the same 4 rows (upsert on `[topicRef, periodStart]`), no duplicates. `expertCount` excludes `TopicExpertise` rows with `source: "dismissed"`, matching `refreshTopicExpertise()`'s own treatment of dismissed rows as inactive. Top 15 keywords by weight are kept in `keywordSummary`.

### Task 17-D — Topic Lifecycle Handling
- **Status:** `DONE`
- **Objective:** FR-4 — ensure a `Topic` row's deletion (`adjustTopicOnDocumentRemoval()`'s delete-on-empty path) does not cascade-delete its `TopicSnapshot` history; the trend view must be able to render a retired topic's history using the denormalized `topicName` alone.
- **Key files:** `worker/cluster.js` (`adjustTopicOnDocumentRemoval()`), `prisma/schema.prisma` (`TopicSnapshot.topic` relation `onDelete: SetNull`).
- **Acceptance criteria:** deleting a `Topic` (via the existing empty-topic cleanup path) leaves its prior `TopicSnapshot` rows intact and queryable, labeled as belonging to a retired topic.
- **Notes:** required zero changes to `adjustTopicOnDocumentRemoval()` or its `src/lib/topicUtils.js`/`moveDocumentToTopic()` counterpart — the DB-level FK's `ON DELETE SET NULL` fires on any `prisma...topic.delete()` regardless of call site (confirmed there are four: `worker/cluster.js` ×2, `src/lib/topicUtils.js` ×2, plus the admin `DELETE /api/projects/[id]/topics/[topicId]` route). Verified by hand (2026-09-29) with a throwaway Organization/Topic/TopicSnapshot fixture: created a snapshot, deleted its Topic, confirmed the snapshot row survived with `topicId` nulled and `topicRef`/`topicName` unchanged, then cleaned up the fixture — no dev data touched. RBAC-for-retired-topics gap (losing the live `TopicDocument` join once `Topic`/`TopicDocument` rows cascade away) closed via the `departmentIds`/`hasUnrestrictedDoc` denormalization from `17-A`/`17-B` — see `src/lib/topicSnapshotQuery.mjs`.

### Task 17-E — Topic Trend View
- **Status:** `DONE`
- **Objective:** FR-3 — a per-topic view of its snapshot history: volume series, vocabulary drift (per `17-A`'s chosen diff metric), and contributor change. Reachable from existing Expert Discovery/topic-browsing surfaces. Must degrade gracefully (not error) for a topic with fewer than two snapshots.
- **Key files:** new page/component under an existing topic-browsing surface (exact location depends on `17-A`'s scope decision — likely alongside Expert Discovery's repository-scope topic browsing if that scope is chosen).
- **Acceptance criteria:** a topic with ≥2 snapshots shows volume/vocabulary/contributor trend; a topic with <2 snapshots shows a graceful "not enough history yet" state; a retired topic's history is visible and clearly labeled.
- **Notes:** `GET /api/org/[orgId]/topics/trend` (browse list, live + retired) and `GET /api/org/[orgId]/topics/trend/[topicRef]` (detail), backed by `src/lib/topicSnapshotQuery.mjs`. One page, `src/app/(app)/org/[orgId]/topics/trend/page.jsx` (the browse list) — clicking a topic opens `TopicTrendModal` (`src/components/topics/TopicTrendModal.jsx`) in place rather than navigating to a separate detail page (per user request, 2026-10-01; the earlier `.../trend/[topicRef]/page.jsx` route was removed). The modal shows a skeleton loader (`ChartSkeleton`) while its detail fetch is in flight. `TopicTrendChart` (`src/components/topics/TopicTrendChart.jsx`) renders volume and expert-count as two separate single-axis line charts (not one dual-axis chart) plus an accessible data-table fallback. Reachability: a "Topic Evolution" link was added to the Experts page header. **Scope notes:** (1) FR-3's parenthetical "if feasible" per-user gained/lost contributor detail was not built — `TopicSnapshot.expertCount` is a scalar count only (matching this doc's own Data Model Impact proposal), so only the count-over-time series is shown, not which specific people changed. (2) FR-3's vocabulary-drift UI (added/dropped keyword badges) was built and is still computed/returned by the API (`series[i].vocabularyDrift`), but is deliberately not rendered in the modal — removed from the UI per user request (2026-10-01) to keep the demo simpler; the data is still there if a future UI wants to surface it again.

### Task 17-F — Integration Validation
- **Status:** `IN_PROGRESS`
- **Objective:** Full regression pass — confirm no ingestion/classification/recluster latency regression, confirm RBAC on trend data matches underlying document access, confirm the capture job's idempotency under a simulated re-run, confirm retired-topic history handling.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_TOPIC_EVOLUTION_TRACKING.md` verified.
- **Preliminary testing done (2026-09-29), all via DB dry-run against real dev data / disposable fixtures, no browser automation:**
  - `npx prisma migrate deploy` applied cleanly (no unrelated drift bundled in).
  - `npm run task17:capture-snapshots` run against the real dev DB's 4 existing repository-scope topics — wrote 4 rows; run a second time immediately after — still exactly 4 rows (idempotency confirmed).
  - Lifecycle: created a throwaway Organization/Topic/TopicSnapshot fixture, deleted the Topic, confirmed the snapshot's `topicId` was nulled by the FK while `topicRef`/`topicName` survived; fixture cleaned up (no dev data left behind).
  - `npm run task17:test` — 14/14 tests pass (7 static structural checks + 7 RBAC/trend logic checks against a fake in-memory Prisma double covering: retired-topic public access, retired-topic department-gated deny, live-topic department-member allow, never-captured-ref deny, <2-snapshot "not enough history," vocabulary-drift add/drop across a retired topic, and unauthorized-viewer null result).
  - `npx next build` — production build compiles cleanly with both new routes/pages registered.
  - Confirmed by inspection (not changed): `worker/cluster.js` and `src/lib/topicUtils.js` are untouched — this feature added no code to the ingestion/classification/recluster path, so there is nothing there that could regress its latency.
- **Still needed before this task can move to `DONE` (end-to-end, by Johurul):**
  - Real browser walkthrough: Experts page → "Topic Evolution" link → list → click a topic to open its modal (skeleton shows briefly, then chart renders, table fallback matches) → (after a second week's capture run, or a manually-inserted second-period snapshot) confirm the two-snapshot trend actually renders as expected, not just the "not enough history" state.
  - A real retired-topic walkthrough: let a real dev-DB topic naturally drop to its last document (or reuse the delete-topic admin route) and confirm the "Retired" badge and preserved history render correctly in the browser, not just via the DB-level fixture check above.
  - Confirm RBAC in the browser with a non-admin, department-scoped account: a department-scoped topic's trend should 404 for a user outside that department and load for one inside it.
  - Decide whether `npm run task17:capture-snapshots` actually gets wired into the ops scheduler that already runs `task5d:gaps`/`task8:stale` (infra-level follow-up, outside this repo).
- **Demo data (2026-10-01):** org "NGI" (`nexgeninnovation2018@gmail.com`'s actual org, orgId `cmsgu4ezz0000l404xf9nel8h`) only had one real capture (2026-09-28) for its two repository-scope topics, so the trend view correctly showed "not enough history yet." Backdated 3 additional weekly `TopicSnapshot` rows (2026-09-07, 09-14, 09-21) for both topics, hand-written to tell a plausible before/after story (growing `documentCount`/`expertCount`, shifting `keywordSummary`) ending at the real 2026-09-28 row, which was left untouched. Demo-only — not a general backfill mechanism (this doc's own Non-Functional Requirements still hold: no backfill is possible from real historical data, since none was ever captured before this feature existed).
- **Topic renames (2026-10-01):** the two repository-scope topics' auto-generated names weren't demoable — `Product Requirements` (actually 3 KMS product/architecture overview docs) and `Update Notes` (actually 2 informal team process/tooling-status docs) didn't describe their real content. Renamed directly via `Topic.name` (there's no repository-scope topic-rename API route today — only `PATCH /api/projects/[id]/topics/[topicId]` exists, and it's project-scope-only) to `KMS Platform Overview` and `Team Process & Tooling Notes` respectively, and propagated the new names into every existing `TopicSnapshot.topicName` row (both real and demo) for the same topicRef so the trend view's history doesn't show a stale name on earlier weeks.

### Task 17-G — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on the scheduling mechanism (`17-A`/`17-C`, since it's new infrastructure for this codebase) and the topic-lifecycle/retired-topic handling (`17-D`).
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the scheduling mechanism and lifecycle-handling decisions.
