# Tier 1 — Schedule

**Team:** Johurul, Simran, Sandeep · **Start:** Mon 2026-07-20 · **Target:** no later than Tue 2026-09-01
**Order (client-mandated):** Rank 1 Phase 2 → Rank 1 Phase 3 → then Rank 3, Rank 4, and Rank 8 **in parallel** (changed 2026-07-30 — see note below Block B).

Blocks A and B (below) still ran as day-by-day sequential sprints and are done. Everything after that point is **not** tracked day-by-day anymore — each of the three remaining features (Rank 3, Rank 4, Rank 8) has exactly one owner who works independently at their own pace and submits their own PR when it's ready, rather than the team synchronizing on a shared daily grid. For the *why* behind the original ordering, the FRs deferred and why, and confidence levels — see `TIER1_COMPLETION_PLAN.md`.

---

## Block A — Rank 1 Phase 2 (Knowledge Understanding)
**Mon Jul 20 – Mon Jul 27 · 6 days**

FRs audited and finalized 2026-07-18 — see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 2 section. Confirmed: zero of the original 10 FRs exist in the repo yet. `FR-P2-1`/`FR-P2-3`/`FR-P2-4` (Knowledge Graph, Relationship Discovery, Expert Discovery) are descoped — deferred to a follow-up after Block D since they depend on Rank 8's relationship data, not built yet in this sequencing. Committed: `FR-P2-2/5/6/7/8/9/10`.

| Day | Date | Johurul | Simran | Sandeep |
|---|---|---|---|---|
| 1 | Mon Jul 20 | **All 3:** land shared schema (`Entity`, `Decision`, `TimelineEvent`, `DocumentConflict`, `OrgMemberMemory`) — the FR cut is already decided, this day is schema + kickoff only |
| 2 | Tue Jul 21 | FR-P2-2 Entity Extraction — LLM extraction call in `processSummarizationJob` (`worker/index.js`), alongside `summarizeChunks` | FR-P2-6 Decision Tracking — decision/rationale extraction in the same worker stage | FR-P2-8 Cross-Project Synthesis — extend `hybridOrgSearch()` scope handling in `src/lib/hybridSearch.js` |
| 3 | Wed Jul 22 | FR-P2-2 — extract entities from chat questions in `chat/route.js`; wire into retrieval context | FR-P2-6 — surface decisions on the document page | FR-P2-9 Knowledge Gap Detection — batch job over `ChatAuditLog` + `OrgMessage.confidence` |
| 4 | Thu Jul 23 | FR-P2-5 Organizational Memory — `OrgMemberMemory`, cross-conversation recall beyond `activeTopic`/`activeDocumentId` | FR-P2-7 Timeline Generation — chronological extraction alongside FR-P2-6 | FR-P2-10 Conflict Detection — `Chunk.embeddingVec` comparison within topic/department |
| 5 | Fri Jul 24 | FR-P2-5 — wire memory into chat retrieval/prompt context | FR-P2-7 — timeline UI surface on project/department page | FR-P2-10 — finish + review-queue surfacing for flagged pairs |
| 6 | Mon Jul 27 | **All 3:** integration, RBAC regression check (FR-P2-8 is highest-risk — widened scope must not widen access), cross-review, merge to `dev` |

---

## Block B — Rank 1 Phase 3 (Organizational Intelligence Agent)
**Tue Jul 28 – Tue Aug 4 · 6 days**

FRs audited and finalized 2026-07-25 — see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 section. Phase 2 re-verified as genuinely built (not just documented) before scoping on top of it. Confirmed: `FR-P3-1`/`FR-P3-3` (Multi-Hop Reasoning, Root Cause Analysis) remain blocked on Rank 8's relationship graph, still absent from the schema; `FR-P3-5`/`FR-P3-10` (Autonomous Curation, Agentic Task Execution) remain blocked on an undesigned guardrails/approval model. Committed: `FR-P3-2/4/6/7/8/9`. Task breakdown: `TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md`.

