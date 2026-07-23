# Rank 1 Phase 2 (Knowledge Understanding) — Implementation Tracker
### Tier 1 Completion Plan — Block A

> **For AI agents:** This file is the source of truth for task status on Block A (Mon 2026-07-20 – Mon 2026-07-27). When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Reference documents:** `TIER1_COMPLETION_PLAN.md` §3–4 for the full audit, the sequencing rationale, and why 5 FRs are deferred out of this block. `TIER1_DAY_BY_DAY_SCHEDULE.md` for the plain day-by-day task list this tracker formalizes. `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 2 section for the original (unaudited) FR list this block's `5-A` task cuts down to size — the same way `4-A` through `4-G` in `CKA_IMPLEMENTATION_TRACKER.md` cut Phase 1's 14 FRs to a committed 9.
>
> **Scope discipline:** Phase 2's original roadmap listed 10 FRs (`FR-P2-1` through `FR-P2-10`). **Audited against the repo 2026-07-18** — see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 2 section for the full findings (zero of the 10 existed before this block). Three of them — `FR-P2-1` Knowledge Graph, `FR-P2-3` Relationship Discovery, `FR-P2-4` Expert Discovery — are **confirmed out of scope for this block**, deferred to a follow-up pass after Block D (Rank 8) ships, since they depend on the relationship-graph data Rank 8 builds. Building them now would mean throwaway work reconciled later — the exact mistake this project already made twice (`4-B`/`4-D` branch conflicts). Do not pull them forward into any task below without updating `TIER1_COMPLETION_PLAN.md` §3 first.
> **File paths and data models below are finalized** as of the 2026-07-18 audit (not placeholders) — `5-A` lands the schema exactly as specified in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`'s Data Model Impact, rather than re-deriving it from scratch on Day 1.

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

## Milestone 5 — Rank 1 Phase 2 (Knowledge Understanding)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `5-A` | Shared Schema | `DONE` | Johurul | — | 2026-07-22 | 2026-07-22 |
| `5-B` | Entity Extraction + Organizational Memory | `DONE` | Johurul | `5-A` | 2026-07-22 | 2026-07-22 |
| `5-C` | Decision Tracking + Timeline Generation | `DONE` | Simran | `5-A` | 2026-07-22 | 2026-07-22 |
| `5-D` | Cross-Project Synthesis + Gap Detection + Conflict Detection | `TODO` | Sandeep | `5-A` | | |
| `5-E` | Integration & RBAC Regression Check | `TODO` | All 3 | `5-B`, `5-C`, `5-D` | | |
| `5-F` | PR + Cross-Reviews | `TODO` | All 3 | `5-E` | | |

---

### Task 5-A — Shared Schema
- **Status:** `DONE`
- **Objective:** Same Day-1 gate pattern as `4-A` — land the one shared migration everything else depends on, so the other two workstreams can branch immediately after. The FR audit and scope cut are already done (2026-07-18, see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 2 section) — this task is schema-landing only, not re-auditing.
- **Key files to create/modify:**
  - `prisma/schema.prisma` — add `Entity`, `Decision`, `TimelineEvent`, `DocumentConflict`, `OrgMemberMemory` (exact shape in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 2 → Data Model Impact).
  - New migration file, same hand-written convention as `4-A` (`prisma migrate dev` blocked by drift on the shared DB).
