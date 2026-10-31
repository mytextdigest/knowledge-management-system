# Requirements: Topic Evolution Tracking

**Capability:** Topic Evolution Tracking
**PRD Rank:** 16 (Tier 2 — Organizational Intelligence)
**Owner:** Johurul — full feature end-to-end, one PR.
**Purpose:** Monitor how knowledge changes over time — show that "Authentication" meant something different (in volume, vocabulary, or contributors) six months ago than it does today, instead of only ever showing a topic's current snapshot.

---

## Problem Statement

Unlike every other Tier-2 feature so far, this one is **not "extend an existing v0"** — it is closer to Lessons Learned Intelligence's starting position (genuinely new ground), and in one specific way it is worse: there is no existing data to report on at all, because the system that produces topics has never kept history.

- `Topic` (`prisma/schema.prisma`) has exactly one timestamp field beyond creation — `updatedAt @updatedAt` — which is overwritten on every mutation, not appended to. `centroidEmbedding`, `keywordDistribution`, and `documentCount` are all live, current-state values with no prior-state retained anywhere.
- `TopicDocument.assignedAt` is set once at creation and is **never updated** when a document's topic assignment changes (`worker/cluster.js`'s `classifyDocument()`/`classifyRepositoryDocument()` update `topicId`/`confidence` on reassignment via upsert, but not `assignedAt`) — so it answers "when did this document join its *current* topic" only if it has never been reassigned, and cannot reconstruct "when did it leave topic X" at all.
- `worker/cluster.js`'s `adjustTopicOnDocumentRemoval()` **deletes** a `Topic` row outright once its `documentCount` drops to ≤1 — meaning a topic's entire identity, and any history attached to it, can vanish silently today. Any evolution-tracking feature must decide explicitly how to handle a topic that no longer exists.
- There are two parallel, non-cross-linked topic systems (project-scope via `classifyDocument()`, repository-scope via `classifyRepositoryDocument()`) for the same document, and this feature must decide which one(s) it tracks evolution for, rather than silently picking one.
- `KnowledgeGap` (`prisma/schema.prisma`, fields: `orgId`, `topic` (free text), `gapScore`, `occurrenceCount`, `zeroCitationCount`, `lowConfidenceCount`, `createdAt`) is schema scaffolding for a later Tier-3+ capability and has **zero references anywhere in application code** today (confirmed: no matches in `worker/`, `src/lib/`, `src/app/api/`). It is a useful shape precedent — a per-topic, per-period scalar snapshot row — but not a working system this feature can build on; it is not wired to anything.
- There is no periodic/scheduled job infrastructure anywhere in this codebase today (`worker/index.js`'s queue is event-triggered by ingestion, not cron-based). This feature is the first to need "compute a snapshot on a schedule," not "compute a snapshot when a document arrives."

This means the feature's real prerequisite work is data-model and job-infrastructure decisions, not UI composition — the opposite shape from Rank 15 (Project Intelligence), which had almost everything it needs already computed.

---

## Scope

In scope:
- A new, append-only snapshot mechanism that captures a topic's state (at minimum: `documentCount`, a keyword/vocabulary summary, contributor/expert count) at points in time, so change over time becomes queryable rather than only ever showing the current row.
- A decision on which topic scope(s) (`project`, `repository`, or both) this feature tracks, and how a deleted/merged topic's history is retained or explicitly discarded.
- A trend view — per topic, a simple over-time chart/summary (volume growth, vocabulary drift, new vs. departed contributors) — following the existing dashboard pattern (`GET /api/org/[orgId]/health` for precedent on "aggregate into a page admins/users already check").
- The minimum scheduling mechanism needed to populate snapshots periodically (a cron-style job is explicitly new infrastructure for this codebase — see Open Questions for how minimal v1 can be).

Out of scope (handled elsewhere or explicitly deferred):
- Real-time/streaming trend detection — snapshots on a period (e.g. daily/weekly) are sufficient; this is not a live-updating dashboard.
- Knowledge Gap Detection (a later, unscoped Tier-3+ rank per the PRD) — `KnowledgeGap`'s existing schema is a shape precedent only, not something this feature is required to wire up or share ownership of.
- Reconciling the two parallel topic-classification systems (project-scope vs. repository-scope) into one — Rank 12/13 both already treat them as parallel/complementary rather than a problem to fix; this feature tracks evolution within whichever scope(s) it targets, it does not merge the systems.
- Rank 15's project-centric topic display — this feature is topic-centric and cross-project/org-wide by default; a project-scoped view of its output may be a natural FR-1-of-Rank-15-style follow-on, but is not built here.
- Predicting future topic trends (forecasting) — this is retrospective monitoring ("how did it change"), not predictive analytics.

---

## Interface Contract with Automatic Knowledge Classification (Tier 1 Rank 4)

This feature reads `Topic`/`TopicDocument` state; it does not change `worker/cluster.js`'s classification logic (`classifyDocument()`, `classifyRepositoryDocument()`, centroid/keyword merge-on-assignment, or `adjustTopicOnDocumentRemoval()`'s delete-on-empty behavior). Snapshot capture is a new, separate read/write path that observes the existing classification system's output on a schedule — it must not slow down or block the synchronous ingestion path that classification already runs on.

