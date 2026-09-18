# Conversational Knowledge Assistant (Phase 1 Retrofit) — Implementation Tracker

> **For AI agents:** This file is the source of truth for task status on the CKA sprint (July 1-10, 2026). When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Reference document:** See `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` for full requirement specs, scope, and acceptance criteria (including the full 3-phase roadmap table). See `SPRINT_OVERVIEW_JULY_2026.md` for the day-by-day schedule and why Rank 4/Rank 8/Rank 3 work is paused this sprint.
>
> **Phase discipline:** the CKA roadmap is delivered phase by phase — Phase 1 (Knowledge Retrieval / Organizational Search Assistant) first, in full, before Phase 2 (Knowledge Understanding) or Phase 3 (Knowledge Reasoning) start. Milestone 4 below is Phase 1 only. Phase 2 becomes Milestone 5 (added to this same tracker file, not a new one) once its requirements are appended to `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` — do not pull Phase 2/3 features (knowledge graph, expert discovery, multi-hop reasoning, etc.) forward into Milestone 4 tasks.

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

## Milestone 4 — Conversational Knowledge Assistant (Phase 1 Retrofit)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `4-A` | Schema: Chat Memory, Citations & Audit Log | `DONE` | Johurul | — | 2026-07-06 | 2026-07-06 |
| `4-B` | Retrieval: Hybrid Search + Query Expansion + Scope Selector | `DONE` | Simran | `4-A` | | 2026-07-08 |
| `4-C` | Conversational Core: Streaming, Structured Output, Confidence, Auto-Title, Session Memory | `DONE` | Johurul | `4-A` | 2026-07-06 | 2026-07-06 |
| `4-D` | Citations & Trust: Persisted Citations, Chunk Preview, Audit Logging | `DONE` | Sandeep | `4-A` | | 2026-07-08 |
| `4-E` | Integration & Cross-Testing | `DONE` | All 3 | `4-B`, `4-C`, `4-D` | | 2026-07-10 |
| `4-F` | UI Polish Pass | `DONE` | All 3 | `4-E` | | 2026-07-10 |
| `4-G` | PR + Cross-Reviews | `DONE` | All 3 | `4-F` | | 2026-07-10 |

---

### Task 4-A — Schema: Chat Memory, Citations & Audit Log
- **Status:** `DONE`
- **Objective:** Land the one shared migration everything else depends on, on Day 1, so Simran and Sandeep can branch immediately after.
- **Key files to create/modify:**
  - `prisma/schema.prisma` — extend `OrgMessage` (`sources Json?`, `confidence String?`), extend `OrgConversation` (`activeTopic String?`, `activeDocumentId String?`), new `ChatAuditLog` model.
  - New migration file (hand-written `CREATE TABLE`/`ALTER TABLE` matching existing repo convention — `prisma migrate dev` is blocked by drift on the shared DB per `IMPLEMENTATION_TRACKER.md` Task 1-A/3-B notes; apply via `prisma migrate deploy`).
- **Acceptance criteria:** `prisma migrate status` shows schema up to date on `knowledge_management_db_dev`; existing Org Chat flow (`route.js`) unaffected until 4-B/4-C/4-D start writing to the new fields.
- **Coordination note:** `REQUIREMENTS_INGESTION_PIPELINE.md`'s `Document.sourceProvider`/`externalId` fields are unrelated but were scoped for the same Day-1 migration slot before the sprint pivoted to CKA-only. That migration is paused along with the rest of the ingestion work — do not include it here unless explicitly un-paused.

### Task 4-B — Retrieval: Hybrid Search + Query Expansion + Scope Selector
- **Status:** `DONE`
- **Objective:** Org Chat retrieval stops being vector-only.
- **Key files to create/modify:**
  - Extract `computeBM25` out of `src/app/api/projects/ask/route.js` into a shared utility (e.g. `src/lib/keywordSearch.js`).
  - `src/lib/vectorSearch.js` — `orgSearch()` gains a hybrid mode: run vector + keyword candidates, merge/rerank, keep RBAC filtering in the SQL `WHERE` clause for both paths.
  - `src/app/api/org/[orgId]/chat/route.js` — generate 2-3 query variants via LLM before retrieval; accept a `scope` param (personal/department/org) and pass through to `orgSearch()`.
  - `src/app/(app)/org/[orgId]/chat/page.jsx` — scope selector UI control.