- **Acceptance criteria:** `prisma migrate status` shows schema up to date; existing Org Chat flow (Phase 1) unaffected until `5-B`/`5-C`/`5-D` start writing to the new fields.
- **Implementation notes:**
  - Landed the five models from the Data Model Impact block essentially as specified, plus the mechanical additions Prisma requires: back-relation fields on `User`, `Organization`, `Document`, `Project`, `Department`, `OrgConversation` for each new FK. `DocumentConflict.documentAId`/`documentBId` both reference `Document`, so they needed named relations (`DocumentConflictA`/`DocumentConflictB`) the same way `AuditLog.actorUserId`/`targetUserId` already do for `User`.
  - FK `onDelete` follows the existing repo pattern: `Cascade` when the FK is required (e.g. `Decision.documentId`, `DocumentConflict.documentAId/documentBId`, `OrgMemberMemory.orgId/userId`), `SetNull` when the FK is optional (e.g. `Entity.documentId/conversationId`, `TimelineEvent`'s four optional FKs) — matching `Document.orgId`/`departmentId` and `AuditLog.actorUserId`/`targetUserId`.
  - `OrgMemberMemory` validated against 5-B's own use case (cross-conversation recall) and against Open Question #2's "short history, not a single row" recommendation: added `@@unique([orgId, userId, topic])` rather than a bare append-only log. This makes it an upsert-on-repeat-topic table (`lastSeenAt` bumped on re-ask) instead of literal duplicate rows per topic — recall of "the last N distinct topics a user asked about" is a simple `ORDER BY lastSeenAt DESC LIMIT N` with no de-duplication needed at read time. Flagging this as the concrete interpretation of Open Question #2's recommendation, in case 5-B/5-C/5-D want a literal per-question history instead — didn't seem needed for the stated acceptance criteria (recall a topic from a *different* conversation).
  - Migration: `prisma/migrations/20260722000000_add_phase2_knowledge_understanding_schema/migration.sql`, hand-written `CREATE TABLE`/`ALTER TABLE` (additive only, no drops), applied via `prisma migrate deploy` per this task's own instruction and the `4-A` precedent.
  - **DB mixup caught before applying anything:** this shell session had a stray `DATABASE_URL` environment variable set (pointing at a Render-hosted Postgres DB named `actionboard_ai` — almost certainly the original MTD fork's database), which silently overrode `.env`'s `knowledge_management_db_dev` (dotenv doesn't clobber an already-set `process.env` var). `prisma migrate status`/`deploy` connected to `actionboard_ai` first, which also turned out to have a pre-existing failed migration (`20260612100814_add_org_rbac_schema`, not present in this repo's local migration history at all) blocking `migrate deploy` with `P3009` — so nothing was written there. Flagged to Johurul before proceeding; confirmed the correct target is `.env`'s `knowledge_management_db_dev` on `kms-postgres-dev...rds.amazonaws.com`, which had no drift beyond this task's own new migration. Applied there instead, explicitly overriding the shell var for the command. **Action item:** find and unset/fix that stray `DATABASE_URL` in whatever shell profile or CI config set it — it will keep silently redirecting `prisma` commands away from the real KMS dev DB otherwise.
  - Verified: `prisma migrate status` → "Database schema is up to date!" against `knowledge_management_db_dev`; `prisma generate` regenerated the client with no errors.

### Task 5-B — Entity Extraction + Organizational Memory
- **Status:** `DONE`
- **Objective:** Extends the conversational/session layer Johurul already owns from Phase 1 (`4-C`). Entity Extraction (`FR-P2-2`) identifies named entities (people, projects, departments, systems) in ingested documents and chat questions. Organizational Memory (`FR-P2-5`) is longer-lived, cross-conversation memory beyond Phase 1's per-conversation `activeTopic`/`activeDocumentId` — e.g. recalling a user asked about "Project Atlas" last week in a different conversation.
- **Key files to create/modify:**
  - `worker/index.js` / `worker/summarize.js` — add an entity-extraction LLM call inside `processSummarizationJob`, alongside `summarizeChunks`/`createStructuredSummary`; write results to `Entity`.
  - `src/app/api/org/[orgId]/chat/route.js` — extract entities from the chat question at query time; read/write `OrgMemberMemory` for cross-conversation recall, used as additional retrieval/prompt context the same way `activeTopic`/`activeDocumentId` are today.
- **Acceptance criteria:** a document's chat-relevant entities are extracted and usable as retrieval context; a user's cross-conversation context (e.g. a topic asked about in a prior, different conversation) measurably improves a follow-up answer, not just per-conversation memory (already shipped in Phase 1).
- **Implementation notes:**
  - **Document-side extraction (`worker/summarize.js` → `extractEntities`, `worker/index.js` → `processSummarizationJob`):** a fourth LLM call alongside `summarizeChunks`/`createStructuredSummary`, same `gpt-4o-mini` + `response_format: json_object` pattern as `createStructuredSummary`, run over the same chunk summaries (not raw chunks — cheaper, and consistent with how the structured summary is built). Restricted to the four spec'd types (`person`/`project`/`department`/`system`) with anything else discarded, deduped by `type:lowercased-name`. Writes go through `deleteMany` + `createMany` on `Entity` keyed by `documentId`, mirroring the idempotency pattern already used for `Chunk` in `processChunkJob` — this also makes `regenerate` mode's re-run of summarization safe (re-extracts and replaces rather than duplicating). Reuses `getOpenAIForDocument(docId)` — the same per-org/user/env key resolution already in use for the rest of this job, no new key path.
  - **Query-time extraction (`src/lib/entityExtraction.js` → `extractQuestionEntities`, called from `chat/route.js`):** new small utility module, same shape/placement convention as `src/lib/queryExpansion.js` (`expandQuery`) — a focused, low-token (`max_tokens: 200`, `temperature: 0`) LLM call on the raw question alone. Runs inline at query time deliberately (not deferred to the worker) — FR-P2-2 explicitly calls for query-time extraction to feed the same turn's retrieval, and this mirrors `expandQuery`'s existing inline-at-chat-time precedent; the NFR against inline LLM work targets the heavier document-level extraction (worker-only), not this.
  - **How entities become "retrieval context," concretely:** extracted entity names (question-side) and recalled memory topics are appended to `hybridOrgSearch`'s `queries` array (the keyword-search leg) without generating new embeddings for them — they ride the existing `orgKeywordSearch` RBAC-scoped SQL path rather than opening a new, potentially unscoped lookup against the `Entity` table directly. Also folded into `sessionContextNote` (same variable `activeTopic`/`activeDocumentId` already write into), so they reach both the retrieval query prefix and the final LLM prompt the same way session memory does today.
  - **Cross-conversation memory (`src/lib/orgMemberMemory.js` → `getRecentMemory`/`recordMemoryTopics`, `OrgMemberMemory`):** implements Open Question #2's "short history" recommendation concretely as the last 5 distinct topics by `lastSeenAt`, scoped to `(orgId, userId)` — not per-conversation, so it's visible from a brand-new conversation the same as an old one. What gets remembered is the *extracted entity names* from each question (e.g. "Project Atlas"), not the raw question text — deliberately narrower than `activeTopic`'s raw-question-slice behavior, since a running list of full questions doesn't recall as a clean "topic." Recorded via upsert on `@@unique([orgId, userId, topic])` (bumping `lastSeenAt`) after each successfully-answered turn, alongside the existing `activeTopic`/`activeDocumentId` update — not on denied/failed requests.
  - **RBAC check:** `getRecentMemory`/`recordMemoryTopics` always filter/write by both `orgId` and `userId` from the already-resolved session (`resolveOrgRole`), so memory can't leak across orgs or between users within an org. Entity names/memory topics never bypass RBAC directly — they only ever reach retrieval as extra keyword-search terms through `orgKeywordSearch`'s existing SQL `WHERE`, and reach the prompt as plain text the requesting user already authored (their own question / their own recalled topics), so there's no new path for surfacing another user's or department's content.
  - Verified: `next build` passes clean with no new errors; `node --check` passes on both modified `worker/*.js` files (ESM, not covered by the Next.js build).

### Task 5-C — Decision Tracking + Timeline Generation
- **Status:** `DONE`
- **Implementation note:** Built by Johurul in this session, on Simran's behalf — Simran remains the assignee of record for this task.
- **Objective:** Adjacent to Simran's Phase 1 retrieval work (`4-B`). Decision Tracking (`FR-P2-6`) captures and surfaces *why* a decision was made, not just what was decided. Timeline Generation (`FR-P2-7`) constructs a chronological view of events/decisions/documents related to a topic or project.
- **Key files to create/modify:**
  - `worker/index.js` / `worker/summarize.js` — decision/rationale extraction LLM call in `processSummarizationJob`, alongside `5-B`'s entity extraction; write to `Decision`, and dates to `TimelineEvent`.
  - `src/app/(app)/document/page.jsx` — surface tracked decisions with their rationale.
  - A project/department page — simple ordered timeline list (not a full visual timeline component this block).
- **Acceptance criteria:** a document or project shows at least one tracked decision with its stated rationale; a topic/project has a chronological timeline view backed by extracted dates, not manual entry.
- **Implementation notes:**
  - **Document-side extraction (`worker/summarize.js` → `extractDecisions`, `worker/index.js` → `processSummarizationJob`):** a fifth LLM call, placed immediately after `5-B`'s `extractEntities` call, same `gpt-4o-mini` + `response_format: json_object` pattern, run over the same chunk summaries (not raw chunks). Returns `{ statement, rationale, decidedAt }` triples; `decidedAt` is only accepted as a strict `YYYY-MM-DD`-prefixed string (parsed with a regex, not a bare `new Date()` on whatever the model returns) — anything else is dropped to `null` rather than risking a garbage date landing in `TimelineEvent`. Reuses the same `getOpenAIForDocument(docId)` key resolution already in scope in this job — no new key path.
  - **Idempotent writes, same convention as `5-B`'s `Entity` handling:** `deleteMany` + re-create on every run (including `regenerate`). Order matters here in a way it doesn't for `Entity`: `TimelineEvent.decisionId` is `onDelete: SetNull` (per `5-A`'s note on FK behavior), so deleting `Decision` rows first would silently orphan old `TimelineEvent` rows instead of removing them. Fixed by deleting `TimelineEvent` (by `documentId`) before `Decision` (by `documentId`) on every run.
  - **Timeline rows only get created for decisions with an extracted date** — matches the acceptance criteria's "backed by extracted dates, not manual entry" and FR-P2-7's "using dates extracted alongside FR-P2-6." A decision with no stated date still gets a `Decision` row (so it still shows on the document page), just no `TimelineEvent`. `TimelineEvent.projectId` comes from the job's own `projectId`; `TimelineEvent.departmentId` comes from a small separate `document.findUnique` (only `departmentId`, only when there's at least one decision) since `processSummarizationJob`'s job payload doesn't carry it — project uploads typically leave `Document.departmentId` null (only repository-scoped uploads set it), so department timelines are populated from repository docs, project timelines from `job.projectId`.
  - **Surfacing on the document page (`src/app/(app)/document/page.jsx`):** added a "Decisions" card in the existing Summary tab (same card styling as the Key Points card), showing each decision's statement, its `decidedAt` date when present, and rationale prefixed "Why:". Sourced from a new `decisions: { orderBy: { decidedAt: "desc" } }` include added to `GET /api/documents/[id]` — that route already resolves the full document-level RBAC check (owner / org admin / department-member-and-non-draft) before returning the document, so decisions ride the same access check with no new logic.
  - **Project/department timeline lists — RBAC was the main design constraint here, not the UI.** A project or department can aggregate `TimelineEvent` rows from *many* documents at once, and those documents may individually be owned by different users or restricted (draft lifecycle, department-scoped). Unlike the single-document page (where RBAC is already resolved by the time you're looking at one document), a list endpoint has to re-check access per underlying document before including its timeline entry. Extracted this into `src/lib/documentAccess.js` → `filterAccessibleDocuments()`, which mirrors `documents/[id]/route.js`'s exact access logic (owner → allow; org admin → allow; draft lifecycle and not owner → deny; no `departmentId` → allow; else require `DepartmentMember` membership) but batches the department-membership query once for the whole list instead of per-row. New endpoints `GET /api/projects/[id]/timeline` and `GET /api/org/[orgId]/department/[deptId]/timeline` both: resolve org role first (same baseline check as `/api/projects/[id]/topics`), fetch `TimelineEvent` rows scoped to that project/department with their linked `document` and `decision.rationale`, run the list through `filterAccessibleDocuments`, and drop any event whose document didn't pass. This is the concrete answer to this task's RBAC constraint — a decision extracted from a document a given user can't open will not appear in either timeline list for that user.
  - **UI:** project page (`src/app/(app)/project/page.jsx`) gets a collapsible "Timeline" panel below the existing topics view (simple ordered `<ol>`, per the task's "not a full visual timeline component" scope). Department page (`.../department/[deptId]/page.jsx`) gets a fourth tab ("Timeline") alongside the existing Documents/Projects/Members tabs, same list treatment. Neither is a new page — both extend an existing one, per the task's file list.
  - **Constraint check:** did not touch `5-B`'s `worker/summarize.js` `extractEntities`, `src/lib/entityExtraction.js`, `src/lib/orgMemberMemory.js`, or `chat/route.js`'s entity/memory logic — the only shared file is `worker/index.js`'s `processSummarizationJob`, where the new decision-extraction block was inserted immediately after `5-B`'s existing entity block without modifying it. Did not touch `5-D`'s scope (`hybridSearch.js`/`vectorSearch.js`).
  - Verified: `prisma migrate status` confirms schema already up to date against `knowledge_management_db_dev` (no new migration needed, as expected — `5-A` already landed `Decision`/`TimelineEvent`); `node --check` passes on both modified `worker/*.js` files; `next build` completes with no errors or warnings, and both new routes (`/api/projects/[id]/timeline`, `/api/org/[orgId]/department/[deptId]/timeline`) appear in the route manifest.

### Task 5-D — Cross-Project Synthesis + Gap Detection + Conflict Detection
- **Status:** `TODO`
- **Objective:** Builds on the citations/confidence signals Sandeep already owns from Phase 1 (`4-D`). Cross-Project Knowledge Synthesis (`FR-P2-8`) answers questions spanning multiple projects/departments, not just one retrieval scope. Knowledge Gap Detection (`FR-P2-9`) identifies topics/questions the knowledge base answers poorly, using Phase 1's confidence scores (`OrgMessage.confidence`) as a natural input signal. Conflict Detection (`FR-P2-10`) flags when two documents/sources appear to contradict each other on the same topic.
- **Key files to create/modify:**
  - `src/lib/hybridSearch.js` (`hybridOrgSearch()`) / `src/lib/vectorSearch.js` (`orgSearch`/`orgKeywordSearch`/`orgFallbackTextSearch`) — widen retrieval to synthesize across projects/departments when a question calls for it; RBAC stays enforced in the SQL `WHERE` for every path.
  - A new batch job reading `ChatAuditLog` + `OrgMessage.confidence` patterns, for gap detection.
  - A new batch job comparing `Chunk.embeddingVec` within a topic/department for conflict detection, writing to `DocumentConflict`.
- **Acceptance criteria:** a cross-project question gets a synthesized answer instead of being silently scoped to one project, with no RBAC regression; low-confidence question patterns are visible somewhere (log or query); at least one real or seeded conflicting-document pair is correctly flagged.

### Task 5-E — Integration & RBAC Regression Check
- **Status:** `TODO`
- **Objective:** `5-B`, `5-C`, and `5-D` all touch retrieval/chat surfaces — merge and reconcile before testing individually-passing-but-conflicting changes, the same discipline `4-E` used for Phase 1.
- **Notes:** RBAC regression check is mandatory — verify none of the three new workstreams (entity/memory context, decision/timeline data, cross-project synthesis) leak department- or project-scoped content a user shouldn't see. Cross-project synthesis (`5-D`) is the highest-risk path here since it deliberately widens scope — confirm it still respects RBAC while doing so.

### Task 5-F — PR + Cross-Reviews
- **Status:** `TODO`
- **Objective:** Standard close-out — each person reviews at least one other's work before merge to `dev`. Update this tracker's Milestone 5 table and `TIER1_COMPLETION_PLAN.md`/`TIER1_DAY_BY_DAY_SCHEDULE.md` if anything shipped differently from what was planned — don't let this tracker go stale the way `CKA_IMPLEMENTATION_TRACKER.md`'s `4-E`/`4-F`/`4-G` did.

---

## Deferred (this block) — Tracked for Fast-Follow

Not tasks in this milestone; listed so they aren't lost.

| Item | Why deferred | Where specified |
|---|---|---|
| `FR-P2-1` Knowledge Graph Integration | Depends on Rank 8's relationship model, not built until Block D | `TIER1_COMPLETION_PLAN.md` §3 |
| `FR-P2-3` Relationship Discovery | Depends on Rank 8's `DocumentRelationship` | `TIER1_COMPLETION_PLAN.md` §3 |
| `FR-P2-4` Expert Discovery | Depends on Rank 8's `TopicExpertise` | `TIER1_COMPLETION_PLAN.md` §3 |
| Rank 1 Phase 3 (Organizational Intelligence Agent) | Next block (Block B) — do not pull Phase 3 features forward into Milestone 5 tasks | `TIER1_COMPLETION_PLAN.md` §5, `TIER1_DAY_BY_DAY_SCHEDULE.md` |
| Rank 3 (Ingestion Connectors), Rank 4 (Auto Classification), Rank 8 (Context Engine) | Sequenced after all of Rank 1 per client mandate | `TIER1_COMPLETION_PLAN.md` §3, §6–7 |
