# Requirements: Conversational Knowledge Assistant (CKA) — Phase 1

**Capability:** Conversational Knowledge Assistant
**PRD Rank:** 1 (Tier 1)
**Purpose:** A secure, organization-aware conversational interface that retrieves and synthesizes organizational knowledge — answers "What does our organization know about this topic?" rather than "where is that document?"
**Source:** "CKA Three-Phase Implementation Roadmap" (pasted 2026-07-02).

**Delivery approach: phase by phase, starting with Phase 1. Do not begin Phase 2 or Phase 3 work until Phase 1 is complete.** This is the single, permanent requirements document for the whole CKA capability, not split by phase into separate files. Phase 1 (below) is fully scoped and audited against the repo. Phase 2 and Phase 3 sections (at the bottom of this doc) carry over the source roadmap's feature list only — unverified against the repo — so the work isn't lost, but they get re-audited and rewritten with real FRs, file references, and acceptance criteria immediately before each phase actually starts, the same way Phase 1's section was built.

## Roadmap Context — All 3 Phases

| Phase | Goal | Assistant Role | Status |
|---|---|---|---|
| **Phase 1** | Knowledge Retrieval | Organizational Search Assistant | **Done (2026-07-10)** |
| Phase 2 | Knowledge Understanding | Organizational Knowledge Analyst | **Engineering-complete (2026-07-25)** — `5-A` through `5-E` done, cross-review (`5-F`) still open, see `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md` |
| Phase 3 | Knowledge Reasoning | Organizational Intelligence Agent | **Audited 2026-07-25 — not yet built, starting `TIER1_COMPLETION_PLAN.md` Block B (Jul 28–Aug 4)** |

Each phase builds on the previous one per the roadmap ("each phase builds upon the previous phase while delivering independently usable business value"). This single document covers the whole CKA capability — when Phase 1 is accepted, Phase 2's requirements get added here as a new section (not a separate file), following the same pattern: audit the actual repo state first, don't trust a feature's on-paper status. That caution is not hypothetical — this sprint's own audit found Rank 3 marked "Added" in the PRD despite the ingestion pipeline having no external connectors, and Org Chat existing without most of what Phase 1 actually requires.

---

## Problem Statement

**Org Chat is not "Conversational Knowledge Assistant, done."** It's a working RAG chat surface, but a code audit (2026-07-02) against Phase 1's functional requirements (FR-1 through FR-14) found:

