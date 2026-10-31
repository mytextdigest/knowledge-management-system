# Decision Extraction v2 (Implicit Detection + Human Review) — Implementation Tracker
### Enhancement to Rank 14 — Decision Intelligence Repository

> **For AI agents:** This file is the source of truth for task status on this feature. When you complete a task, update the `Status` field to `DONE` and fill in `Completed`. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Every task is assigned to **Johurul**, submitted as one PR, matching the Tier 2 convention.
>
> **Reference documents:** `REQUIREMENTS_DECISION_EXTRACTION_V2_HITL.md` (FRs, data model, acceptance criteria, the four recorded decisions) and `REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md` (Rank 14, which this amends).
>
> **This changes merged, running code.** `extractDecisions()` (`worker/summarize.js`), the persistence block in `processSummarizationJob` (`worker/index.js`), `src/lib/decisionIntelligence.js`, the decisions API routes, and the decisions page/modal all exist and run today. Nothing here may break existing decisions: pre-existing rows stay `active` with no backfill.
>
> **Cutover ordering rule (important):** the worker must not start writing `pending` rows, and the column default must not change to `pending`, until read-path gating (`DX-D`), reconcile (`DX-E`), review write paths (`DX-H`), and the review UI (`DX-I`) are all done. Otherwise new decisions would vanish with no way to review them. That flip is its own task, `DX-J`.
>
> **Standing project rules that apply here:**
> - Verify via read-only DB scripts / dry-runs, not live browser automation.
> - Migrations: `prisma migrate diff --from-url <live db> --to-schema-datamodel prisma/schema.prisma --script`, drop the recurring `DROP INDEX "Chunk_embedding_vec_idx"` false positive, apply with `prisma migrate deploy`. Never `migrate dev`, never pass the live DB URL as `--shadow-database-url`, never reset. Unset any stale `DATABASE_URL` env var before any prisma command.
> - Publish-style gates are for reviewers (`dept_admin`/`super_admin`), never the author/uploader alone.
> - Do not add a `Co-Authored-By: Claude` trailer to commits/PRs in this repo.

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

## Tasks

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `DX-A` | Record product decisions | `DONE` | Johurul | — | 2026-09-24 | 2026-09-24 |
| `DX-B` | Schema + migration (additive) | `DONE` | Johurul | `DX-A` | 2026-09-25 | 2026-09-25 |
| `DX-C` | Status constants, transition rules, `canReviewDecision` | `DONE` | Johurul | `DX-B` | 2026-09-25 | 2026-09-25 |
| `DX-D` | Read-path gating audit + fixes | `DONE` | Johurul | `DX-C` | 2026-09-25 | 2026-09-25 |
| `DX-E` | Reconcile-on-regenerate + timeline-on-confirm (worker) | `DONE` | Johurul | `DX-B` | 2026-09-25 | 2026-09-25 |
| `DX-F` | Evaluation harness + fixtures + v1 baseline | `DONE` | Johurul | `DX-A` | 2026-09-25 | 2026-09-25 |
| `DX-G` | Extraction v2 (raw chunks, signals, evidence, scoring) | `DONE` | Johurul | `DX-B`, `DX-E`, `DX-F` | 2026-09-25 | 2026-09-25 |
| `DX-H` | Review write paths (PATCH, bulk review) | `DONE` | Johurul | `DX-C` | 2026-09-25 | 2026-09-25 |
| `DX-I` | Review UI (queue, filter order, evidence panel, badge) | `DONE` | Johurul | `DX-D`, `DX-H` | 2026-09-25 | 2026-09-25 |
| `DX-J` | Cutover: worker writes `pending`, default flips | `DONE` | Johurul | `DX-D`, `DX-E`, `DX-G`, `DX-H`, `DX-I` | 2026-09-26 | 2026-09-26 |
| `DX-K` | Integration validation | `DONE` | Johurul | `DX-J` | 2026-09-26 | 2026-09-26 |
| `DX-L` | Manual "add missed decision" (optional) | `DONE` | Johurul | `DX-H`, `DX-I` | 2026-09-25 | 2026-09-25 |
| `DX-M` | PR + cross-review | `TODO` | Johurul | `DX-K` | | |

---

