# Sprint Overview — Conversational Knowledge Assistant

## Sprint Cadence

The CKA roadmap is delivered phase by phase, one **10-day sprint per phase**: Phase 1 → Phase 2 → Phase 3, never in parallel. This document covers **Sprint 1 — Phase 1 (Knowledge Retrieval / Organizational Search Assistant)**. Sprint 2 (Phase 2) and Sprint 3 (Phase 3) reuse this same document's structure — update it in place when each phase starts rather than creating new files, matching `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`'s single-document convention.

| Phase | Goal | Assistant Role | Sprint |
|---|---|---|---|
| **Phase 1** | Knowledge Retrieval | Organizational Search Assistant | **Sprint 1 — in progress, everything below** |
| Phase 2 | Knowledge Understanding | Organizational Knowledge Analyst | Sprint 2 — not started |
| Phase 3 | Knowledge Reasoning | Organizational Intelligence Agent | Sprint 3 — not started |

A code audit found the gap against Phase 1's own requirements is large: 11 of 14 requirements missing, 2 partial, and 1 (structured responses) in direct conflict with the current system prompt — see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` for the full gap table. Nothing in this sprint's task list pulls Phase 2/3 scope (knowledge graph, expert discovery, decision reasoning, autonomous curation) forward.

CKA Phase 1 is this sprint's sole focus for all 3 people. The following are **paused, not cancelled**, and resume in a future sprint:

| Paused item | PRD Rank | Spec |
|---|---|---|
| Automatic Knowledge Classification | 4 | `REQUIREMENTS_AUTO_CLASSIFICATION.md` |
| Knowledge Context Engine (foundation) | 8 | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` |
| Automated Knowledge Ingestion Pipeline (SharePoint connector) | 3 | `REQUIREMENTS_INGESTION_PIPELINE.md` |

---

## Current Assignments — CKA Phase 1 (Org Chat only)

All work targets `src/app/api/org/[orgId]/chat/` and `src/app/(app)/org/[orgId]/chat/page.jsx`. Project Chat and Document Chat are explicitly out of scope (see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Scope).

| Person | Workstream | Tracker Task | Branch |
|--------|-----------|--------------|--------|
| **Johurul** | Conversational Core — streaming, structured output, confidence, auto-title, session memory | `4-C` | `feature/cka-conversational-core` |
| **Simran** | Retrieval — hybrid search (vector + existing BM25), query expansion, scope selector | `4-B` | `feature/cka-retrieval` |
| **Sandeep** | Citations & Trust — persisted citations, chunk preview, audit logging | `4-D` | `feature/cka-citations` |

Full task detail (key files, acceptance criteria) lives in `CKA_IMPLEMENTATION_TRACKER.md` — this doc has the schedule, that one has the work breakdown.

---

## Day-by-Day Timeline (10 days)

| Days | Johurul (4-C) | Simran (4-B) | Sandeep (4-D) |
|------|---------|--------|---------|
| **1** | Leads shared migration (`4-A`): `OrgMessage.sources/confidence`, `OrgConversation.activeTopic/activeDocumentId`, new `ChatAuditLog` table. Merges to `dev` end of day — everyone else pulls and branches. | Plan; read `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`; extract `computeBM25` out of `projects/ask/route.js` into a shared util | Plan; read requirements spec; design chunk-preview popover |
| **2** | Auto-title generation (LLM call on first message) | Wire extracted BM25 into `orgSearch()` as a second candidate set alongside vector search | Write `sources`/`confidence` to `OrgMessage` on each turn (persist, don't just return) |
| **3** | Streaming SSE — backend (`route.js`, `stream: true`) | Query variant generation (LLM rephrase, 2-3 variants) before retrieval | Chunk-preview popover UI wired to persisted citations |
| **4** | Streaming SSE — frontend (incremental token rendering in Org Chat page) | Merge/rerank vector + keyword result sets | Citation click navigates to source document/repository page |
| **5** | Fix system-prompt conflict — allow structured/sectioned answers; add confidence-score computation and UI badge | Department/personal scope selector UI + wire into `orgSearch()` params | Basic `ChatAuditLog` write path (user, org, question, cited docs) per query |
| **6** | Session memory — track `activeTopic`/`activeDocumentId`, use as follow-up context | Tune hybrid rerank weighting against sample queries; RBAC regression check on new retrieval paths | Extend persisted-citations reload path (`GET .../chat/[conversationId]`) to return stored sources |
| **7** | **Integration (`4-E`, all 3):** merge streaming + hybrid retrieval + structured output + citations into one coherent flow; fix conflicts across the three branches | | |
| **8** | **UI Polish (`4-F`, all 3):** loading/error states for streaming, mobile responsiveness, dark mode pass on new components (scope selector, confidence badge, chunk popover) | | |
| **9-10** | **PR + cross-reviews (`4-G`, all 3)** — each person reviews at least one other's work before merge | | |

---

## Coordination Points

1. **End of Day 1 (hard gate):** Johurul's schema migration (`4-A`) must be merged to `dev` before Simran or Sandeep can branch — this blocks both other workstreams.
2. **Day 7 integration is the highest-risk point:** all three workstreams touch `route.js` and `page.jsx` simultaneously (streaming, hybrid retrieval, citation persistence). Budget real time for merge conflicts and cross-testing, not just a rubber-stamp integration day.
3. **RBAC regression check is mandatory at Day 6/7:** every new retrieval path (BM25, query variants, scope selector) must keep filtering in the SQL `WHERE` clause, consistent with the existing rule — verify department-scoped users still can't retrieve out-of-scope documents.
4. **Streaming is required this sprint, not backlog:** the CKA spec's own performance NFR (first token <1s) makes it a hard requirement, not a UX nicety.

---

## Deferred / Fast-Follow (not this sprint)

- PPTX/Markdown ingestion, app-level encryption at rest, full NL metadata parsing, Document/Project chat parity — see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Scope and `CKA_IMPLEMENTATION_TRACKER.md` Deferred table.
- Rank 3 (SharePoint ingestion), Rank 4 (Auto Classification), Rank 8 (Context Engine) — paused, resume next sprint.
- CKA Phase 2 (Knowledge Understanding) and Phase 3 (Organizational Intelligence Agent) — separate future sprints per the roadmap above.