- **11 of 14 requirements Missing, 2 Partial, 1 in direct conflict** with the current implementation.
- The conflict: Org Chat's system prompt (`src/app/api/org/[orgId]/chat/route.js:18-19`) explicitly says *"Plain text only (no markdown, no lists, no special formatting)"* — the opposite of the spec's expectation of structured, sectioned answers (Overview/Objectives/Documents/Teams/Timeline) for exploratory queries.
- Retrieval is single-shot vector search only: one embedding of the raw question, ordered by cosine distance, with no query expansion, no keyword search, no reranking, and no metadata-driven scope narrowing — despite a working BM25 keyword scorer already existing elsewhere in the codebase (`src/app/api/projects/ask/route.js`, function `computeBM25`) that was never reused.
- No confidence scoring, no persisted citations (sources are recomputed fresh every request and lost on reload — already flagged as a known gap in `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md`), no chunk-level citation preview, and no streaming (the spec's own NFR requires first-token latency <1s, which is not achievable without streaming).
- Document Chat and Project Chat are further behind Org Chat, not further along — Document Chat has zero RBAC and no citations at all; Project Chat has no citations either.

This is realistically **not a 1-person task**, and not fully achievable in one sprint even with 3 people — see Sprint Scope Cut below for what's actually committed this cycle vs. deferred.

---

## Scope

In scope (this sprint, Org Chat only):
- Closing the confirmed system-prompt conflict (FR-12) — allow structured, sectioned responses.
- Hybrid retrieval: reuse the existing BM25 implementation alongside vector search, plus LLM-based query variant generation (FR-1, FR-5, FR-6).
- Streaming responses (FR-14) — previously backlogged in this sprint's earlier plan, **now required** because the spec's own performance NFR (first token <1s) depends on it.
- Confidence scoring on answers (FR-8).
- Persisted citations on `OrgMessage` so sources survive a page reload, plus chunk-level citation preview and navigation to the source document (FR-8, FR-13).
- Lightweight session memory — track the active topic/document per conversation, not just replay raw message text (FR-9).
- Department/personal retrieval scope selection — a UI scope selector, not full natural-language intent parsing (FR-2, FR-10; see Open Questions on why NL parsing is descoped).
- Basic audit logging of chat queries (part of FR-11/Security NFR).
- Auto-title generation for conversations (carried over from this sprint's original, smaller-scoped CKA plan).

Out of scope this sprint (deferred — see Sprint Scope Cut):
- PPTX and Markdown file ingestion (FR-3) — worker-level gap, not a chat-experience gap; scheduled as fast-follow.
- App-level encryption at rest beyond hosting-provider defaults (NFR/Security) — needs its own scoping decision, not a quick add.
- Full natural-language metadata parsing ("onboarding documents owned by HR" as free text) — MVP uses an explicit UI filter instead; NL parsing is a Phase 1.5 refinement.
- Bringing Document Chat and Project Chat up to Org Chat's (post-fix) standard — real gap, but a second project of comparable size; Org Chat is the org-wide surface the CKA concept is actually about.
- Everything in Phase 2 (knowledge graph, expert discovery, entity extraction) and Phase 3 (multi-hop reasoning, autonomous curation) of the source roadmap.
- This sprint's previously-planned Rank 4 (Automatic Knowledge Classification) and Rank 8 (Knowledge Context Engine) work, and the Rank 3 SharePoint ingestion connector — all **paused**, not cancelled, to free 3 people onto this. See `SPRINT_OVERVIEW_JULY_2026.md`.

---

## Functional Requirements (Phase 1 subset committed this sprint)

### FR-A — Hybrid Retrieval
- Reuse `computeBM25` (`src/app/api/projects/ask/route.js`) as a shared utility, run alongside `orgSearch()`'s vector search, and merge/rerank the two result sets rather than relying on vector distance alone.
- Generate 2-3 query variants (LLM rephrase) from the user's question before retrieval, matching the spec's "generate search query variants" pipeline step (FR-6).
- RBAC filtering stays in the SQL `WHERE` clause of `orgSearch()` for both retrieval paths — do not regress the existing rule from `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md`.

### FR-B — Streaming Responses
- Convert `POST /api/org/[orgId]/chat` from `openai.chat.completions.create(...)` to `stream: true`, piped through a `ReadableStream`/SSE response.
- Frontend (`org/[orgId]/chat/page.jsx`) renders tokens incrementally as they arrive.
- Supersedes the earlier sprint decision to backlog streaming — the CKA spec's own NFR (first token <1s) makes this a hard requirement, not a UX nicety.

### FR-C — Structured Response Formatting
- Replace the "plain text only" system prompt restriction with formatting that supports sectioned answers (Overview / Objectives / Documents / Teams / Timeline / Related knowledge) for exploratory queries about a topic/project, while keeping direct factual answers concise (don't force structure onto a one-line answer).
- Apply the same fix to Project Chat's system prompt only if time allows — not required this sprint.

### FR-D — Confidence Score
- Attach a confidence indicator (e.g., High/Medium/Low derived from retrieval score distribution and result count) to each assistant response.
- Surface it in the Org Chat UI next to the answer.

### FR-E — Persisted Citations + Chunk Preview
- Add a `sources`/citations field to `OrgMessage` (or a related table) so citations survive conversation reload — closes the gap flagged in `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` Open Question #2.
- Citation UI: clicking a source shows the actual matched chunk text (not just a link to the whole file), with a link through to the document/repository page.

### FR-F — Lightweight Session Memory
- Track `activeTopic`/`activeDocumentId` (or similar) per `OrgConversation`, updated as the conversation progresses, and use it as additional retrieval/prompt context on follow-up turns — not full entity extraction (that's Phase 2), just enough to support "tell me more about that" style follow-ups.

### FR-G — Retrieval Scope Selector
- UI control (not NL parsing) to scope a query to Personal / Department / Organization, wired into `orgSearch()`'s existing parameters.

### FR-H — Basic Audit Logging
- Log each chat query: user, org, timestamp, question, and which documents were cited — a new table, minimal write path, no UI required this sprint (defer an admin-facing audit view).

### FR-I — Auto-Title Generation
- LLM call on a conversation's first message to generate a real title, replacing the current first-80-characters fallback (`route.js:48`). Carried over unchanged from the sprint's original, narrower CKA scope.

---

## Non-Functional Requirements

- Streaming (FR-B) directly targets the spec's stated performance NFRs: first token <1s, full response <5s. Search latency <2s and citation generation <500ms are aspirational for this sprint — measure, don't block the sprint on hitting them exactly.
- RBAC enforcement (org/department isolation) must not regress across any of the above — every new retrieval path (BM25, query variants, scope selector) goes through the same SQL-`WHERE`-clause RBAC pattern as the existing `orgSearch()`.
- Scalability targets from the source roadmap (1000 orgs, 100K users, billions of embeddings) are long-term aspirations, not acceptance criteria for this sprint.

---

## Data Model Impact (proposed, not final)

```
OrgMessage + sources     Json?   // persisted citations: [{ documentId, filename, department, chunkText, url }]
           + confidence  String? // "high" | "medium" | "low"

OrgConversation + activeTopic       String?
                + activeDocumentId  String?

ChatAuditLog {
  id          String
  orgId       String → Organization
  userId      String → User
  question    String
  citedDocIds String[]  // or a join table if relational querying is needed later
  createdAt   DateTime
}
```
This builds on the `Document.sourceProvider`/`externalId` fields proposed in `REQUIREMENTS_INGESTION_PIPELINE.md` — unrelated but concurrent schema work; coordinate migration ordering since both touch this sprint's Day 1 migration slot.

---

## Sprint Scope Cut (2026-07-02)

Given 8-10 days and 3 people, full Phase 1 (all 14 FRs) is not achievable. Committed this sprint: FR-A through FR-I above. Explicitly deferred to a fast-follow sprint: PPTX/Markdown ingestion, app-level encryption, full NL metadata parsing, Document/Project chat parity, admin-facing audit log UI. See `CKA_IMPLEMENTATION_TRACKER.md` for the day-by-day task breakdown and `SPRINT_OVERVIEW_JULY_2026.md` for how this restructures the full sprint (Rank 4, Rank 8, and the Rank 3 SharePoint connector are paused, not cancelled).

---

## Open Questions

1. Confidence score formula — heuristic off retrieval distance/result count (fast to build) vs. a second LLM call to self-assess (more accurate, adds latency/cost). Recommend heuristic for this sprint, revisit later.
2. Why UI selector over NL scope parsing for FR-G: parsing "my documents" vs. "HR repository" reliably from free text is its own small NLP problem (intent classification) — a dropdown ships this sprint; NL parsing doesn't need to block it and can be added later without changing the underlying `orgSearch()` scope parameters.
3. Should `ChatAuditLog` be its own table (proposed above) or reuse/extend `OrgMessage`? Proposed as separate since audit requirements (retention, immutability) are usually distinct from chat data lifecycle (users can delete conversations; audit logs typically shouldn't disappear with them).
4. Does query-variant generation (FR-A) add a second LLM call per user question before the answer call — is that acceptable added latency/cost, or should variants only be generated for queries that return weak initial results (adaptive, more complex to build)? Recommend always-on for simplicity this sprint, revisit if latency/cost is a problem.

---

## Acceptance Criteria (draft, this sprint's scope)

- A user's question in Org Chat retrieves results from both vector and keyword (BM25) search, merged/reranked, not vector-only.
- Org Chat responses stream token-by-token instead of appearing all at once.
- A response about a topic/project renders as a structured, sectioned answer when appropriate; a simple factual question still gets a concise direct answer.
- Every response shows a confidence indicator.
- Reloading an old conversation still shows the sources that were cited at the time, not a blank/recomputed state.
- Clicking a citation shows the matched chunk text and links to the source document.
- A user can scope a query to Personal / Department / Organization via a UI control.
- Every chat query is recorded in an audit log with user, org, question, and cited documents.
- A new conversation gets an LLM-generated title after the first message, not a truncated raw-text fallback.
- No RBAC regression: department-scoped users still cannot retrieve documents outside their access, across all new retrieval paths.

---

## Phase 2 — Knowledge Understanding (Audited 2026-07-18 — In Progress, Block A)

**Goal:** Transform the assistant from a search engine into a knowledge analyst.
**Assistant Role:** Organizational Knowledge Analyst
**Status:** In progress — `TIER1_COMPLETION_PLAN.md` Block A (Mon 2026-07-20 – Mon 2026-07-27). Task breakdown: `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md` (Milestone 5). Plain schedule: `TIER1_DAY_BY_DAY_SCHEDULE.md`.

### Problem Statement (audit findings, 2026-07-18)

A repo audit against the carried-over 10-FR list found **zero of the 10 implemented** — no entity-extraction code anywhere in `src/` or `worker/`, no `Decision`/`TimelineEvent`/`DocumentConflict`/relationship models in `prisma/schema.prisma`, and no memory beyond Phase 1's per-conversation `OrgConversation.activeTopic`/`activeDocumentId`.

What Phase 2 *can* build on, confirmed real: Phase 1's persisted `OrgMessage.confidence`/`sources` and `ChatAuditLog` (`question`, `citedDocIds`, `outcome` per query — `prisma/schema.prisma`), the ingestion pipeline's existing LLM-calling stages (`worker/index.js`: `processChunkJob` → `processEmbeddingJob` → `processSummarizationJob` → `processClusterJobWorker`, with `summarizeChunks`/`createStructuredSummary` in `worker/summarize.js` already making per-document LLM calls), and `Chunk.embeddingVec` (`vector(1536)`) for embedding-based comparison. `Topic`/`TopicDocument` (`worker/cluster.js`) is confirmed **project-scoped only** (`Topic.projectId` required, no org-wide equivalent) — matching `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md`'s own finding.

**Three of the original 10 FRs are descoped from this block by design, not oversight:** `FR-P2-1` Knowledge Graph Integration, `FR-P2-3` Relationship Discovery, and `FR-P2-4` Expert Discovery all depend on relationship-graph data (`DocumentRelationship`, `TopicExpertise`) that `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` (Rank 8) builds — and Rank 8 is sequenced *after* all of Rank 1 per the client's Rank-1-first mandate (`TIER1_COMPLETION_PLAN.md` §3). Building throwaway versions of these now, only to reconcile against Rank 8's real implementation later, repeats the "two systems doing the same job" mistake this project has already hit twice (`4-B`/`4-D` branch reconciliation; the ingestion/classification review-queue overlap). They're deferred to a short follow-up pass once Rank 8 ships — tracked below, not dropped.

### Scope

In scope (this block, committed — 7 FRs):
- Entity extraction from documents and chat questions (FR-P2-2).
- Cross-conversation memory beyond Phase 1's per-conversation scope (FR-P2-5).
- Decision tracking — capture *why*, not just *what* (FR-P2-6).
- Timeline generation across a topic/project (FR-P2-7).
- Cross-project/cross-department knowledge synthesis in chat (FR-P2-8).
- Knowledge gap detection from confidence-score/audit-log patterns (FR-P2-9).
- Conflict detection between documents (FR-P2-10).

Out of scope (deferred — see Problem Statement and the Deferred section below):
- FR-P2-1, FR-P2-3, FR-P2-4 — blocked on Rank 8, which hasn't shipped yet in this sequencing.
- Phase 3 (Organizational Intelligence Agent) entirely — next block, per phase discipline (do not pull Phase 3 features forward here).

### Functional Requirements (committed this block)

#### FR-P2-2 — Entity Extraction
- Identify people, projects, departments, and systems named in a document — add an LLM extraction call inside the existing `processSummarizationJob` stage (`worker/index.js`), alongside `summarizeChunks`/`createStructuredSummary` (`worker/summarize.js`), rather than a wholly new pipeline stage.
- Also extract entities from the user's chat question at query time (`src/app/api/org/[orgId]/chat/route.js`) to use as retrieval/prompt context.
- Persist results per document (`Entity` model — see Data Model Impact).

#### FR-P2-5 — Organizational Memory
- Extend memory beyond Phase 1's per-conversation `OrgConversation.activeTopic`/`activeDocumentId` (`chat/route.js` ~lines 146–157, 224–225, 311) to a per-user, cross-conversation store — e.g., recalling a topic asked about in a *different* conversation.
- Used as additional retrieval/prompt context the same way `activeTopic`/`activeDocumentId` are today — not full entity-graph reasoning (that's Phase 2's other FRs, or Phase 3).

#### FR-P2-6 — Decision Tracking
- Capture decisions and their stated rationale from document content — an LLM extraction step, alongside or immediately following FR-P2-2's entity extraction in `processSummarizationJob`.
- Surface on the document page, and via chat when a decision is cited.

#### FR-P2-7 — Timeline Generation
- Construct a chronological view of events/decisions/documents for a topic or project, using dates extracted alongside FR-P2-6.
- Surface on a project/department page — a simple ordered list is sufficient this block, not a full visual timeline component.

#### FR-P2-8 — Cross-Project Knowledge Synthesis
- Extend chat retrieval (`hybridOrgSearch()` in `src/lib/hybridSearch.js`, currently scoped to personal/department/organization via `normalizeScope()` in `chat/route.js`) to optionally synthesize across multiple projects/departments when a question calls for it.
- RBAC must still apply per-project/per-department in the underlying SQL `WHERE` (`orgSearch`/`orgKeywordSearch`/`orgFallbackTextSearch` in `src/lib/vectorSearch.js`) — widening scope must never widen access.

#### FR-P2-9 — Knowledge Gap Detection
- Batch job analyzing `ChatAuditLog` and `OrgMessage.confidence` for recurring low-confidence question patterns.
- No UI required this block, matching Phase 1's own precedent with `ChatAuditLog` (logging first, viewer later) — a log or query output is sufficient acceptance.

#### FR-P2-10 — Conflict Detection
- Background job comparing `Chunk.embeddingVec` within a topic/department for contradictory statements on the same subject.
- Advisory only — flags a pair for human review, never auto-resolves or auto-edits either document.

### Non-Functional Requirements
- All new batch/background work (extraction, gap/conflict detection) runs async in the worker or a scheduled job — never inline with chat response latency, consistent with Phase 1's NFR discipline.
- RBAC enforcement must not regress — FR-P2-8 is the highest-risk path since it deliberately widens retrieval scope; enforce in the SQL `WHERE`, not a post-filter.
- Reuse the existing per-org OpenAI key resolution rather than introducing a new key-resolution path.

### Data Model Impact (proposed, not final — confirm exact shape during Task `5-A`)
```
Entity {
  id             String
  documentId     String? → Document
  conversationId String? → OrgConversation
  name           String
  type           String   // "person" | "project" | "department" | "system"
  createdAt      DateTime
}

Decision {
  id          String
  documentId  String → Document
  statement   String
  rationale   String?
  decidedAt   DateTime?
  createdAt   DateTime
}

TimelineEvent {
  id           String
  projectId    String? → Project
  departmentId String? → Department
  documentId   String? → Document
  decisionId   String? → Decision
  occurredAt   DateTime
  description  String
}

DocumentConflict {
  id          String
  documentAId String → Document
  documentBId String → Document
  summary     String
  status      String  // "flagged" | "reviewed" | "dismissed"
  createdAt   DateTime
}

OrgMemberMemory {
  id         String
  orgId      String → Organization
  userId     String → User
  topic      String
  lastSeenAt DateTime
}
```

### Sprint Scope Cut (2026-07-18, Block A)
6 working days, 3 people. Committed: FR-P2-2, 5, 6, 7, 8, 9, 10. Deferred: FR-P2-1, 3, 4 (blocked on Rank 8, sequenced later per client mandate). Day-by-day breakdown: `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md`, `TIER1_DAY_BY_DAY_SCHEDULE.md`.

### Open Questions
1. Does entity extraction run per-document at ingestion time, or lazily at first chat reference? Recommend at ingestion, consistent with the existing chunk/embed/summarize/cluster pipeline shape — revisit if latency/cost is a problem.
2. Should `OrgMemberMemory` be a single "last topic" row per user, or a short history? Recommend a short history (e.g. last 5) — revisit if the real recall pattern demands more.
3. Does FR-P2-8's cross-project synthesis need an explicit UI toggle (like Phase 1's scope selector, currently hidden), or activate automatically when a question's phrasing implies it spans scope? Recommend automatic-when-implied, matching the "don't force UI for something inferrable" precedent from Phase 1's own scope-selector decision.

### Acceptance Criteria (this block)
- A document's people/project/department/system entities are extracted and stored without manual tagging.
- A user's cross-conversation context (a topic from a different, prior conversation) measurably changes a follow-up answer — not just Phase 1's existing per-conversation memory.
- At least one document shows a tracked decision with its captured rationale.
- A topic/project has a chronological timeline view backed by extracted data, not manual entry.
- A cross-project/cross-department question returns a synthesized answer, still RBAC-correct, instead of being silently confined to one scope.
- Recurring low-confidence question patterns are visible somewhere (log or query), not lost.
- At least one real or seeded conflicting-document pair is correctly flagged for review.
- No RBAC regression across any of the above, especially FR-P2-8.

---

### Deferred from Phase 2 — FR-P2-1, FR-P2-3, FR-P2-4

Depend on Rank 8's relationship-graph data (`DocumentRelationship`, `TopicExpertise` — see `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md`), which ships after Rank 1 per the client's Rank-1-first sequencing (`TIER1_COMPLETION_PLAN.md` §3). Scheduled as a short reconciliation pass once Rank 8 (`TIER1_COMPLETION_PLAN.md` Block D) is done — not cancelled; tracked in `TIER1_BLOCK_A_IMPLEMENTATION_TRACKER.md`'s Deferred table.

- **FR-P2-1 Knowledge Graph Integration** — persist a graph/graph-like relational model of relationships between documents, topics, people, and projects.
- **FR-P2-3 Relationship Discovery** — infer "references"/"supersedes"/"related-to" relationships between documents.
- **FR-P2-4 Expert Discovery** — answer "who should I ask about X," derived from authorship, upload history, and chat citation patterns.

---

## Phase 3 — Organizational Intelligence Agent (Audited 2026-07-25 — Block B, starting Tue 2026-07-28)

**Goal:** Transform the assistant from a knowledge analyst into an organizational reasoning system.
**Assistant Role:** Organizational Intelligence Agent
**Status:** Not started — audited and re-scoped 2026-07-25, ahead of `TIER1_COMPLETION_PLAN.md` Block B (Tue 2026-07-28 – Tue 2026-08-04). Task breakdown: `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md` (Milestone 6). Plain schedule: `TIER1_DAY_BY_DAY_SCHEDULE.md`.

### Problem Statement (audit findings, 2026-07-25)

Phase 3's original 10-FR list was carried over from the source roadmap unverified. This audit checks two things: (1) is Phase 2 — the foundation Phase 3 is supposed to build on — actually real, and (2) which of the 10 FRs are buildable against that real foundation this block.

**Phase 2 re-verified as real, not just documented.** All 7 committed Phase 2 FRs were confirmed against the live code, not the trackers' word for it (this project has a history of docs claiming "Done" with no code behind it — Rank 4 in the PRD, the SharePoint connector's stated timeline): `Entity` extraction (`worker/summarize.js:104` `extractEntities`, wired into `processSummarizationJob` at `worker/index.js:432`, plus query-time `src/lib/entityExtraction.js` `extractQuestionEntities`), `OrgMemberMemory` (`src/lib/orgMemberMemory.js` `getRecentMemory`/`recordMemoryTopics`), `Decision` tracking (`worker/summarize.js:166` `extractDecisions`, surfaced in `document/page.jsx`'s Decisions card), `TimelineEvent` generation (populated alongside decisions, `GET /api/projects/[id]/timeline` and `GET /api/org/[orgId]/department/[deptId]/timeline`), cross-project synthesis (`shouldDiversifyAcrossProjects` + `hybridOrgSearch`'s `diversifyResults` in `src/lib/hybridSearch.js`), knowledge gap detection (`scripts/task-5d/detect-knowledge-gaps.mjs`), and conflict detection (`worker/detectConflicts.js`, `DocumentConflict` model, surfaced via a Conflicts card). RBAC (`filterAccessibleDocuments` in `src/lib/documentAccess.js`, SQL-`WHERE` scoping in `src/lib/vectorSearch.js`) is consistently applied across all of it.

**Two real gaps found that constrain this block's scope, not just carried-over caveats:**
1. **No feedback mechanism exists anywhere.** `OrgMessage` has no rating/thumbs field, no route accepts feedback on a response. Any FR framed as "learns from feedback" (`FR-P3-6`) has to build this from zero, not extend something partial.
2. **`detect-knowledge-gaps.mjs` writes to a local JSON file only** (`reports/task-5d/`), not a queryable table. A live dashboard aggregating gap data (`FR-P3-7`) can't just read what Phase 2 built — it needs the gap-detection output persisted somewhere an API can query, not re-run on every request.

**The 2026-07-18 sequencing decision (`TIER1_COMPLETION_PLAN.md` §3) is re-confirmed, not re-derived from scratch:** `DocumentRelationship`/`TopicExpertise`/`DocumentProjectLink` still do not exist anywhere in `prisma/schema.prisma` (grepped, zero matches) — Rank 8 (Block D) hasn't started. The two FRs that structurally depend on that relationship graph are still blocked for the same reason they were flagged five weeks out. Confirmed against the real schema, not assumed.

### Scope

In scope (this block, committed — 6 FRs, matching `TIER1_COMPLETION_PLAN.md` §5's person split):
- Decision Intelligence — recommend/evaluate using past `Decision` rows as evidence (FR-P3-2).
- Predictive Recommendations — surface likely-relevant knowledge from usage patterns (FR-P3-4).
- Organizational Learning — feedback-weighted retrieval, built from zero (FR-P3-6).
- Knowledge Health Monitoring — org-level dashboard aggregating Phase 1/2 signals (FR-P3-7).
- Workflow Assistance — guided, non-autonomous step-by-step walkthroughs of procedural documents (FR-P3-8).
- Proactive Recommendations — same underlying signal as FR-P3-4, surfaced without a query (FR-P3-9).

Out of scope (deferred — see Deferred section below):
- `FR-P3-1` Multi-Hop Reasoning, `FR-P3-3` Root Cause Analysis — both depend on Rank 8's relationship graph, confirmed still absent from the schema.
- `FR-P3-5` Autonomous Knowledge Curation, `FR-P3-10` Agentic Task Execution — both need an explicit guardrails/approval-workflow design before any system-initiated write or external action is buildable; that design work doesn't exist yet and is a governance decision, not an engineering task this block can absorb.

### Functional Requirements (committed this block)

#### FR-P3-2 — Decision Intelligence
- Detect decision-oriented chat questions (e.g. "should we...", "what's the right call on...") with a keyword/intent check in `src/app/api/org/[orgId]/chat/route.js`, the same pattern as Phase 2's `shouldDiversifyAcrossProjects` (`chat/route.js:35`) — not a new NLP subsystem.
- When detected, retrieve related past `Decision` rows (join through shared `Entity` names or the existing keyword-search path over `Decision.statement`/`rationale`, reusing `orgKeywordSearch`'s RBAC-scoped pattern rather than a new unscoped query) and have the LLM produce a recommendation grounded in and citing those past decisions and their rationale — not just retrieve them verbatim.
- New helper module `src/lib/decisionIntelligence.js`, called from the chat route the same way `entityExtraction.js`/`orgMemberMemory.js` are today.
- No new schema — reuses `Decision` (`prisma/schema.prisma:428`) as-is.

#### FR-P3-4 — Predictive Recommendations
- New endpoint `GET /api/org/[orgId]/recommendations` that ranks documents/entities likely relevant to a user next, seeded from their `OrgMemberMemory` recent-topics list (`getRecentMemory`, `src/lib/orgMemberMemory.js:10`) run back through `hybridOrgSearch` as query terms — the same "ride existing RBAC-scoped retrieval, don't open a new path" pattern Phase 2's entity/memory context used (`REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 2 §FR-P2-2 implementation note).
- Shared ranking logic lives in one module (`src/lib/recommendations.js`) so FR-P3-9 (below) reuses it instead of duplicating.

#### FR-P3-6 — Organizational Learning
- Add `OrgMessage.feedback String?` (`"helpful" | "not_helpful"`) — genuinely new, no existing field to extend (confirmed by audit above).
- Thumbs up/down control in `org/[orgId]/chat/page.jsx` next to each assistant message; a new `PATCH /api/org/[orgId]/chat/[conversationId]/message/[messageId]` (or equivalent) route to record it.
- "Learning" this block is scoped to **feedback-weighted retrieval**, not model fine-tuning: when a past answer to a similar question received positive feedback, its cited chunks/documents get a small ranking boost in `hybridOrgSearch` for future similar questions. Keep the mechanism simple (a lookup + score adjustment) — a full learning-to-rank system is out of scope for one block.

#### FR-P3-7 — Knowledge Health Monitoring
- New `KnowledgeGap` model (see Data Model Impact) so `detect-knowledge-gaps.mjs` persists its findings instead of only writing to `reports/task-5d/` — closes the real gap found in this audit (a live dashboard can't be built on a JSON file no API reads).
- New endpoint `GET /api/org/[orgId]/health` aggregating: average `OrgMessage.confidence` over a recent window, open `DocumentConflict` count (`status = "flagged"`), and top `KnowledgeGap` rows by `gapScore` — all three signals already exist per-row from Phase 1/2, this FR is the aggregation layer, not new signal generation.
- Surfaced as a new card/section on `org/[orgId]/dashboard/page.jsx`, which already composes data from several org-scoped endpoints (settings, members, department, projects, repository) — this FR adds one more fetch, not a new page.

#### FR-P3-8 — Workflow Assistance
- Scoped to **guided walkthroughs of existing procedural documents**, not action execution (that's `FR-P3-10`, deferred with an explicit governance blocker) — a real, buildable subset rather than the full "assistant executes workflows" framing in the original roadmap line.
- When a chat question matches a document whose structured summary (`createStructuredSummary`, `worker/summarize.js`) contains sequential/numbered steps, the assistant presents them as a checklist and tracks progress via two new `OrgConversation` fields (`activeWorkflowDocumentId`, `activeWorkflowStep` — see Data Model Impact), the same per-conversation state pattern already used for `activeTopic`/`activeDocumentId`.
- User can say "next step" / "I did that" to advance; the assistant never performs the step itself, only guides.

#### FR-P3-9 — Proactive Recommendations
- Same underlying ranking logic as FR-P3-4 (`src/lib/recommendations.js`), but triggered by ambient context (current department, current project page, recent activity) instead of an explicit request — this is a surfacing-location difference, not a second algorithm.
- Surfaces as a "Related to your work" panel on `project/page.jsx` and the department page, alongside Phase 2's existing Timeline panel/tab on those same pages.

### Non-Functional Requirements
- All new batch/background work (feedback-weighted score adjustment, gap persistence) stays async/pre-computed — never inline with chat response latency, same discipline as Phase 2.
- RBAC enforcement must not regress — `FR-P3-2` (decision retrieval), `FR-P3-4`/`FR-P3-9` (recommendations), and `FR-P3-7` (health dashboard) all read across documents a user may not individually have access to; every new query goes through the same SQL-`WHERE` RBAC pattern or `filterAccessibleDocuments`, never a post-filter.
- Reuse the existing per-org OpenAI key resolution (`getOpenAIForDocument`/equivalent) rather than a new key-resolution path, consistent with Phase 2.

### Data Model Impact (proposed, not final — confirm exact shape during Task `6-A`)
```
OrgMessage + feedback String?  // "helpful" | "not_helpful"

OrgConversation + activeWorkflowDocumentId String?
                + activeWorkflowStep       Int?

KnowledgeGap {
  id                 String
  orgId              String → Organization
  topic              String
  gapScore           Float
  occurrenceCount    Int
  zeroCitationCount  Int
  lowConfidenceCount Int
  createdAt          DateTime
}
```
No changes needed to `Decision`, `Entity`, `TimelineEvent`, `DocumentConflict`, or `OrgMemberMemory` — Phase 3 reuses all of them as Phase 2 built them.

### Sprint Scope Cut (2026-07-25, Block B)
6 working days, 3 people, matching `TIER1_COMPLETION_PLAN.md` §5's assignment: Johurul (FR-P3-2 + FR-P3-7), Simran (FR-P3-4 + FR-P3-9), Sandeep (FR-P3-6 + FR-P3-8). Committed: FR-P3-2, 4, 6, 7, 8, 9. Deferred: FR-P3-1, 3 (blocked on Rank 8's relationship graph, confirmed still absent), FR-P3-5, 10 (blocked on an undesigned guardrails/approval model). Day-by-day breakdown: `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md`, `TIER1_DAY_BY_DAY_SCHEDULE.md`.

### Open Questions
1. FR-P3-6's feedback-weighted boost — does a single thumbs up/down per message provide enough signal to meaningfully re-rank, or does it need a minimum sample size per question-pattern before the boost applies (to avoid one early vote skewing results)? Recommend a minimum-occurrence threshold (e.g. 3+ similar questions), revisit if the real usage volume doesn't reach it in one block.
2. FR-P3-8's "step" matching — does detecting numbered/sequential steps in a structured summary reliably distinguish a real procedure from an unordered list that happens to use numbers? Recommend a conservative heuristic (require 3+ sequential items with imperative-verb phrasing) and accept some documents won't qualify, rather than over-fitting the detector this block.
3. FR-P3-7's `KnowledgeGap` persistence — does `detect-knowledge-gaps.mjs` run on a schedule (cron/manual trigger) writing fresh rows, or does the new `/health` endpoint trigger it inline on first request per period? Recommend scheduled/manual trigger (matches Phase 2's own precedent of gap detection being a batch job, not request-time), revisit only if staleness becomes a real complaint.

### Acceptance Criteria (this block)
- A decision-oriented chat question returns a recommendation grounded in and citing at least one relevant past `Decision`, when one exists.
- A user sees at least one prediction-based recommendation informed by their own recent chat topics, not generic/unpersonalized content.
- A chat response can be marked helpful/not-helpful, and a subsequent similar question's retrieval measurably reflects that feedback (e.g. a previously-boosted document ranks higher).
- The org dashboard shows an aggregate knowledge-health view (confidence trend, open conflicts, top gap topics) sourced from real Phase 1/2 data, not placeholder values.
- At least one procedural document can be walked through step-by-step in chat, with the assistant tracking and advancing progress without performing any step itself.
- A project or department page shows at least one proactive recommendation surfaced without the user asking for it.
- No RBAC regression across any of the above, especially FR-P3-2/4/7/9's cross-document reads.

---

### Deferred from Phase 3 — FR-P3-1, FR-P3-3, FR-P3-5, FR-P3-10

- **FR-P3-1 Multi-Hop Reasoning** and **FR-P3-3 Root Cause Analysis** — both depend on Rank 8's relationship-graph data (`DocumentRelationship`, `TopicExpertise` — see `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md`), confirmed still absent from `prisma/schema.prisma` as of this audit (2026-07-25). Same deferral as `FR-P2-1/3/4` — scheduled as part of the short reconciliation pass once Rank 8 (`TIER1_COMPLETION_PLAN.md` Block D) ships, not cancelled.
- **FR-P3-5 Autonomous Knowledge Curation** — system-initiated actions on the knowledge base (flagging/archiving/merging) without a human triggering each one. Needs an explicit guardrails/approval-workflow design before any autonomous write access is granted — a governance decision outside this block's engineering scope, per `TIER1_COMPLETION_PLAN.md` §3.
- **FR-P3-10 Agentic Task Execution** — the assistant takes actions in the system (or external tools) on a user's behalf. Same guardrail caveat as `FR-P3-5`: needs a permissions/approval model designed first, not just implemented.
