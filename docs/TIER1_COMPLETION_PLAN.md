# Tier 1 (Knowledge Intelligence Core) — Completion Plan

**Prepared:** 2026-07-18 (updated 2026-07-18) · **Team:** Johurul, Simran, Sandeep (3 people, full-time) · **Starting point:** the bug-fix sprint (`BUG_FIX_TASKS.md`, T-1–T-11) is fully merged as of 2026-07-17, and Rank 1 Phase 1 (`4-A` through `4-G`) is confirmed fully done as of 2026-07-10 — so the team has open capacity starting Monday 2026-07-20 with no unfinished CKA Phase 1 work to carry forward.

This plan covers everything needed to close out **Tier 1 — Knowledge Intelligence Core** as defined in `KMS PRD-June 3rd 2026.pdf`. It does not cover Tier 2–5.

---

## 1. Verified current status (code-audited, not taken from the PRD's status column)

The PRD's own "Status" column has already been shown to be unreliable — Rank 4 is marked "Done" in the PRD with zero code behind it. Every row below was checked against the actual repo before being trusted. A plain-English column is included for non-technical readers.

| Rank | Capability | PRD says | Real state (code-verified) | In plain English: what's left |
|---|---|---|---|---|
| 1 | Conversational Knowledge Assistant | Done | **Phase 1 of 3 is fully done** — `4-A` through `4-G` all complete, confirmed 2026-07-10: live end-to-end browser test with a funded OpenAI key passed, and the Personal/Department/Organization scope selector was deliberately hidden as a Phase 1 product decision (not an open bug). Phases 2 & 3 are unscoped placeholder feature lists only — not started. | The chatbot's first of 3 planned phases is fully working and tested for real, not just in theory. It only covers phase 1 of the 3 phases the full feature is meant to have — phases 2 and 3 haven't been scoped or built yet. |
| 2 | Semantic Knowledge Retrieval | Done | ✅ `orgSearch()` / `src/lib/vectorSearch.js` — real, in production use. No work needed. | Nothing — this already works. |
| 3 | Automated Knowledge Ingestion Pipeline | TBD | **Partially done.** Verified per `Ingestion Pipeline - SharePoint Overview.docx` and `REQUIREMENTS_INGESTION_PIPELINE.md`: everything that happens *after* a file enters the system (organizing, summarizing, making it searchable) is real and automated today. What's missing is pulling files in automatically from SharePoint (or Google Drive / OneDrive) — right now every document still has to be uploaded by hand, one at a time. Zero connector code exists in `src/`, `worker/`, or `scripts/`. | Once a document is in the system, everything else already happens automatically. What's missing is the "auto-fetch it from SharePoint/Drive/OneDrive" part — someone still has to manually upload each file today. |
| 4 | Automatic Knowledge Classification | TBD | **TBD — not actually started.** `prisma/schema.prisma` has no `categoryConfidence`, `classificationStatus`, or `DocumentDuplicate` — `Document.category` is a plain nullable field a human fills in by hand. No `worker/classify*.js` exists anywhere. This was paused before any code was written, despite the PRD marking it Done. Fully scoped already in `REQUIREMENTS_AUTO_CLASSIFICATION.md` — work still needs to be done to build it. | The system doesn't yet sort or tag documents by itself — a person still has to manually pick the category and department for every file. |
| 5 | Cross-Document Reasoning | Done | ✅ `worker/cluster.js` + `Topic`/`TopicDocument` model, real. No work needed. | Nothing — this already works. |
| 6 | Knowledge Summarization | Done | ✅ `worker/summarize.js`, real. No work needed. | Nothing — this already works. |
| 7 | Enterprise Knowledge Repository | Done | ✅ The whole repository/department/document feature — obviously real and in daily use. No work needed. | Nothing — this already works. |
| 8 | Knowledge Context Engine | TBD | Not started. No `DocumentRelationship`, `TopicExpertise`, or org-wide `Topic.scope` in schema. Fully scoped already in `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md`. | The system can't yet tell you "who's an expert on this" or "what documents relate to this one" — that layer hasn't been built yet. |