- **Acceptance criteria:** see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Acceptance Criteria — hybrid retrieval + scope selector bullets.
- **Implementation notes:** The initial PR (`feature/task-4b-hybrid-retrieval-scope`, commit `821c9a7`, Simran) was branched before 4-C's streaming and 4-D's persisted-citations/audit-log landed on `dev`, so it conflicted with both and also silently dropped the `d.lifecycle = 'published'` filter from `orgSearch`'s repository-scope condition (never present in its new keyword/fallback paths either — unpublished repository documents were retrievable). Reconciled by layering 4-B's actual new work (query expansion, hybrid vector+keyword search, scope selector) onto `dev`'s current chat route/page rather than a mechanical merge, the same pattern used for 4-D. Additional fixes applied during reconciliation: restored the `lifecycle = 'published'` filter across all three search paths (vector/keyword/fallback); extracted `computeBM25` into `src/lib/keywordSearch.js` and had `orgKeywordSearch` reuse it over a bounded RBAC/scope-filtered candidate pool, replacing a from-scratch Postgres full-text-search implementation that deviated from this task's own spec; fixed a bug in `hybridSearch.js`'s result merge where a keyword/fallback row's placeholder distance was overwriting a real vector distance for chunks matched both ways, corrupting confidence scoring; and wired real department scoping end-to-end (`GET /api/org/[orgId]/department?mine=1` + a department picker in the chat UI), since the original PR's UI never sent a `departmentId` so "Department" scope only filtered to "any doc with a department assigned" rather than the user's own department. Merged to `dev` via PR #13 (`f2ea47e`).
- **Verified in 4-E:** live end-to-end browser pass with a funded OpenAI key completed and passed, including this task's scope selector wiring.
- **Product decision (4-E):** the Personal/Department/Organization scope selector UI was deliberately hidden for Phase 1 (commit `1f6d4f3`) rather than shipped — scope selection isn't an access-control mechanism (RBAC already governs retrieval regardless of scope) and most org members don't yet have `DepartmentMember` rows for "Department" scope to be meaningful. This is a closed decision, not an open bug: Org Chat defaults to `organization` scope for Phase 1; the backend (`hybridOrgSearch`, scope param, department-scoped RBAC) is untouched and ready for the UI to be re-enabled in a later phase if the team decides to.

### Task 4-C — Conversational Core: Streaming, Structured Output, Confidence, Auto-Title, Session Memory
- **Status:** `DONE`
- **Objective:** The response experience — how answers arrive and read, not what's retrieved.
- **Key files to create/modify:**
  - `src/app/api/org/[orgId]/chat/route.js` — `stream: true` on the OpenAI call, `ReadableStream`/SSE response; rewrite `SYSTEM_PROMPT` to allow structured/sectioned answers instead of "plain text only"; compute and attach a confidence indicator; LLM call to generate conversation title on first message; read/write `activeTopic`/`activeDocumentId` on `OrgConversation`.
  - `src/app/(app)/org/[orgId]/chat/page.jsx` — incremental token rendering; confidence badge in the UI; title updates in the sidebar after first message.