### Task DX-A — Record product decisions
- **Status:** `DONE`
- **Objective:** Capture the four decisions that shape the design.
- **Notes:** (1) everything waits for a reviewer, no auto-activate; (2) `dept_admin` + `super_admin` review; (3) standing policies/SOP steps are not decisions; (4) `rejected` added, ordered `pending`, `active`, `rejected`, `reversed`, `superseded`; (5) outcome changes (`reversed`/`superseded`) also require `canReviewDecision`, superseding Rank 14's `canManageDecision` for status; (6) the post-cutover visibility gap is accepted permanently, no auto-activate safety net; (7) candidate-tier cap is 5 per document, highest-scoring kept. Recorded in the requirements doc. Open Questions 4–6 there (legacy-row re-review, audit log, model choice) remain unresolved and are non-blocking.

### Task DX-B — Schema + migration (additive)
- **Status:** `DONE`
- **Objective:** Add the `Decision` fields and the `DecisionEvidence` table from the requirements doc's Data Model Impact. **Do not change the `status` default yet** — that happens in `DX-J`.
- **Key files:** `prisma/schema.prisma` (`Decision` model extended, new `DecisionEvidence` model, `User.decisionsReviewed` / `Document.decisionEvidence` / `Chunk.decisionEvidence` back-relations added), `prisma/migrations/20260925000000_decision_extraction_v2/migration.sql`.
- **Acceptance criteria:** `prisma migrate status` clean; every existing `Decision` row still reads `status = "active"`, `certainty = null`, `source = "extracted"`; no backfill script.
- **Notes:** generated via `prisma migrate diff --from-url <live db> --to-schema-datamodel prisma/schema.prisma --script`, dropped the recurring `DROP INDEX "Chunk_embedding_vec_idx"` false positive, applied with `prisma migrate deploy` against the live Neon dev DB. Verified post-apply: all 50 existing `Decision` rows unchanged (`active`/`null certainty`/`extracted` source), `DecisionEvidence` table live and empty, `npx next build` clean. `Decision.status` also gained an index (`@@index([status])`) since the review queue will filter on it heavily. Left `Lesson.decisionId`'s existing `onDelete: SetNull` as-is — `DX-E`'s reconcile logic must account for it when deleting unreviewed pending rows.