**Bottom line: 3 of 8 Tier-1 capabilities still need work** — Rank 1 (Phase 2 + Phase 3 only; Phase 1 is done), Rank 3 (partially done — connector layer still needed), Rank 4 (not started), Rank 8 (not started). Ranks 2, 5, 6, 7 need nothing.

**Note on `Ingestion Pipeline - SharePoint Overview.docx`:** this stakeholder-facing doc states the SharePoint connector's "Timeline: built as part of the current sprint (July 1–10, 2026)." The code audit shows that didn't happen — this is the same documented-but-not-actually-built pattern already seen with the PRD's Rank 3/Rank 4 status, just in a different document. The plan below treats it as fully unbuilt regardless of what that doc's timeline line says.

---

## 2. Rank 1 Phase 1 — confirmed closed (correction from the first draft of this plan)

The first draft of this plan flagged `4-E`/`4-F`/`4-G` as unfinished, since `CKA_IMPLEMENTATION_TRACKER.md` still listed them `TODO` and the tracker's own text still carried an open verification caveat. Per team confirmation, both were actually resolved and the tracker has now been updated (`CKA_IMPLEMENTATION_TRACKER.md`, `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`):

1. **Retrieval scope selector (FR-G):** the Personal/Department/Organization UI control is intentionally hidden for Phase 1 — a deliberate product decision (scope selection isn't an access-control mechanism, and most org members don't yet have `DepartmentMember` rows to make "Department" scope meaningful), not an unshipped feature. Org Chat defaults to `organization` scope; the backend remains ready to re-enable the UI in a later phase if the team decides to.
2. **Live LLM end-to-end test:** completed and passed with a funded OpenAI key — streaming, hybrid retrieval, confidence scoring, citations, and auto-title were all exercised for real in the browser, not just dry-run/mocked.

Rank 1 Phase 1 (`4-A` through `4-G`) is fully done as of 2026-07-10. No further work is needed on it — the remaining Rank 1 scope is Phase 2 and Phase 3 only (Blocks A and B below), which the client has now designated the immediate priority (§3).

---

## 3. Sequencing rationale (revised — client mandate)

**Client requirement (2026-07-18): all of Rank 1 (Phase 2 and Phase 3) must be implemented before moving on to Rank 3, Rank 4, or Rank 8.** This overrides the original sequencing logic in the previous draft of this plan, which put Rank 3+4 and Rank 8 first specifically because Phase 2/3 overlap with them. That overlap doesn't go away just because the order changed — it just changes how it has to be handled:

1. **Rank 1 Phase 2, then Phase 3, first** — per the client's requirement.
2. **Rank 3 + Rank 4 together, next.** Same reasoning as before: `REQUIREMENTS_INGESTION_PIPELINE.md` requires synced documents to land in the *same* Needs-Review queue Rank 4's classification builds — building them apart risks the two-parallel-queues problem the docs warn against.
3. **Rank 8 (Context Engine) last.**

**The consequence of doing Phase 2/3 before Rank 8, spelled out:** the previous draft's 6-day Phase 2 estimate relied on Rank 8 already existing to cover 3 of Phase 2's 10 planned FRs (Knowledge Graph, Relationship Discovery, Expert Discovery) for free. With Rank 8 now last, that discount is gone. Building throwaway versions of those 3 FRs now, only to reconcile or replace them once Rank 8 lands, is the exact "two parallel systems doing the same job" mistake this project has already hit twice (`4-B`/`4-D` branch conflicts, the ingestion/classification review-queue overlap). The same logic hits two of Phase 3's FRs too — Multi-Hop Reasoning (`FR-P3-1`) and Root Cause Analysis (`FR-P3-3`) both explicitly depend on the relationship graph, which won't exist until Rank 8 ships at the very end.

**Resolution applied in this plan:** those 5 FRs are explicitly **descoped from Phase 2/3's committed build now** and deferred to a short reconciliation pass right after Rank 8 (Block D) ships — not abandoned, not silently dropped, just sequenced to when their prerequisite actually exists:

| FR | Depends on | Deferred to |
|---|---|---|
| FR-P2-1 Knowledge Graph | Rank 8's relationship model | After Block D |
| FR-P2-3 Relationship Discovery | Rank 8's `DocumentRelationship` | After Block D |
| FR-P2-4 Expert Discovery | Rank 8's `TopicExpertise` | After Block D |
| FR-P3-1 Multi-Hop Reasoning | Phase 2's/Rank 8's relationship graph | After Block D |
| FR-P3-3 Root Cause Analysis | Phase 2's/Rank 8's relationship graph | After Block D |

This means **"Rank 1 fully implemented" as delivered by Block A+B is the full, real, buildable scope minus these 5 graph-dependent items**, which is the honest way to hit the client's requirement without wasting a build cycle. Flag this explicitly to the client rather than letting "Rank 1 done" quietly mean something slightly different than "every FR in the original roadmap list."

Two more Phase 3 FRs (`FR-P3-5` Autonomous Knowledge Curation, `FR-P3-10` Agentic Task Execution) are separately deferred — not because of sequencing, but because the source roadmap itself says they need a guardrails/approval-workflow design before they're buildable at all, regardless of order.

**Update 2026-07-30:** the sequencing above only ever required Rank 1 (Phases 2–3) to finish *before* Rank 3/4/8 — it did not require Rank 3+4 to finish before Rank 8 specifically. That was a team-chosen ordering (§6/§7 as originally written), not a client mandate. With Rank 1 done and the 5 graph-dependent FRs already deferred regardless of when Rank 8 lands, there's no remaining reason to run Rank 3+4 and Rank 8 sequentially. §6 and §7 below are superseded: Rank 3, Rank 4, and Rank 8 now run in parallel, one owner per feature, from Aug 5 — see `TIER1_DAY_BY_DAY_SCHEDULE.md` for the current plan.

---

## 4. Block A — Rank 1 Phase 2, Knowledge Understanding (6 working days: Mon Jul 20 – Mon Jul 27)

`REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` is explicit that Phase 2's feature list (FR-P2-1 through FR-P2-10) is carried over **unaudited** and must be re-scoped against the real repo — the same way Phase 1's list of 14 FRs turned into an actually-buildable 9.

**Why 6 days:** calibrated to this team's real Phase 1 velocity (schema merge `4-A`, July 3, to the last integration commit before the bug-fix sprint interrupted things, July 10 — exactly 6 working days for 9 committed FRs with 3 people, audit-and-build blended rather than sequential). After descoping FR-P2-1/3/4 (§3), committed scope is: Entity Extraction, Organizational Memory, Decision Tracking, Timeline Generation, Cross-Project Knowledge Synthesis, Knowledge Gap Detection, Conflict Detection — 7 FRs, comparable in size to Phase 1's 9.

| Person | Workstream |
|---|---|
| Johurul | Entity Extraction (FR-P2-2) + Organizational Memory (FR-P2-5) — extends the conversational/session layer he already owns from Phase 1 |
| Simran | Decision Tracking (FR-P2-6) + Timeline Generation (FR-P2-7) — document-content analysis, adjacent to her Phase 1 retrieval work |
| Sandeep | Cross-Project Knowledge Synthesis (FR-P2-8) + Knowledge Gap Detection (FR-P2-9) + Conflict Detection (FR-P2-10) — builds on the citations/confidence signals he owns from Phase 1 |

- **Day 1:** Audit the 10 planned FRs against the repo, confirm the FR-P2-1/3/4 descope, cut to the 7-FR committed set, land any shared schema.
- **Days 2–4:** Build in parallel, split by person as above.
- **Day 5:** Finish + start cross-integration where workstreams touch (e.g., Entity Extraction feeding Decision Tracking).
- **Day 6:** Integration, RBAC regression check, cross-review, merge.

If Day 1's audit finds more real scope than expected (the way the original Phase 1 audit found 11 of 14 FRs missing), cut scope further rather than let the block run long.

