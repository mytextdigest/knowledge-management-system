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
| `6-B` | Decision Intelligence + Knowledge Health Monitoring | `DONE` | Johurul | `6-A` | 2026-07-28 | 2026-07-28 |
| `6-C` | Predictive Recommendations + Proactive Recommendations | `DONE` | Simran | `6-A` | | 2026-07-28 |
| `6-D` | Organizational Learning + Workflow Assistance | `DONE` | Sandeep | `6-A` | | 2026-07-28 |
| `6-E` | Integration & RBAC Regression Check | `IN_PROGRESS` | Johurul | `6-B`, `6-C`, `6-D` | 2026-07-28 | |
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
- **Status:** `DONE`
- **Implemented (2026-07-28):**
  - `src/lib/decisionIntelligence.js` (new) — `isDecisionQuestion()` keyword/intent check (same style as `shouldDiversifyAcrossProjects`), plus `getDecisionEvidence()`: a raw-SQL keyword search over `Decision.statement`/`rationale` joined through `Document`, reusing the exact RBAC WHERE-clause shape from `orgSearch`/`orgKeywordSearch` (department-membership join, repository lifecycle check, org-scoped project membership check) via a newly-exported `scopeSql` from `src/lib/vectorSearch.js`, and ranked with the existing `computeBM25`. No new unscoped query path.
  - `src/app/api/org/[orgId]/chat/route.js` — wired in alongside `shouldDiversifyAcrossProjects`/`classifyWorkflowRequest`: when `isDecisionQuestion()` is true, `getDecisionEvidence()` results are formatted into a "Relevant past decisions" context block plus a `DECISION_INSTRUCTION` telling the model to ground its recommendation in and cite them (not retrieve verbatim), only injected when evidence exists. Purely additive to the prompt-building path — does not touch retrieval, streaming, sources, or `activeWorkflow*`/`activeTopic` state.
  - `scripts/task-5d/detect-knowledge-gaps.mjs` — now also persists `KnowledgeGap` rows (in addition to the existing JSON report). **Open question resolved: scheduled/manual, snapshot-replace semantics** — each run `deleteMany`s the prior `KnowledgeGap` rows for exactly the org(s) it analyzed (the `--org` arg, or the distinct `orgId`s found in that run's results) then `createMany`s the fresh set, so the table is always "current gaps" rather than an ever-growing history, and a narrow `--org`/`--days` run never touches other orgs' snapshots. `/health` does not trigger detection inline (matches the NFR to keep this off the chat-latency path).
  - `src/app/api/org/[orgId]/health/route.js` (new) — `GET`, gated to `super_admin`/`dept_admin` (`isOrgAdmin`, matching the dashboard's existing client-side admin gate). Aggregates: last-200-message confidence distribution + weighted average (`high`=1/`medium`=0.5/`low`=0) scoped through `OrgConversation.orgId`, open `DocumentConflict` count (`status: "flagged"`, scoped via `documentA.orgId`), and top 5 `KnowledgeGap` rows by `gapScore`.
  - `src/app/(app)/org/[orgId]/dashboard/page.jsx` — new "Knowledge Health" section (Answer Confidence / Open Conflicts / Top Knowledge Gaps cards), added via one more fetch alongside the existing settings/members/department/projects/repository calls, same pattern as every other stat on the page.
  - Verified: `npx eslint` clean on all new/changed files; `npx next build` compiles all routes including the two new endpoints; the raw SQL in `decisionIntelligence.js` and the new Prisma queries in `health/route.js` were each dry-run against the live dev DB to confirm they resolve (no execution of the gap-detection script itself against live data, since it performs a delete+write).
- **Objective:** Both aggregate signals Johurul already owns from Phase 1 (confidence scores) and Phase 2 (`Decision` tracking, gap/conflict detection). Decision Intelligence (`FR-P3-2`) recommends/evaluates using past decisions as evidence, not just retrieval. Knowledge Health Monitoring (`FR-P3-7`) rolls confidence/gap/conflict signals into one org-level view.
- **Key files to create/modify:**
  - `src/lib/decisionIntelligence.js` (new) — decision-oriented question detection + evidence retrieval over `Decision` rows.
  - `src/app/api/org/[orgId]/chat/route.js` — wire in decision-intent detection alongside the existing `shouldDiversifyAcrossProjects` check.
  - `scripts/task-5d/detect-knowledge-gaps.mjs` — extend to also write `KnowledgeGap` rows (in addition to or instead of the JSON report), so the health endpoint has something to query.
  - `src/app/api/org/[orgId]/health/route.js` (new) — aggregate confidence/conflict/gap signals.
  - `src/app/(app)/org/[orgId]/dashboard/page.jsx` — add a knowledge-health card.
- **Acceptance criteria:** see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 Acceptance Criteria — decision-recommendation and dashboard bullets.

### Task 6-C — Predictive Recommendations + Proactive Recommendations
- **Status:** `DONE`
- **Reviewed (2026-07-28):** PR `pr-19` (`feature/task-6c-predictive-proactive-recommendations`) reviewed against this task and `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`'s FR-P3-4/FR-P3-9. Diffed against `dev` (not `main`, which is stale) — a clean, single-commit, fully additive PR: `src/lib/recommendations.js` (new, shared ranking module), `src/app/api/org/[orgId]/recommendations/route.js` (new endpoint), `src/components/recommendations/RelatedWorkPanel.jsx` (new, "Related to your work" panel), wired into both `project/page.jsx` and `department/[deptId]/page.jsx`. Does not touch `chat/route.js` or any file `6-B`/`6-D` touched — no merge-conflict or overwrite risk for `6-E`.
  - Ranking module is genuinely shared (one `getRecommendations()` call, `mode: "predictive" | "proactive"` differentiated only by whether a `query` param was supplied) — satisfies the "no duplicate ranking logic" constraint.
  - Seeds from `OrgMemberMemory.getRecentMemory` run through `hybridOrgSearch`, exactly as specified. RBAC verified: `hybridOrgSearch` → `orgSearch`/`orgKeywordSearch` apply the org/department/project access checks in the SQL `WHERE` clause (department-membership join, repository lifecycle check, org-scoped project membership check) — same pattern as Phase 2, no post-filter. Confirmed a non-member requesting a `departmentId` they don't belong to gets zero rows.
  - OpenAI key resolution uses `getOrgOpenAIKey` + `ORG_OPENAI_KEY_MISSING`, matching `chat/route.js`'s existing pattern exactly (satisfies the NFR to reuse existing key resolution, not open a new path).
  - `npx eslint` on the three new files and `npx next build` both pass clean.
  - Acceptance criteria met: recommendations are personalized (informed by `OrgMemberMemory` topics, not generic) and the project/department pages show the panel without the user asking — both bullets in the doc's Acceptance Criteria section.
- **Follow-up closed (2026-07-29, Johurul):** the note below flagged that `FR-P3-4`'s on-request path had no UI caller. Closed by adding an on-request search box to `RelatedWorkPanel.jsx` (input + "Find" button) that calls the same endpoint with an explicit `query`, toggled against the existing ambient/proactive list rather than duplicating it — same shared `recommendations.js` module, no new ranking logic. The panel is no longer hidden when ambient results are empty (it always renders so the search box stays discoverable); an empty ambient state now shows a prompt to search instead of disappearing.
- **Minor, non-blocking note (resolved above):** the route accepts an explicit `query` param (the FR-P3-4 "on-request" path) but no caller in this PR ever sends one — `RelatedWorkPanel` only drives the proactive (memory-only) path. Both FRs' acceptance criteria are still satisfied by the current wiring; flagging in case a future on-request UI (e.g. a chat-triggered "show me related work") is expected later.
- **Objective:** A natural pair per `TIER1_COMPLETION_PLAN.md` §5 — both surface content based on patterns/context, sharing one ranking module. Predictive Recommendations (`FR-P3-4`) is the on-request version; Proactive Recommendations (`FR-P3-9`) is the same logic surfaced without a query.
- **Key files to create/modify:**
  - `src/lib/recommendations.js` (new) — shared ranking logic, seeded from `OrgMemberMemory.getRecentMemory` run back through `hybridOrgSearch`.
  - `src/app/api/org/[orgId]/recommendations/route.js` (new) — `FR-P3-4`'s on-request endpoint.
  - `src/app/(app)/project/page.jsx`, department page (`org/[orgId]/department/[deptId]/page.jsx`) — `FR-P3-9`'s "Related to your work" panel, alongside the existing Phase 2 Timeline panel/tab.
- **Acceptance criteria:** see `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md` Phase 3 Acceptance Criteria — predictive-recommendation and proactive-surfacing bullets.
- **Constraint:** do not duplicate ranking logic between the two FRs — `recommendations.js` is the single source both consume.

### Task 6-D — Organizational Learning + Workflow Assistance
- **Status:** `DONE`
- **Reviewed (2026-07-28):** PR `pr-18` (`feature/task-6d-organizational-learning-workflow`) reviewed against this task and `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`'s FR-P3-6/FR-P3-8. All key files delivered: thumbs up/down UI, `PATCH .../message/[messageId]`, feedback-weighted boost in `hybridOrgSearch`, `workflowSteps` extraction in `worker/summarize.js`, `activeWorkflowDocumentId`/`activeWorkflowStep` tracking in `chat/route.js`. Both open questions resolved per the doc's recommendation (3+ occurrence threshold for feedback boost, 3+ imperative sequential steps for workflow detection). RBAC pattern for workflow-resume document access matches `vectorSearch.js`'s existing department/project membership checks — no regression. Feedback field uses `"up"`/`"down"` values (vs. the doc's proposed `"helpful"`/`"not_helpful"`) — functionally fine since `OrgMessage.feedback` is an unconstrained `String?` and the value is used consistently end-to-end (route, ranking, UI).
- **Known deviation (accepted, not blocking):** the doc's Non-Functional Requirements section specifies feedback-weighted score adjustment should be async/pre-computed, "never inline with chat response latency." This implementation computes it inline in `hybridOrgSearch` on every chat request (two bounded Prisma queries, capped at 120 messages). Accepted as-is for merge; revisit if this becomes a measurable latency issue.
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
- **Static reconciliation + RBAC audit (2026-07-28, Johurul):**
  - **`chat/route.js` additivity:** only `6-B` and `6-D` touch this file (`6-C` is fully isolated — new files only, confirmed no overlap). Read the fully-merged file end to end: `6-D`'s workflow classification/instruction block and `6-B`'s decision-evidence block are independent, sequential additions around the untouched Phase 1/2 core (entity extraction, memory, `hybridOrgSearch` call, sources/citations, confidence, audit log, `activeTopic`/`activeDocumentId` state). No overwritten logic, no shared mutable state between the two blocks.
  - **RBAC — `FR-P3-2` (`decisionIntelligence.js`):** `getDecisionEvidence()` reuses the exact WHERE-clause shape from `orgSearch`/`orgKeywordSearch` (via the now-exported `scopeSql`) — same department-membership join, repository/lifecycle check, and org-scoped-project membership check. No post-filter. Verified by dry-running the raw SQL directly against the dev DB.
  - **RBAC — `FR-P3-4`/`FR-P3-9` (`recommendations.js`, reviewed at `6-C`):** candidates come exclusively from `hybridOrgSearch` → `orgSearch`/`orgKeywordSearch`; confirmed again here that `collapseByDocument` only reorders/filters rows already RBAC-scoped by SQL, never widens them.
  - **RBAC — `FR-P3-7` (`health/route.js`):** gated to `isOrgAdmin` (`super_admin`/`dept_admin`), matching the dashboard page's existing client-side admin gate. Aggregates are org-wide (not narrowed to a `dept_admin`'s specific department) — this matches existing precedent on the same dashboard (`docCount`/`memberCount`/recent projects-and-documents are already org-wide regardless of which department the admin manages), so treated as consistent with the established design, not a regression. `DocumentConflict` count filters on `documentA.orgId` only (no `COALESCE`/OR needed): confirmed via `worker/detectConflicts.js`'s candidate query that both sides of a conflict are always constrained to the same org at creation time.
  - **`hybridSearch.js` feedback boost (`6-D`) cross-checked for RBAC leakage:** `getFeedbackDocumentWeights` reads `OrgMessage.feedback` org-wide (not department-scoped) to compute a per-document boost, but that boost only re-ranks rows that already passed RBAC-scoped SQL retrieval in `orgSearch`/`orgKeywordSearch` — it cannot surface a document the requesting user couldn't otherwise see. No new leak.
  - **Build/lint:** full-repo `npx eslint .` clean; full `npx next build` compiles every route including the two new endpoints (`recommendations`, `health`).
