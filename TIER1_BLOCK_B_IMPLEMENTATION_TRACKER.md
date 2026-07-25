# Rank 1 Phase 3 (Organizational Intelligence Agent) — Implementation Tracker
### Tier 1 Completion Plan — Block B

> **For AI agents:** This file is the source of truth for task status on Block B (Tue 2026-07-28 – Tue 2026-08-04). When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Reference documents:** `TIER1_COMPLETION_PLAN.md` §3 and §5 for the sequencing rationale and the 6-FR committed set. `TIER1_DAY_BY_DAY_SCHEDULE.md` for the plain day-by-day task list this tracker formalizes. `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 section for the full audit (2026-07-25), FR text, file references, and acceptance criteria this tracker's tasks implement.
>
> **Scope discipline:** Phase 3's original roadmap listed 10 FRs (`FR-P3-1` through `FR-P3-10`). **Audited against the real, verified Phase 2 output 2026-07-25** — see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 section for full findings. Four of them are **confirmed out of scope for this block**: `FR-P3-1` Multi-Hop Reasoning and `FR-P3-3` Root Cause Analysis depend on Rank 8's relationship graph (`DocumentRelationship`/`TopicExpertise`, still absent from `prisma/schema.prisma` as of this audit) — deferred to a follow-up pass after Block D, same as `FR-P2-1/3/4`. `FR-P3-5` Autonomous Knowledge Curation and `FR-P3-10` Agentic Task Execution need an explicit guardrails/approval-workflow design that doesn't exist yet — a governance decision, not an engineering task this block can absorb. Do not pull any of the four forward into any task below without updating `TIER1_COMPLETION_PLAN.md` §3 first.
> **File paths and data models below are finalized** as of the 2026-07-25 audit (not placeholders) — `6-A` lands the schema exactly as specified in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`'s Phase 3 Data Model Impact, rather than re-deriving it from scratch on Day 1.

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

## Milestone 6 — Rank 1 Phase 3 (Organizational Intelligence Agent)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `6-A` | Shared Schema | `DONE` | Johurul | — | 2026-07-25 | 2026-07-26 |
| `6-B` | Decision Intelligence + Knowledge Health Monitoring | `TODO` | Johurul | `6-A` | | |
| `6-C` | Predictive Recommendations + Proactive Recommendations | `TODO` | Simran | `6-A` | | |
| `6-D` | Organizational Learning + Workflow Assistance | `TODO` | Sandeep | `6-A` | | |
| `6-E` | Integration & RBAC Regression Check | `TODO` | Johurul | `6-B`, `6-C`, `6-D` | | |
| `6-F` | PR + Cross-Reviews | `TODO` | All 3 | `6-E` | | |

---