- **Acceptance criteria:** streaming, structured output, confidence, auto-title, and follow-up-context bullets in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Acceptance Criteria.
- **Note:** This supersedes the sprint's earlier (pre-CKA-pivot) plan of "auto-title + streaming only, Project/Document Chat untouched" — scope is now the full Task 4-C above, still Org-Chat-only.
- **Implementation notes:**
  - SSE frame protocol on `POST /chat`: `event: meta` (conversationId, sources, confidence — sent once, right after retrieval, before generation starts) → `event: token` (incremental answer text) → optional `event: title` (only for a brand-new conversation, generated concurrently with the answer from a separate `gpt-4o-mini` call on the question alone) → `event: done`. `event: error` can fire mid-stream after `meta` has already been sent.
  - Confidence is a heuristic off retrieval only (avg cosine distance of top-5 chunks + result count — see Open Question #1's recommendation), computed before the completion call, persisted on `OrgMessage.confidence`. Citations (`OrgMessage.sources`) are intentionally left unpersisted here — that's 4-D's job.
  - Session memory: single-document retrieval result sets `activeDocumentId` (clears `activeTopic`); multi-document sets `activeTopic` to the raw question, capped at 200 chars (clears `activeDocumentId`); zero results leaves prior memory untouched. Used to prefix the next turn's embedding query and LLM context, not full entity extraction.
  - Added `react-markdown` + `remark-gfm` as new deps (no markdown renderer existed in the repo) to safely render the now-structured assistant output.
  - **Verification caveat (resolved 4-E):** `next build` passed, unauthenticated requests correctly 401, and the SSE-framing/confidence/session-memory logic was dry-run tested against a mocked completion stream before merge. A funded OpenAI key was later supplied and a full live end-to-end browser pass (streaming, hybrid retrieval, structured output, confidence, citations, auto-title) was run and passed as part of `4-E` — the earlier 429 `insufficient_quota` gap is closed.

### Task 4-D — Citations & Trust: Persisted Citations, Chunk Preview, Audit Logging
- **Status:** `DONE`
- **Objective:** Citations survive a reload and are actually inspectable, plus every query is logged.
- **Key files to create/modify:**
  - `src/app/api/org/[orgId]/chat/route.js` — write `sources` to `OrgMessage` on each turn instead of only returning them in the response; write a `ChatAuditLog` row per query.
  - `src/app/api/org/[orgId]/chat/[conversationId]/route.js` — return persisted `sources` when loading an old conversation.
  - `src/app/(app)/org/[orgId]/chat/page.jsx` — citation click opens a chunk-preview popover (matched chunk text) with a link through to the document/repository page, instead of only a raw signed S3 URL to the whole file.
- **Acceptance criteria:** reload-persistence and chunk-preview bullets in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Acceptance Criteria; audit log row exists per query (no UI required this sprint).
- **Implementation notes:** The initial PR (`feature/task-4d-citations-trust`, commit `f9f85d9`) was branched before 4-C's streaming/structured-prompt/session-memory/auto-title landed on `dev`, so merging it as-is would have reverted all of 4-C and dropped the conversation `PATCH`/`DELETE` endpoints. Reconciled by rebasing onto the real `dev` (with 4-C's actual commit `ea0fd15` in the ancestry) and keeping only 4-D's genuine additions: `preview` field on each source, persisted `sources`+`confidence` on `OrgMessage`, a `ChatAuditLog` row per query, and a citation-click preview modal replacing the old plain link-out. Merged to `dev` via PR #14 (`20557be`).

### Task 4-E — Integration & Cross-Testing
- **Status:** `DONE`
- **Objective:** 4-B, 4-C, and 4-D all touch `route.js` and the chat page — merge and reconcile before testing individually-passing-but-conflicting changes.
- **Notes:** RBAC regression check completed — verified department-scoped users can't retrieve out-of-scope documents across the hybrid/query-variant/scope-selector paths (4-B) combined with the streaming path (4-C). Live end-to-end browser pass with a funded OpenAI key completed and passed (streaming, hybrid retrieval, structured output, confidence, citations, auto-title). Scope selector deliberately hidden for Phase 1 — see product-decision note under Task 4-B.

### Task 4-F — UI Polish Pass
- **Status:** `DONE`
- **Objective:** Loading/error states for streaming, mobile responsiveness (matching the precedent set in commit `0234248`, "fix: mobile responsiveness for org chat and repository date filters"), dark mode pass on any new components (scope selector, confidence badge, chunk-preview popover).

### Task 4-G — PR + Cross-Reviews
- **Status:** `DONE`
- **Objective:** Standard close-out — each person reviews at least one other's work before merge to `dev`.

---

## Deferred (this sprint) — Tracked for Fast-Follow

Not tasks in this milestone; listed so they aren't lost.

| Item | Why deferred | Where specified |
|---|---|---|
| PPTX / Markdown ingestion | Worker-level corpus-completeness gap, not a chat-experience gap | `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Scope |
| App-level encryption at rest | Needs its own scoping decision (what fields, what threat model) | `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Scope |
| Full NL metadata parsing ("HR documents owned by X") | UI scope selector (4-B) ships the MVP version this sprint | `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Open Question #2 |
| Document Chat / Project Chat parity (RBAC, citations) | Comparable-sized second project; Org Chat is the org-wide CKA surface | `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Scope |
| Admin-facing audit log UI | 4-D ships logging only, no viewer | `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` FR-H |
| Automatic Knowledge Classification (Rank 4) | Paused to free 3 people onto CKA | `REQUIREMENTS_AUTO_CLASSIFICATION.md` |
| Knowledge Context Engine (Rank 8) | Paused to free 3 people onto CKA | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` |
| SharePoint Ingestion Connector (Rank 3) | Paused to free 3 people onto CKA | `REQUIREMENTS_INGESTION_PIPELINE.md` |
| CKA Phase 2 (Knowledge Understanding) / Phase 3 (Organizational Intelligence Agent) | Out of scope entirely — separate multi-sprint efforts | CKA Three-Phase Roadmap |