## Interface Contract with Expert Discovery (Rank 9)

Contributor/expert-count trend data (if included in a topic's snapshot, per FR-2) reads `TopicExpertise` as of the snapshot time; it does not modify `TopicExpertise`'s scoring or confirmation flow.

---

## Functional Requirements

### FR-1 — Topic Snapshot Model
- A new, append-only table (e.g. `TopicSnapshot`: `topicId` *(nullable — see FR-4)*, `orgId`, `scope`, `capturedAt`, `documentCount`, a compact keyword/vocabulary summary, `expertCount`) written periodically, never mutated after creation. This is additive schema — no existing `Topic`/`TopicDocument` field or behavior changes.

### FR-2 — Snapshot Capture Job
- A job that, on a defined period (see Open Questions for cadence), writes one `TopicSnapshot` row per active topic (per the scope decided in Scope) capturing its then-current `documentCount`, a keyword summary derived from `keywordDistribution`, and an expert count derived from `TopicExpertise`. Must not run inline with document ingestion — it is a separate, scheduled pass, not a per-upload side effect.

### FR-3 — Topic Trend View
- A per-topic view showing its snapshot history: volume over time (`documentCount` series), vocabulary drift (keyword-summary diff between snapshots), and contributor change (`expertCount` series, and — if feasible — which specific experts were gained/lost between two snapshots). Reachable from the existing Expert Discovery/topic-browsing surfaces, not a wholly separate, undiscoverable page.

### FR-4 — Topic Lifecycle Handling
- When a `Topic` row is deleted (`adjustTopicOnDocumentRemoval()`'s delete-on-empty path) or effectively superseded/merged, its prior `TopicSnapshot` rows are retained (not cascade-deleted) so history survives the topic's disappearance — `TopicSnapshot.topicId` must tolerate its `Topic` no longer existing (nullable FK with `onDelete: SetNull`, or a denormalized `topicName` captured at snapshot time so the row remains meaningful without a live join). The trend view (FR-3) must handle and clearly label a topic that no longer exists as "retired," not silently drop its history or error.

### FR-5 — Scope Decision Documentation
- The choice of which topic scope(s) (`project`, `repository`, or both) this feature tracks is made explicitly and recorded in this feature's tracker before FR-1 schema work starts, not left implicit in whatever the first implementation happens to query.

---

## Non-Functional Requirements

- RBAC: a topic's trend data must not be visible to a user who couldn't access the underlying documents contributing to it — reuse existing `scope`/`orgId`/`projectId`-based access checks (`accessSql()`-style pattern), consistent with every other Tier-2 feature's access model.
- FR-2's job must be idempotent and safe to run more than once for the same period (e.g. a retried or manually re-triggered run must not produce duplicate snapshot rows for the same `topicId`/`capturedAt` period) — no existing scheduling infrastructure exists in this codebase to guarantee exactly-once execution, so the job itself must guard against double-writes.
- No backfill of historical snapshots is required or possible — this feature can only start observing from whenever FR-2 first runs. Trend views must degrade gracefully (e.g. "not enough history yet") for a topic with fewer than two snapshots, not error.
- Must not slow down or block existing document ingestion, classification (`worker/cluster.js`), or clustering re-runs (`POST /api/projects/[id]/recluster`) — snapshot capture is decoupled from all of them.

---

## Data Model Impact (as implemented — see Open Questions' "Implementation-time schema deviation" note)

```
model TopicSnapshot {
  id             String   @id @default(cuid())
  topicRef       String                     // stable grouping identity, set once at first capture — survives Topic deletion (FR-4)
  topicId        String?                    // nullable FK — null once the live Topic row is deleted; "is this topic still alive"
  topicName      String                     // denormalized at capture time, so history is readable after topicId goes null
  orgId          String
  scope          String                     // "repository" for v1 (Open Question 3)
  periodStart    DateTime                   // start of the captured ISO week — the actual idempotency key
  capturedAt     DateTime @default(now())
  documentCount  Int
  expertCount    Int      @default(0)
  keywordSummary Json?                      // top-15 keywordDistribution entries at capture time
  departmentIds  String[] @default([])      // distinct non-null contributing-document departmentIds at capture time — RBAC only
  hasUnrestrictedDoc Boolean @default(false) // true if any contributing document had departmentId IS NULL at capture time — RBAC only

  topic        Topic?       @relation(fields: [topicId], references: [id], onDelete: SetNull)
  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([topicRef, periodStart])
  @@index([topicRef, capturedAt])
  @@index([orgId, scope, capturedAt])
}
```
One new model, purely additive. No existing table's schema changes. No backfill possible or required (Non-Functional Requirements). Migration: `prisma/migrations/20260929000000_add_topic_snapshot/`.

---

## Open Questions

1. ~~**Snapshot cadence.**~~ **Resolved (2026-09-29):** weekly, keyed to the ISO week start (Monday 00:00 UTC) — matches the PRD's "Monthly" typical-usage cadence at cheaper-than-daily granularity.
2. ~~**Scheduling mechanism.**~~ **Resolved (2026-09-29):** no in-process interval, no new subsystem. This codebase already has the exact precedent needed: `scripts/task-8/flag-stale-documents.mjs` and `scripts/task-5d/detect-knowledge-gaps.mjs` are standalone scripts invoked periodically by an external ops-level scheduler, not built-in cron. Implemented the same way as `scripts/task-17/capture-topic-snapshots.mjs` (`npm run task17:capture-snapshots`).
3. ~~**Scope to track (FR-5).**~~ **Resolved (2026-09-29):** repository-scope only, per this doc's own recommendation. Also confirmed to be the only scope `refreshTopicExpertise()` populates `TopicExpertise` for today, so `expertCount` is meaningful without any Rank 15-style expert-computation gap-closing.
4. ~~Should FR-3's "vocabulary drift" be a simple keyword-set diff...~~ **Resolved (2026-09-29):** simple top-keyword-set diff (added/dropped) between adjacent snapshots, computed at read time.
5. ~~Does closing this feature's data gap retroactively benefit a future Knowledge Gap Detection capability...~~ **Resolved (2026-09-29):** no — `TopicSnapshot` is shaped only for this feature's own FR-3 needs.

**Implementation-time schema deviation (recorded 2026-09-29, see tracker `17-A`/`17-B` for full reasoning):** the schema below was extended past this section's original proposal. `topicId String?` alone can't serve as the trend view's grouping key, because `onDelete: SetNull` nulls every retired topic's snapshot rows to the same indistinguishable `null`. Added `topicRef String` (stable, set once, the real grouping identity — `topicId` is now only "is this topic still alive"), `periodStart DateTime` (the actual idempotency key FR-2's "same period" language needs — `capturedAt` alone never collides on a retry), and `departmentIds String[]` / `hasUnrestrictedDoc Boolean` (a denormalized RBAC footprint, since a retired topic's `TopicDocument` rows are cascade-deleted along with it and can no longer answer "who could access this topic's documents").

---

## Acceptance Criteria (draft)

- `TopicSnapshot` rows accumulate over time for tracked topics without mutating or requiring changes to `Topic`/`TopicDocument`.
- A topic with at least two snapshots shows a trend view: volume change, vocabulary drift, and contributor change.
- A topic with fewer than two snapshots shows a graceful "not enough history yet" state, not an error.
- A deleted/retired `Topic` row's prior snapshots remain visible and clearly labeled as retired, not lost or errored on.
- The snapshot capture job runs on a schedule independent of document ingestion and does not slow down upload/classification.
- Re-running the snapshot job for a period already captured does not create duplicate rows.
- No user sees trend data for a topic whose underlying documents they couldn't otherwise access.
- The project-vs-repository-vs-both scope decision (FR-5) is explicitly recorded before implementation, not inferred after the fact from what shipped.
