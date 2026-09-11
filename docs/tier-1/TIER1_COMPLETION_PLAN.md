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
| 3 | Automated Knowledge Ingestion Pipeline | TBD | ✅ **Done — code-audited 2026-08-10 against the code actually merged to `dev`, not taken on the PR merge alone; one real gap found and fixed same day. Full breakdown in `docs/TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md` `7-I`/`7-J`.** PR #23 merged 2026-08-09. The connector: two-phase Microsoft Graph auth (one-time delegated site picker + ongoing app-only `Sites.Selected` sync), Graph delta sync with source-level dedup (`(sourceProvider, externalId)` + storage-delta accounting on re-sync so an edited file doesn't double-count storage), `OrgIntegration`/`SyncRun` migrated and confirmed applied, OAuth tokens confirmed encrypted at rest (read the live DB row directly, decrypted it, round-tripped), `super_admin`-only RBAC clean across every route this feature added, and a per-sync-run digest email confirmed wired. **The audit caught a real gap:** FR-5's central requirement — one unified Needs-Review queue for both sources — wasn't actually true. `GET .../needs-review` still filtered solely on `Document.lifecycle: "draft"`, a stub left in place from before Rank 4 merged, so a manually-uploaded document Rank 4's classifier flags `classificationStatus: "needs_review"` never appeared in the queue and the confirm route (409s on anything not `lifecycle: "draft"`) couldn't act on it — those documents were only reachable through a second, separate surface Rank 4 shipped on `RepositoryDocumentCard.jsx`. **Fixed (`7-J`) same day:** the queue's query and confirm route now recognize either signal, real classification data (confidence, suggested department, duplicate flag) replaced the stubs, and "Accept" now promotes a suggested department instead of leaving the document undepartmented. Re-verified against the live dev DB: a classification-flagged manual document now appears in and can be actioned through the queue; the original SharePoint draft path is unchanged (regression-checked); `RepositoryDocumentCard.jsx`'s inline panel was deliberately left in place, not retired, since collapsing it into the `super_admin`-only queue is a separate product decision (Open Question #6) that hasn't been made. | The system now automatically pulls files in from SharePoint, and every document awaiting review — whether it arrived by manual upload or automatic sync — lands in the same review queue, with the actual suggested category/department/duplicate info visible, not a placeholder. |
| 4 | Automatic Knowledge Classification | TBD | ✅ **Done — merged to `dev` via PR #22, code-audited 2026-08-10 (not just taken on the PR author's word).** `worker/classify.js` runs category classification plus an advisory department suggestion, gated by `isClassificationRelevant()` to `scope=repository` and org-promoted `scope=project` documents only (private documents are skipped, so no LLM spend on content that can't reach the Repository). `prisma/schema.prisma` carries `categoryConfidence`, `classificationStatus`, `suggestedDepartmentId`/`departmentSuggestionConfidence`, `contentHash`, the lifecycle-suggestion fields, and the `DocumentDuplicate` model — migrated and confirmed applied to the dev DB (`prisma migrate status`: up to date). `RepositoryDocumentCard.jsx` surfaces Uncategorized/confidence/classification-status badges, one-click duplicate Confirm/Dismiss, and a dismissible lifecycle-staleness suggestion. The DB-level integration test (`scripts/task-8/classification.integration.test.mjs`) was actually executed against the dev DB during this audit (not just read) and confirmed `classifyDocument`/`detectDocumentDuplicates` write real, readable `Document`/`DocumentDuplicate` rows. Full 8-A–8-H breakdown in `docs/TIER1_AUTO_CLASSIFICATION_IMPLEMENTATION_TRACKER.md`. | The system now automatically tags each document's category and quietly flags a likely department, possible duplicates, and stale documents — a person only needs to confirm or correct a suggestion, not create one from scratch. |
| 5 | Cross-Document Reasoning | Done | ✅ `worker/cluster.js` + `Topic`/`TopicDocument` model, real. No work needed. | Nothing — this already works. |
| 6 | Knowledge Summarization | Done | ✅ `worker/summarize.js`, real. No work needed. | Nothing — this already works. |
| 7 | Enterprise Knowledge Repository | Done | ✅ The whole repository/department/document feature — obviously real and in daily use. No work needed. | Nothing — this already works. |
| 8 | Knowledge Context Engine | TBD | ✅ **Done — merged to `dev` via PR #20, code-audited 2026-08-10 (not just taken on the PR author's word).** `prisma/schema.prisma` carries `Topic.orgId`/`scope`, `DocumentRelationship`, `DocumentProjectLink`, `TopicExpertise` — migrated, additive, confirmed no column overlap with Rank 3/4's concurrent schema changes. `worker/knowledgeContext.js` runs as a background job chained onto the existing SQS `"cluster"` job (no upload/chat/search latency); relationship computation uses a bounded pgvector KNN query, and repository-scope topic naming reuses `worker/cluster.js`'s existing LLM-naming/Bhattacharyya logic rather than a parallel implementation. Surfaced in three places: "Related documents" + one-click Confirm/Dismiss project-link suggestions on the document page, an "N related" badge on repository cards, and a "Suggested people to ask" panel in Enterprise Chat. **The audit caught a real RBAC bug** in the first version — `documents/[id]/route.js` was granting the full-bypass access flag to any `dept_admin`, not just `super_admin`, which would have let a department admin see draft/private-project documents as "related" outside their own department; fixed before this row was marked Done. **One caveat carried forward, not hidden:** RBAC correctness here is verified by code review of the SQL `WHERE` clauses, not yet by an executed integration test against seeded cross-department data — `docs/TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md` `9-G` is left `IN_PROGRESS`, not `DONE`, for exactly this reason. | The system can now tell you "what documents relate to this one" and suggest "who might know about this topic" in chat — the layer described in this row is built and live, with one open item (deeper automated access-control testing) still in progress rather than fully closed out. |

**Bottom line: 1 of 8 Tier-1 capabilities still needs work** — Rank 1 (Phase 2 + Phase 3 only; Phase 1 is done). **Ranks 3, 4, and 8 are now done** (PR #23, PR #22, and PR #20 respectively, all merged and code-audited — see rows above). Ranks 2, 3, 4, 5, 6, 7, 8 need nothing further from this list, with Rank 8 carrying one open follow-up item (`9-G` RBAC integration testing) and Rank 3 carrying one deliberate, documented design choice (`RepositoryDocumentCard.jsx`'s inline review panel kept alongside the queue, not retired) — neither blocks its row being marked Done.

**Note on Rank 3's row above:** the audit that was pending as of the last update to this doc has now been run (2026-08-10). Rank 3's PR (#23, `feature/task-7-sharepoint-ingestion-pipeline`) merged to `dev` 2026-08-09, and the merged code was read and re-verified against `REQUIREMENTS_INGESTION_PIPELINE.md` line by line, plus spot-checked live against the dev DB — not taken on the strength of the merge alone, per this doc's own rule (§1). The audit found a real, confirmed gap (FR-5's queue unification — a manually-uploaded, classification-flagged document never appeared in the Needs-Review queue) rather than just an untested-but-plausibly-fine caveat like Rank 8's. That gap was fixed the same day (`7-J`, `docs/TIER1_INGESTION_PIPELINE_IMPLEMENTATION_TRACKER.md`) and re-verified live against the dev DB before this row was marked Done.

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