---

## 5. Block B — Rank 1 Phase 3, Organizational Intelligence Agent (6 working days: Tue Jul 28 – Tue Aug 4)

After descoping the 4 FRs blocked on sequencing or governance (§3: `FR-P3-1`, `FR-P3-3`, `FR-P3-5`, `FR-P3-10`), committed scope is: Decision Intelligence, Predictive Recommendations, Organizational Learning, Knowledge Health Monitoring, Workflow Assistance, Proactive Recommendations — 6 FRs.

| Person | Workstream |
|---|---|
| Johurul | Decision Intelligence (FR-P3-2) + Knowledge Health Monitoring (FR-P3-7) — both aggregate signals from Phase 1 confidence scores and Phase 2's decision tracking/gap detection |
| Simran | Predictive Recommendations (FR-P3-4) + Proactive Recommendations (FR-P3-9) — a natural pair, both surface content based on patterns/context |
| Sandeep | Organizational Learning (FR-P3-6) + Workflow Assistance (FR-P3-8) |

- **Day 1:** Audit against the real Phase 2 output; confirm the 4-FR descope; cut to the 6-FR committed set.
- **Days 2–4:** Build in parallel, split by person as above.
- **Day 5:** Cross-integration where workstreams touch.
- **Day 6:** Integration, cross-review, merge.

**Rank 1 (Phases 1–3, minus the 5 graph-dependent FRs deferred per §3) is complete at the end of this block — Tue Aug 4, 2026.** This is the point at which the client's "Rank 1 first" requirement is satisfied and Rank 3/4/8 work can begin.

---

## 6. Remaining Work — Rank 3, Rank 4, Rank 8, run in parallel (started Wed Aug 5, target no later than Tue Sep 1)

Superseded from the original two-sequential-block plan (§6/§7 as originally written — see Update note in §3). All three requirements docs are fully scoped with FRs and acceptance criteria. Each feature is one person's full end-to-end ownership, one PR, submitted independently — not a shared task split across the team the way earlier Tier 1 blocks were.

| Person | Feature | PRD Rank | Owns | Requirements doc |
|---|---|---|---|---|
| **Johurul** | SharePoint Ingestion Connector + Needs-Review Queue | 3 | Connector abstraction, OAuth app registration, `OrgIntegration`/`SyncRun` models, Graph API delta sync, "Sync Now" button, digest email, **and** the Needs-Review queue UI + accept/reassign/create-project actions that both this feature's synced documents and Rank 4's flagged documents feed into. Hardest of the three — only feature with an external-system (Graph API) dependency, plus the integration surface. | `REQUIREMENTS_INGESTION_PIPELINE.md` |
| **Simran** | Automatic Classification | 4 | `worker/classify.js` (new), category/department-suggestion/duplicate-detection logic, `Document.categoryConfidence`/`classificationStatus`, `DocumentDuplicate` model | `REQUIREMENTS_AUTO_CLASSIFICATION.md` |
| **Sandeep** | Knowledge Context Engine | 8 | Org-wide topic model, document relationship graph, expertise discovery, document-to-project linking, relationship-aware search/chat surfacing — `Topic.scope`, `DocumentRelationship`, `TopicExpertise`, `DocumentProjectLink` | `REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE.md` |

**Coordination, done once, up front:** Johurul and Simran agree the `Document` status value contract (`pending_classification` → `needs_review` → `published`) before either opens a migration PR — a naming agreement, not shared code; each feature's own schema (Johurul's `OrgIntegration`/`SyncRun`/`sourceProvider`/`externalId`, Simran's `categoryConfidence`/`classificationStatus`/`DocumentDuplicate`) is additive and independently mergeable regardless of order. Sandeep's schema (`DocumentRelationship`/`TopicExpertise`/`Topic.scope`/`DocumentProjectLink`) shares no columns with either of the other two and needs no coordination to start — Rank 8's only tie to Rank 4 is soft (classification's category output is one input signal for expertise discovery, not a hard blocker), so Sandeep starts immediately rather than waiting.