### Task 6-A — Shared Schema
- **Status:** `DONE`
- **Objective:** Same Day-1 gate pattern as `4-A`/`5-A` — land the one shared migration everything else depends on, so the other two workstreams can branch immediately after. The FR audit and scope cut are already done (2026-07-25, see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 section) — this task is schema-landing only, not re-auditing.
- **Key files to create/modify:**
  - `prisma/schema.prisma` — add `OrgMessage.feedback String?`, `OrgConversation.activeWorkflowDocumentId String?` + `activeWorkflowStep Int?`, new `KnowledgeGap` model (exact shape in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 → Data Model Impact).
  - New migration file, same hand-written convention as `4-A`/`5-A` (`prisma migrate dev` blocked by drift on the shared DB — see the stray `DATABASE_URL` shell-env caveat `5-A` hit and flagged; check `.env`'s `knowledge_management_db_dev` is actually the active target before running `migrate deploy`).
- **Acceptance criteria:** `prisma migrate status` shows schema up to date; existing Org Chat and Phase 2 flows unaffected until `6-B`/`6-C`/`6-D` start writing to the new fields.
- **Note:** No changes needed to `Decision`, `Entity`, `TimelineEvent`, `DocumentConflict`, or `OrgMemberMemory` — confirmed in the audit that Phase 3 reuses all five as-is.
- **Incident (2026-07-25):** while sanity-checking the migration, `prisma migrate diff --from-migrations ... --shadow-database-url <DATABASE_URL>` was run with the shadow-database URL mistakenly pointed at the live `kms-postgres-dev` instance instead of a scratch database. Prisma wipes/rebuilds whatever it's given as the shadow DB to replay migration history, which emptied `kms-postgres-dev`'s `public` schema (structure intact, all rows gone, `_prisma_migrations` dropped). Recovered via RDS point-in-time restore to a new instance `kms-postgres-dev-restored` (restore point 2026-07-25 18:15 IST / 12:45 UTC), verified row counts and `_prisma_migrations` history matched pre-incident state, then `.env`'s `DATABASE_URL` was repointed at the restored endpoint and the `6-A` migration applied cleanly on top via `prisma migrate deploy`. **Follow-up still open:** decide whether to rename `kms-postgres-dev-restored` back to `kms-postgres-dev` (or update all other references to the new endpoint) and what to do with the original wiped instance — not yet resolved as of this entry. **Rule for future migration work on this DB: never pass the live `DATABASE_URL` as `--shadow-database-url` — always use a separate, empty scratch database for `prisma migrate diff`.**

### Task 6-B — Decision Intelligence + Knowledge Health Monitoring
- **Status:** `TODO`
- **Objective:** Both aggregate signals Johurul already owns from Phase 1 (confidence scores) and Phase 2 (`Decision` tracking, gap/conflict detection). Decision Intelligence (`FR-P3-2`) recommends/evaluates using past decisions as evidence, not just retrieval. Knowledge Health Monitoring (`FR-P3-7`) rolls confidence/gap/conflict signals into one org-level view.
- **Key files to create/modify:**
  - `src/lib/decisionIntelligence.js` (new) — decision-oriented question detection + evidence retrieval over `Decision` rows.
  - `src/app/api/org/[orgId]/chat/route.js` — wire in decision-intent detection alongside the existing `shouldDiversifyAcrossProjects` check.
  - `scripts/task-5d/detect-knowledge-gaps.mjs` — extend to also write `KnowledgeGap` rows (in addition to or instead of the JSON report), so the health endpoint has something to query.
  - `src/app/api/org/[orgId]/health/route.js` (new) — aggregate confidence/conflict/gap signals.
  - `src/app/(app)/org/[orgId]/dashboard/page.jsx` — add a knowledge-health card.
- **Acceptance criteria:** see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 Acceptance Criteria — decision-recommendation and dashboard bullets.
- **Open question to resolve during implementation:** does `detect-knowledge-gaps.mjs` run on a schedule/manual trigger writing fresh `KnowledgeGap` rows, or does `/health` trigger it inline? Recommendation in the requirements doc is scheduled/manual — confirm or override here.

### Task 6-C — Predictive Recommendations + Proactive Recommendations
- **Status:** `TODO`
- **Objective:** A natural pair per `TIER1_COMPLETION_PLAN.md` §5 — both surface content based on patterns/context, sharing one ranking module. Predictive Recommendations (`FR-P3-4`) is the on-request version; Proactive Recommendations (`FR-P3-9`) is the same logic surfaced without a query.
- **Key files to create/modify:**
  - `src/lib/recommendations.js` (new) — shared ranking logic, seeded from `OrgMemberMemory.getRecentMemory` run back through `hybridOrgSearch`.
  - `src/app/api/org/[orgId]/recommendations/route.js` (new) — `FR-P3-4`'s on-request endpoint.
  - `src/app/(app)/project/page.jsx`, department page (`org/[orgId]/department/[deptId]/page.jsx`) — `FR-P3-9`'s "Related to your work" panel, alongside the existing Phase 2 Timeline panel/tab.
- **Acceptance criteria:** see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 Acceptance Criteria — predictive-recommendation and proactive-surfacing bullets.
- **Constraint:** do not duplicate ranking logic between the two FRs — `recommendations.js` is the single source both consume.

### Task 6-D — Organizational Learning + Workflow Assistance
- **Status:** `TODO`
- **Objective:** Organizational Learning (`FR-P3-6`) is a genuinely new feedback mechanism (confirmed nothing exists to extend) feeding a feedback-weighted retrieval boost. Workflow Assistance (`FR-P3-8`) is a guided, non-autonomous walkthrough of procedural documents — explicitly not action execution (that's the deferred `FR-P3-10`).
- **Key files to create/modify:**
  - `src/app/(app)/org/[orgId]/chat/page.jsx` — thumbs up/down control per assistant message.
  - `src/app/api/org/[orgId]/chat/[conversationId]/message/[messageId]/route.js` (new) — `PATCH` to record `OrgMessage.feedback`.
  - `src/lib/hybridSearch.js` (`hybridOrgSearch`) — feedback-weighted ranking boost for previously-helpful citations on similar questions.
  - `worker/summarize.js` (`createStructuredSummary`) / `src/app/api/org/[orgId]/chat/route.js` — sequential-step detection in a document's structured summary; `activeWorkflowDocumentId`/`activeWorkflowStep` read/write on `OrgConversation`, same pattern as Phase 1's `activeTopic`/`activeDocumentId`.
- **Acceptance criteria:** see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 Acceptance Criteria — feedback and step-walkthrough bullets.
- **Open question to resolve during implementation:** minimum-occurrence threshold before a feedback boost applies (recommendation: 3+ similar questions, see requirements doc Open Question #1); step-detection heuristic strictness (recommendation: 3+ sequential items with imperative phrasing, Open Question #2).

### Task 6-E — Integration & RBAC Regression Check
- **Status:** `TODO`
- **Objective:** `6-B`, `6-C`, and `6-D` all touch `chat/route.js` and retrieval — merge and reconcile before testing individually-passing-but-conflicting changes, the same discipline `4-E`/`5-E` used.
- **Notes:** RBAC regression check is mandatory — `FR-P3-2` (decision evidence), `FR-P3-4`/`FR-P3-9` (recommendations), and `FR-P3-7` (health dashboard) all read across documents a user may not individually have access to; confirm every new query path goes through the existing SQL-`WHERE` RBAC pattern or `filterAccessibleDocuments`, never a post-filter. Confirm the three workstreams' edits to `chat/route.js` are additive (new detection blocks, not overwrites of Phase 1/2 logic already there), the same check `5-E` did for `5-B`/`5-C`/`5-D`.

### Task 6-F — PR + Cross-Reviews
- **Status:** `TODO`
- **Objective:** Standard close-out — each person reviews at least one other's work before merge to `dev`. Update this tracker's Milestone 6 table and `TIER1_COMPLETION_PLAN.md`/`TIER1_DAY_BY_DAY_SCHEDULE.md` if anything shipped differently from what was planned — don't let this tracker go stale the way `CKA_IMPLEMENTATION_TRACKER.md`'s `4-E`/`4-F`/`4-G` did, and don't leave real cross-review undone-but-marked-done the way `5-F` was flagged open.

---

## Deferred (this block) — Tracked for Fast-Follow

Not tasks in this milestone; listed so they aren't lost.

| Item | Why deferred | Where specified |
|---|---|---|
| `FR-P3-1` Multi-Hop Reasoning | Depends on Rank 8's relationship graph, not built until Block D | `TIER1_COMPLETION_PLAN.md` §3 |
| `FR-P3-3` Root Cause Analysis | Depends on Rank 8's relationship graph, not built until Block D | `TIER1_COMPLETION_PLAN.md` §3 |
| `FR-P3-5` Autonomous Knowledge Curation | Needs a guardrails/approval-workflow design not yet done | `TIER1_COMPLETION_PLAN.md` §3 |
| `FR-P3-10` Agentic Task Execution | Needs a permissions/approval model not yet designed | `TIER1_COMPLETION_PLAN.md` §3 |
| `FR-P2-1`/`FR-P2-3`/`FR-P2-4` (carried from Block A) | Still blocked on Rank 8's relationship graph | `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md` |
| Rank 3 (Ingestion Connectors), Rank 4 (Auto Classification), Rank 8 (Context Engine) | Sequenced after all of Rank 1 per client mandate | `TIER1_COMPLETION_PLAN.md` §3, §6–7 |