| Day | Date | Johurul | Simran | Sandeep |
|---|---|---|---|---|
| 1 | Tue Jul 28 | **All 3:** audit against real Phase 2 output; confirm Multi-Hop Reasoning / Root Cause Analysis / Autonomous Curation / Agentic Task Execution are descoped; cut to 6-FR committed set |
| 2 | Wed Jul 29 | Decision Intelligence — build on Phase 2's decision tracking | Predictive Recommendations — pattern-detection logic | Organizational Learning — feedback-loop scaffolding |
| 3 | Thu Jul 30 | Decision Intelligence — recommend/evaluate logic | Predictive Recommendations — wire into chat/dashboard | Organizational Learning — usage-pattern tracking |
| 4 | Fri Jul 31 | Knowledge Health Monitoring — aggregate confidence/gap/conflict signals | Proactive Recommendations — context-based surfacing | Workflow Assistance — multi-step guidance scaffolding |
| 5 | Mon Aug 3 | Knowledge Health Monitoring — dashboard UI | Proactive Recommendations — finish + wire in | Workflow Assistance — finish + wire in |
| 6 | Tue Aug 4 | **All 3:** integration, cross-review, merge to `dev` |

> **Milestone: Rank 1 complete (client priority satisfied) — Tue Aug 4, 2026.** 5 graph-dependent FRs remain intentionally deferred to a follow-up once Rank 8 ships (see main plan §3).

**Change from here on (2026-07-30):** the original plan ran Rank 3+4 and Rank 8 as two sequential 10-day blocks, gated by a shared Day-1 migration each block. That's replaced: all three remaining features start now, at the same time, each with a single owner working independently. The original sequencing existed to keep Rank 8's relationship graph from being needed by Rank 1 Phase 2/3 before it existed — that's already resolved (Rank 1 is done, the 5 dependent FRs are deferred regardless of when Rank 8 lands). Rank 8's only remaining tie to Rank 4 is soft: classification's category output is *one input signal* for expertise discovery, not a hard blocker — Sandeep doesn't need to wait on Simran's PR to start or to merge.

---

## Remaining Work — Rank 3, Rank 4, Rank 8 (parallel, one owner each)

**Started:** Wed Aug 5, 2026 · **Target:** no later than Tue Sep 1, 2026, but not tracked to a fixed daily grid — each owner paces their own feature.

| Feature | PRD Rank | Owner | Requirements doc |
|---|---|---|---|
| SharePoint Ingestion Connector + Needs-Review Queue | 3 | **Johurul** — hardest: only feature with an external OAuth/Graph API dependency, and owns the queue both this feature and Rank 4 feed into | `REQUIREMENTS_INGESTION_PIPELINE.md` |
| Automatic Classification | 4 | **Simran** | `REQUIREMENTS_AUTO_CLASSIFICATION.md` |
| Knowledge Context Engine | 8 | **Sandeep** | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` |

**The one thing that still needs coordination, done once, up front:** Johurul and Simran agree the `Document` status value contract (`pending_classification` → `needs_review` → `published`) before either opens a migration PR — this is a naming agreement, not shared code. Sandeep's feature has no schema overlap with either (`DocumentRelationship`/`TopicExpertise`/`Topic.scope`/`DocumentProjectLink` are all new, on tables the other two don't touch) and needs no coordination to start.

**Migration-PR rule (shared dev DB):** each owner pulls latest `dev` and rebases before opening their own migration PR, and merges it promptly rather than leaving it open — avoids the drift/reset failure mode `feedback_prisma_migrate_diff_shadow_db.md`-style incidents come from when multiple people run `prisma migrate dev` against the same shared DB out of sync with each other.

**Suggested light-touch checkpoints** (not mandatory, just enough to catch drift early):
- End of Week 1 (~Aug 8): each owner's own migration is merged.
- Midpoint (~Aug 19): quick progress/blocker share between the three.
- Wrap: each owner submits their own PR when their feature is ready; cross-review; merge to `dev`. RBAC regression check before merge, since all three features touch access-control-sensitive surfaces (queue reassignment, expertise discovery, connector setup).

> **Milestone: Tier 1 done** once all three PRs are merged — except the 5 FRs deferred from Blocks A/B (`TIER1_COMPLETION_PLAN.md` §3), scheduled as a short follow-up once Rank 8's relationship graph is real.

---

## At a glance

| Phase | Scope | Dates | Ends with |
|---|---|---|---|
| A | Rank 1 Phase 2 | Jul 20 – Jul 27 | — |
| B | Rank 1 Phase 3 | Jul 28 – Aug 4 | **Rank 1 done** |
| Remaining | Rank 3 + Rank 4 + Rank 8, in parallel | Started Aug 5, target no later than Sep 1 | **Tier 1 done** |