- **Needs manual verification (user) — not done here per instruction to avoid live browser-automation testing:**
  1. ~~Ask a decision-oriented question...~~ **VERIFIED 2026-07-29.** Asked "Should we increase our budget allocation toward engineering and AI hiring this quarter?" against org `cmqln1sip0002ji7bpvnrzcyc`'s "Annual Financial Forecast and Budget Planning.pdf" (3 `Decision` rows). Response quoted the actual decision statement and rationale verbatim, cited the document by name, folded in a second related decision (budget allocation %), and synthesized a recommendation rather than just echoing retrieval — satisfies the FR-P3-2 acceptance bullet.
     - **Demo-ability follow-up (2026-07-29):** the citation was only readable in prose, with no visual marker distinguishing it from a normal document citation — not demoable at a glance. Added a distinct "Decision" citation chip (purple, `Scale` icon) alongside the existing document-source chips in `org/[orgId]/chat/page.jsx`, clickable to open a panel showing the decision's `statement`/`rationale` as structured fields. Backend change: `chat/route.js` now tags decision-evidence entries with `type: "decision"` in the same `sources` array already persisted on `OrgMessage.sources` — no schema change, reuses the existing `Json?` column.
  2. Re-verify `6-D`'s guided workflow walkthrough ("walk me through...", "next step") still works end-to-end now that `6-B`'s block sits right next to it in `chat/route.js`.
  3. Check the "Related to your work" panel (`6-C`) actually renders on a project page and a department page for a user with some `OrgMemberMemory` history.
  4. Check the new "Knowledge Health" dashboard card — note it will show "no gaps"/zero conflicts until `scripts/task-5d/detect-knowledge-gaps.mjs` has actually been run at least once against real data (a live DB write I deliberately haven't executed — let me know if you want me to run it for a specific `--org=`).
  5. Cross-department RBAC spot-check: log in as a `dept_admin` scoped to one department and confirm Decision evidence, recommendations, and (if you want the aggregate scope tightened) the health card don't surface content from a department they don't belong to.

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