**Migration-PR rule (shared dev DB):** pull latest `dev` and rebase before opening a migration PR; merge promptly rather than leaving it open, to avoid migration-history drift on the shared dev database.

RBAC regression check applies to all three before merge — Johurul's queue reassignment, Sandeep's expertise discovery, and Johurul's connector setup are all `super_admin`-gated and all need verification that access wasn't widened.

**Once all three ship, the 5 FRs deferred in §3 (FR-P2-1/3/4, FR-P3-1/3) become buildable** — schedule a short follow-up pass to close them out using Rank 8's now-real relationship graph, rather than the throwaway version building them earlier would have required.

---

## 7. Total timeline

| Phase | Scope | Working days | Calendar dates |
|---|---|---|---|
| A | Rank 1 Phase 2 | 6 | Jul 20 – Jul 27 |
| B | Rank 1 Phase 3 | 6 | Jul 28 – Aug 4 |
| Remaining | Rank 3 + Rank 4 + Rank 8, in parallel, one owner each | — (self-paced per owner, not tracked daily) | Started Aug 5, target no later than Sep 1 |

**Rank 1 itself (client's priority) is done at the end of Block B — Tue Aug 4, 2026** — 12 working days from today, with the caveat that 5 graph-dependent FRs are deferred to a short pass once Rank 8 ships (§3, §6).

**Confidence:** medium for Blocks A/B's *timeboxing* (6 days each is grounded in this team's real Phase-1 velocity, not a guess) but low for their *scope* until each is actually audited — the same way Phase 1's on-paper plan changed once it was audited. High for the Rank 3/4 requirements (already fully FR-scoped in existing requirements docs). Medium for Rank 8 (fully scoped but unbuilt, so untested assumptions remain). Running all three in parallel removes the sequencing risk the original two-block plan carried, but shifts risk onto each owner's individual pace, since there's no longer a shared daily checkpoint forcing early visibility into slippage.

**The single biggest risk to this whole estimate isn't any technical unknown — it's another unplanned interruption.** The bug-fix sprint (T-1–T-11, July 13–17) already pulled the team off Rank 1 Phase 1 close-out for the better part of a week. If Tier 2+ work, production incidents, or new bug reports pull the team away again, add that time on top of the estimate above rather than assuming it absorbs invisibly.

---

## 8. Process recommendations (carried from this audit, not new opinions)

- **Split by file ownership wherever the work allows it**, the way `BUG_FIX_TASKS.md` did ("zero shared files between groups, no need to coordinate merge order"). Every time this project split work by *feature* instead (`4-B`/`4-D` both touching `route.js`/`page.jsx`), both branches needed manual reconciliation against `dev` after the fact. §6's one-feature-one-owner-one-PR model is the current form of this rule.
- **Land your own migration early and merge it promptly** — don't leave a migration-bearing PR open against the shared dev DB longer than necessary; rebase on latest `dev` before opening it.
- **Don't let a tracker go stale.** `CKA_IMPLEMENTATION_TRACKER.md` listed `4-E`/`4-F`/`4-G` as `TODO` well after they were actually done — update status the day work happens, not weeks later.
- **Test against a real, funded LLM key before calling a milestone done.** This is exactly what closed out Phase 1 — do the same for every future milestone before marking it `DONE`.
- **Flag the deferred-FR list (§3) to the client explicitly** when reporting "Rank 1 done" — the honest version of "done" here excludes 5 FRs that structurally can't be built correctly before Rank 8 exists, plus 2 more blocked on a governance decision outside engineering's control.
- **With no shared daily grid anymore, each owner is responsible for surfacing their own blockers early** — the light-touch checkpoints in `TIER1_DAY_BY_DAY_SCHEDULE.md` (end of Week 1, midpoint) exist specifically to catch silent slippage that a daily standup used to catch by default.

See `TIER1_DAY_BY_DAY_SCHEDULE.md` for the current schedule derived from this plan — day-by-day for the completed Blocks A/B, single-owner/self-paced for the remaining three features.