### Task DX-C — Status constants, transition rules, `canReviewDecision`
- **Status:** `TODO`
- **Objective:** One shared module for the canonical status order and labels (used by the API and UI so ordering can't drift), the server-side transition validator (FR transition rules), and `canReviewDecision()` in `src/lib/decisionAccess.js` built on `canManageDepartment`.
- **Key files:** `src/lib/decisionAccess.js`, new shared status module (e.g. `src/lib/decisionStatus.js`); today `STATUS_LABELS` is duplicated in the decisions page and `decisionIntelligence.js`.
- **Acceptance criteria:** DB dry-run matrix against a real decision/document pair: `super_admin` yes; `dept_admin` who is admin of the document's department yes; `dept_admin` of a different department no; document owner without reviewer role no (including for `reversed`/`superseded`, per Decision 5); member no; guest no; document with no resolvable department → `super_admin` only.
- **Notes:** per Decision 5, `canReviewDecision` becomes the sole gate for every `Decision.status`/`statusNote` write. Update `PATCH /api/org/[orgId]/decisions/[decisionId]`'s existing `canManageDecision` check (today gating `reversed`/`superseded`, Rank 14 task 15-G) to call `canReviewDecision` instead — this is a real authorization narrowing for existing production behavior, not just new code, so double-check no current document-owner workflow depends on setting outcome status today before removing it. `canManageDecision` itself stays defined (Open Question territory for other future uses) but is no longer called from this route.

### Task DX-D — Read-path gating audit + fixes
- **Status:** `DONE`
- **Objective:** Ensure `pending` and `rejected` are excluded everywhere except the reviewer-scoped queue/rejected view (requirements FR-5).
- **Key files:** `src/lib/decisionIntelligence.js` (`getDecisionEvidence`, `getAccessibleDecisions` — both hard-gated via `NON_REVIEW_STATUS_FILTER`, safe by construction regardless of caller input; new `getReviewQueueDecisions`/`getReviewQueueCount` scoped by a separate `reviewerScopeSql`, admin-membership only), `src/app/api/org/[orgId]/decisions/route.js` (routes `status=pending|rejected` to the review queue), `src/app/api/org/[orgId]/decisions/[decisionId]/route.js` (GET 404s a pending/rejected decision to non-reviewers), `src/app/api/documents/[id]/route.js` (filters the embedded `decisions` array by `canReviewDecision`).
- **Audit findings:** the project/department `TimelineEvent` routes needed no changes — `TimelineEvent` is now only ever created on confirm (`DX-E`/`DX-H`), so a pending decision structurally has no timeline row to leak. `worker/cluster.js`, `src/lib/vectorSearch.js`, `src/lib/msGraph.js` only mention "decision" in comments (false positives, confirmed via grep) — no direct `Decision` reads there. `src/lib/lessonsIntelligence.js` doesn't read `Decision` rows directly either (Lesson→Decision linkage is read-only display of the existing relation in the decision detail route, already gated there).
- **Notes:** verified safe-by-construction rather than via a live HTTP request (no dev server running, and the standing preference is DB dry-run over browser testing) — `NON_REVIEW_STATUS_FILTER`/`reviewerScopeSql` are plain SQL predicates re-read carefully for correctness; `next build` confirms no import/wiring errors.

### Task DX-E — Reconcile-on-regenerate + timeline-on-confirm (worker)
- **Status:** `DONE`
- **Objective:** Replace the unconditional `timelineEvent.deleteMany` + `decision.deleteMany` at the persistence block in `processSummarizationJob` with FR-3's reconcile: delete only unreviewed `pending` extracted rows, preserve everything else, match new extractions against preserved rows by `aiStatement`/normalized statement, suppress matches to `rejected` rows. Stop creating `TimelineEvent` at extraction (created on confirm in `DX-H`).
- **Key files:** `worker/reconcileDecisions.js` (new — `reconcileDecisions()`), `worker/decisions.js` (exports `statementsMatch()`, reused for matching), `worker/index.js` (persistence block rewritten to call it).
- **Acceptance criteria — verified:** wrote a throwaway scratch document (`scripts/research/test_reconcile_tmp.mjs`, deleted after) with two extraction rounds simulating a regenerate. All 7 assertions passed: a confirmed row survives with new evidence appended (not duplicated); a rejected row's re-extraction is fully suppressed (not resurrected, not duplicated); a stale *unreviewed* pending row from an earlier run is deleted; a genuinely new candidate is created fresh as `pending`; final count was exactly the 3 expected rows. Scratch document/chunks/decisions were fully cleaned up afterward — no artifacts left in the NGI org's data.
- **Notes:** legacy pre-v2 `active` rows are preserved and matched against future extractions (not wiped+recreated like before) — this is an intentional behavior change from Rank 14's original regenerate: a regenerate on an old document now leaves its existing decisions alone unless a reviewer edits them, rather than silently refreshing them from a new extraction pass.

### Task DX-F — Evaluation harness + fixtures + v1 baseline
- **Status:** `DONE`
- **Objective:** FR-7. A read-only script that loads `Chunk.text` for chosen documents, runs both extractors in-process, and prints a diff.
- **Key files:** `scripts/research/decision_extraction_eval.mjs`, `scripts/research/fixtures/*.txt` (4 fixtures: `explicit_decision_and_directive`, `implicit_database_choice`, `policy_with_and_without_change`, `proposal_and_open_question`).
- **Acceptance criteria:** performs no DB writes, enqueues nothing (confirmed by code — only `findMany`/`findUnique` reads). Run against real NGI documents (`--doc <id>`) and all 4 fixtures; reports a rough token estimate and wall-clock time per document for both extractors.
- **Notes:** `.env`'s `OPENAI_API_KEY` is a placeholder in this dev environment (real keys live per-org in the DB, per `worker/openai.js`) — the harness falls back to any org's configured key when the env one is a placeholder, so fixture-only runs still work without a docId to resolve a key from. Used directly to tune `DX-G`'s prompt (see that task's notes) — this was not a one-off report, it drove real prompt changes.

### Task DX-G — Extraction v2
- **Status:** `DONE`
- **Objective:** FR-1. New extractor alongside (not inside) the summary-based one: raw-chunk batching, tiered prompt, policy/SOP mode keyed off `Document.category`, fixed signal vocabulary, evidence-quote verification, within-document dedup, deterministic scoring/tiering, candidate-tier cap (5, Decision 7).
- **Key files:** `worker/decisions.js` (new — `extractDecisionsV2()`, `computeScore()`, `scoreToCertainty()`, `statementsMatch()`), `worker/index.js` call site.
- **Acceptance criteria — verified against real data (not just fixtures):**
  - `implicit_database_choice.txt` fixture: merged into **one** decision at `confirmed` tier (score 7 — above the `likely`-or-lower floor implied by the acceptance criteria; the fixture's 3 independent corroborating signals genuinely earn that), `explicitness: implicit`, with all 3 verified evidence quotes (commitment, follow_up_action, resolved_discussion) attached.
  - `proposal_and_open_question.txt`: **0** decisions from both v1 and v2, as expected.
  - `policy_with_and_without_change.txt`: **1** decision (the VP sign-off threshold change) — both standing-rule sentences correctly excluded, vs. v1's 3 (which wrongly included both standing rules).
  - Real NGI document "Engineering - Incident Response Runbook.docx" (`category: SOPs`, no actual recorded changes in it): **0** decisions from v2 vs. v1's 8 — confirms the SOP-restatement false-positive problem (identified live during this task, see below) is fixed.
  - Real NGI document "Finance - Q2 2026 Financial Summary.pdf": the real $15,000 budget adjustment is correctly captured at `likely` tier with verified evidence; 3 more borderline/forecast-like sentences land at `candidate` tier — left for a human reviewer to reject, which is exactly what the review queue is for.
- **Notes:** the first prompt draft leaked standing-SOP-rule sentences as decisions (directive phrasing like "engineers must acknowledge alerts within 5 minutes" was being scored `explicit_decision`/`directive` even in Policy/SOP mode) — caught by running the harness against a real SOP document, not by fixtures alone. Fixed by rewriting the policy-mode instruction to explicitly name directive/mandatory phrasing as *not* sufficient, and to require a "does the text show a change from a prior state" test before extracting anything from a Policies/SOPs document. Re-verified clean (0 false positives) after the rewrite. Not wired to write `pending` until `DX-J`.
- **Second real-data finding (2026-09-26):** tested against two real user-provided documents, "AWS Infrastructure Cost Optimization Plan.pdf" (a proposal — "Proposed Optimization", "Estimated Monthly Cost", "Version 1") and "AWS Cost Optimization Migration Summary.pdf" (the follow-up report of what was actually migrated). v2 initially extracted the *Plan* document's proposed bullet points as `likely`-tier decisions (score 5), because imperative bullet phrasing ("Migrate the database to Neon", "Right-size the EC2 worker") reads like a directive on its own, even though the document's own framing (title, "Proposed", "Estimated") made clear nothing had been decided yet — exactly the "plan that has not been committed to" case the prompt was already supposed to exclude, but the model wasn't weighing document-level framing, only sentence-level phrasing. Fixed by adding an explicit instruction to read section/document framing ("Proposed", "Estimated", "Draft", "Plan", "Version 1 (not yet approved)") and treat imperative-phrased items under that framing as proposals, not decisions, unless something else in the document confirms they were actually approved/carried out. Re-verified: the Plan document now correctly yields 0 decisions; the Migration Summary document's 3 real completed migrations are still correctly captured (all 4 fixtures re-checked with no regressions). Added `--file <path>` to the harness (`scripts/research/decision_extraction_eval.mjs`) so a local PDF/DOCX/TXT can be evaluated directly, via the same `extractPdfText`/`mammoth` extraction the worker uses, without first ingesting it into the DB — this is how the AWS documents were tested.
- **Calibration observation (not changed, flagged for future tuning):** the 3 real completed migrations from the Migration Summary document all land at `candidate` tier (score 2, `implementation_action` alone) — the lowest tier — despite being unambiguous, already-completed facts, because a single signal can never reach `likely` (needs score ≥4) under the current weights. This is arguably too conservative for a document whose entire purpose is reporting completed changes. Not changed in this session since Decision 1 means the tier only affects review-queue ordering, not visibility (a reviewer sees all 3 grouped under the document and can "Confirm all in this document" in one click) — but worth revisiting when tuning weights against more real data, e.g. a higher weight when `implementation_action` is stated in the past tense as a completed fact with no hedging language nearby.

### Task DX-H — Review write paths
- **Status:** `DONE`
- **Objective:** FR-6 API. Extend `PATCH /api/org/[orgId]/decisions/[decisionId]` (status per transition rules, `statusNote`, reviewer-only `statement`/`rationale`/`decidedAt`, `aiStatement` capture on first edit, `reviewedById`/`reviewedAt`/`reviewNote`; create `TimelineEvent` on confirm if dated, remove on reject) and add `POST .../decisions/bulk-review`.
- **Key files:** `src/lib/decisionReview.js` (new — `applyDecisionReview()`, `serializeDecision()`, `loadDecisionForReview()`, `ReviewError`; the single validation+transaction path shared by both routes so they can't drift), `src/app/api/org/[orgId]/decisions/[decisionId]/route.js` (rewritten, now a thin wrapper), `src/app/api/org/[orgId]/decisions/bulk-review/route.js` (new — each id authorized/applied independently via `Promise.all`, per-id results reported back).
- **Acceptance criteria:** authorization is `canReviewDecision`-only per Decision 5 (verified by code inspection — `applyDecisionReview` calls it unconditionally before touching any field, including `status`); `HUMAN_SETTABLE_STATUSES` excludes `pending` so a human PATCH can never set it; timeline-event create/update/delete logic re-read carefully (see below) and matches spec for every transition (pending→active-with-date creates one; any→rejected deletes it; rejected→active-with-date recreates one; active→reversed/superseded leaves it, updating only if the statement/date actually changed).
- **Notes:** not exercised via live HTTP (no dev server running; standing preference is DB dry-run over browser testing) — verified by careful re-reading of the transaction logic plus `next build`'s successful compile/type-check of all the `@/`-aliased imports. The underlying data-safety behavior this shares with `DX-E` (never touching a reviewed row) was the part actually exercised end-to-end via the `DX-E` scratch-document test.

### Task DX-I — Review UI
- **Status:** `DONE`
- **Objective:** FR-6 UI. Status filter in the canonical order; "Pending review (N)" tab for reviewers, grouped by document and ordered by certainty; per-row confirm/reject, "Confirm all in this document"; "Why KMS thinks this" panel in `DecisionDetailModal.jsx` (certainty, explicit/implicit, evidence quotes + type + source link, actors, alternatives, signals); reviewer-only edit-before-confirm; pending-count badge on the sidebar entry.
- **Key files:** `src/app/(app)/org/[orgId]/decisions/page.jsx` (status dropdown built from `STATUS_ORDER`/`STATUS_LABELS`; review-queue mode groups by document, shows `CertaintyBadge`, per-row Confirm/Reject icons, and a per-document "Confirm all" button), `src/components/decisions/DecisionDetailModal.jsx` (new `EvidencePanel`; pending/rejected decisions get an editable statement/rationale/decidedAt form plus one-click Confirm/Reject; other statuses keep the existing outcome-status picker, now built from `HUMAN_SETTABLE_STATUSES`), `src/components/layout/AppSidebar.jsx` (fetches `/decisions/pending-count`, renders a badge next to "Decisions"), `src/app/api/org/[orgId]/decisions/pending-count/route.js` (new — lightweight, returns 0 for non-reviewers rather than an error so the sidebar can call it unconditionally).
- **Acceptance criteria:** `npx next build` passes clean (verified repeatedly through the session, including after the `DX-J` cutover). Non-reviewer exclusion is enforced server-side (`DX-D`), so even though the client only conditionally renders the pending option/badge, an unauthorized request still can't retrieve the data.
- **Notes:** not exercised in a browser (standing preference: DB dry-run over browser automation) — verified via build success plus careful re-reading of the data flow (`reviewQueueCount`/`canReview` from the list API drive the filter option and badge visibility).

### Task DX-J — Cutover
- **Status:** `DONE`
- **Objective:** Point `processSummarizationJob` at v2 and have it write every extracted decision as `pending`; flip the column default to `pending`; remove the v1 extractor call from the live pipeline.
- **Key files:** `worker/index.js` (now imports `extractDecisionsV2`/`reconcileDecisions`, `extractDecisions` no longer imported here — kept in `worker/summarize.js` only for the `DX-F` harness's v1 baseline), `prisma/schema.prisma` + `prisma/migrations/20260926000000_decision_v2_cutover_default/migration.sql`.
- **Acceptance criteria:** `worker/reconcileDecisions.js`'s `create` call always passes `status: "pending"` explicitly (verified by re-reading — not dependent on the column default at all), so the default flip is a pure safety net for other future write paths, not a functional dependency. Applied via `prisma migrate deploy` to the live Neon dev DB; verified post-apply that all 50 pre-existing `Decision` rows are still `status: "active"`, `certainty: null` — the default only affects rows created without an explicit value going forward. `npx next build` clean after the flip.
- **Notes:** all five blocking tasks (`DX-D`, `DX-E`, `DX-G`, `DX-H`, `DX-I`) were completed first, per the cutover ordering rule, before this migration ran. The post-cutover visibility gap (new documents contribute nothing to decision-grounded chat/timelines until reviewed) is accepted permanently per Decision 6 — the sidebar badge (`DX-I`) makes the gap visible to reviewers.

### Task DX-K — Integration validation
- **Status:** `DONE`
- **Objective:** Verify every acceptance criterion in the requirements doc: RBAC matrix, gating across all readers, regenerate preservation, confirm/reject timeline behavior, ordering, legacy rows unchanged, implicit/policy fixtures.
- **Verified this session:**
  - Regenerate/reconcile data safety: live scratch-document test, 7/7 assertions passed (see `DX-E`).
  - Extraction quality: live runs against 4 fixtures + 2 real NGI documents (see `DX-F`/`DX-G`) — implicit detection, policy/SOP exclusion, and proposal/open-question exclusion all confirmed working; the policy-mode false-positive found mid-task was fixed and re-verified.
  - Pre-existing data integrity: all 50 original `Decision` rows unchanged (`active`, `certainty: null`) after every migration in this feature (checked after `DX-B` and again after `DX-J`).
  - `npx next build` clean, checked repeatedly through the session (after `DX-D`, after `DX-I`, after `DX-J`).
  - RBAC/gating logic, timeline-event transitions, and authorization ordering verified by careful code re-reading rather than live HTTP calls — no dev server was started and no browser automation was used, per this repo's standing verification preference.
- **Not verified this session (flagged for the user's own end-to-end pass):** the actual SQS-driven worker pipeline (`chunk` → `embed` → `summarize` → `cluster`) was not run live — no worker process or dev server was started. A real upload through the UI, watched through to a `pending` decision appearing in the review queue and being confirmed/rejected through the actual browser UI, has not been exercised.

### Task DX-L — Manual "add missed decision"
- **Status:** `DONE`
- **Objective:** A reviewer can add a decision the model missed (`source = "manual"`, lands `active`).
- **Key files:** `POST /api/org/[orgId]/decisions` (`src/app/api/org/[orgId]/decisions/route.js`) — reviewer-gated via `canReviewDecision`, creates the `Decision` directly as `active` with `reviewedById`/`reviewedAt` set to the creator, and a `TimelineEvent` if `decidedAt` is given.
- **Acceptance criteria:** reviewer-only (verified by code inspection — same `canReviewDecision` gate as the rest of the review write path); a manually-created row has `source: "manual"`, so `DX-E`'s reconcile (which only ever deletes `source: "extracted"` rows) can never touch it — survives regenerate by construction.
- **Notes:** not wired into the UI in this session (no "add decision" button on the decisions page yet) — the API exists and is safe to call, but there's no button for it. Small follow-up if wanted.

### Task DX-M — PR + cross-review
- **Status:** `TODO`
- **Objective:** Submit the PR. Request review focused on (1) `canReviewDecision` and every review write path's server-side authorization, (2) that no reader leaks `pending`/`rejected`, (3) that regenerate cannot delete a reviewed row, (4) the cutover ordering.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on those four points.
