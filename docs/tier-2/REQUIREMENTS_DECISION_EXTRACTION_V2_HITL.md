# Requirements: Decision Extraction v2 — Implicit Detection & Human Review

**Capability:** Decision Extraction v2 (enhancement to Rank 14 — Decision Intelligence Repository)
**Owner:** Johurul — end-to-end, one PR.
**Purpose:** Find decisions that are implied rather than stated, show *why* each was detected, and put a human reviewer between extraction and anything the organization treats as a recorded decision.
**Source discussion:** `temp/discusson-decision-extraction.md` (ChatGPT discussion on implicit decisions), adapted — see "What is deliberately not adopted".

---

## Problem Statement

`extractDecisions()` (`worker/summarize.js`) today makes one `gpt-4o-mini` call over the **joined per-chunk summaries** (3–5 bullets each, truncated to 24,000 chars) and keeps only "actual decisions explicitly stated in the text." Every result is persisted straight away and is immediately visible to chat grounding, timelines, and the repository page. Observed consequences:

1. **Implicit decisions are missed by construction.** "Okay, I'll proceed with the PostgreSQL approach" or "I've added Redis to the Terraform" does not survive chunk summarization, and the prompt forbids inferring anyway.
2. **Nothing explains why a row is a decision.** No evidence, no confidence, no explicit/implicit distinction. A client asking "why did the model decide this is a decision?" has no per-row answer.
3. **No human checkpoint.** Extraction output is trusted immediately. In the NGI org, 16 of 25 extracted rows have no rationale, and several are procedures rather than decisions (e.g. "Complete and submit the onboarding checklist to HR").
4. **Regenerate destroys any human work.** `processSummarizationJob` runs `decision.deleteMany` and `timelineEvent.deleteMany` for the document on every run (`worker/index.js`). Once humans review decisions, that wipe is unacceptable.
5. **Status conflates nothing yet, but cannot express review.** `Decision.status` is `active | reversed | superseded` (Rank 14 FR-2) — an outcome lifecycle with no "not yet reviewed" or "not a decision" state.

This feature amends Rank 14's "extraction logic is unchanged" scope statement; Rank 14's repository, outcome-tracking, and lesson-linkage requirements otherwise stand.

---

## Decisions Already Made (2026-09-24)

| # | Decision | Answer |
|---|----------|--------|
| 1 | Does anything auto-activate? | **No. Every newly extracted decision waits for a reviewer**, including explicit, high-confidence ones. |
| 2 | Who can confirm / reject? | **`dept_admin` and `super_admin` only.** |
| 3 | Do standing policies / SOP steps count as decisions? | **No**, unless the text records a choice or a change. |
| 4 | Add a `rejected` status? | **Yes, ordered third: `pending`, `active`, `rejected`, `reversed`, `superseded`.** |
| 5 | Do outcome changes (`active`→`reversed`/`superseded`) also require a reviewer? | **Yes.** This supersedes Rank 14 FR-2's authorization ("document owner or department admin") — every status transition, not just confirm/reject, now requires `canReviewDecision`. `canManageDecision` is no longer used for status. |
| 6 | Post-cutover visibility gap: new decisions are invisible until reviewed, with no time limit. Acceptable? | **Yes, accepted permanently — no auto-activate safety net.** |
| 7 | Cap on `candidate`-tier rows per document? | **Yes, 5.** The 5 highest-scoring candidates are kept; the rest are dropped, not merely hidden. |

---

## Scope

In scope:
- Extraction v2: reads raw chunk text, detects explicit and implicit decisions, records evidence and signals, computes a certainty tier deterministically in code.
- Status model extended with `pending` and `rejected`; every new extraction lands `pending`.
- Review workflow: queue, confirm, edit-and-confirm, reject, bulk actions, restricted to `dept_admin`/`super_admin`.
- Regenerate that preserves reviewed decisions instead of wiping them.
- Gating of every existing decision reader so `pending` and `rejected` never reach chat grounding, timelines, or non-reviewers.
- A dry-run evaluation harness to measure v2 against v1 on real documents before cutover.

Out of scope (deferred):
- **Cross-document evidence aggregation and temporal reasoning** (the discussion's evidence levels 4–5, "decision consequences" across sources). The evidence table below is shaped to receive this later, but nothing builds it now.
- `supersededById` / structured supersedes links (Rank 14 still uses free-text `statusNote` for supersession).
- An org-level "review strictness" setting (auto-activate high-confidence). Deliberately rejected for now by Decision 1.
- Reviewer notifications beyond a count badge (email/in-app digests).
- Changes to chat-grounding retrieval logic, timelines UI, or the Lessons model beyond the read-gating in FR-5.

---

## Status Model

`Decision.status`, in canonical order:

| Order | Value | Meaning | Set by |
|-------|-------|---------|--------|
| 1 | `pending` | Extracted, awaiting review. Invisible outside the review queue. | Worker only (never by a human) |
| 2 | `active` | Confirmed as a real decision that currently holds. | Reviewer confirm; also all pre-existing rows |
| 3 | `rejected` | Reviewer judged it is not a decision. Kept as a tombstone so regenerate does not resurrect it. Invisible outside the review/rejected view. | Reviewer |
| 4 | `reversed` | Was a decision; later undone (Rank 14). | `canManageDecision` (unchanged) |
| 5 | `superseded` | Was a decision; replaced by a later one (Rank 14). | `canManageDecision` (unchanged) |

Transition rules (enforced server-side in the PATCH route, not the UI):
- **Every** status transition requires `canReviewDecision` (FR-4) — `dept_admin`/`super_admin` only. This supersedes Rank 14 FR-2's "document owner or department admin" rule (Decision 5); `canManageDecision` is no longer consulted for status changes. Humans can never set `pending`.
- `rejected` → `active` is allowed (reviewer undoing a rejection).
- `statusNote` follows the same authorization as the status change it accompanies.

Pre-existing rows are **not** backfilled: they already read `active` and stay `active`. They keep `certainty = null`.

`certainty` (`confirmed | likely | candidate`) is the model-side judgment and is **separate from lifecycle**. Because Decision 1 routes everything to `pending`, certainty does not decide routing — it orders and labels the review queue so a reviewer can spend attention where it is needed.

---

## Functional Requirements

### FR-1 — Extraction v2 (worker)
- Runs inside the existing `"summarize"` job, replacing the `extractDecisions()` call — no new job type (project rule: no parallel systems). Wrapped non-fatally like lesson extraction, and extraction completes **before** any existing rows are touched, so an LLM failure never wipes existing pending rows.
- **Input is raw `Chunk.text`**, batched in order (with the neighbouring chunk included for context, since a question and its answer often straddle a boundary), not chunk summaries. Each batch keeps its chunk ids so evidence can point back to the source chunk. Batch size and a per-document character cap are constants in one file; if a document exceeds the cap, chunks are ranked by decision-language keyword hits and the top ones are used. A cost/token measurement in the dry-run (FR-7) decides whether a keyword pre-filter is needed at all.
- **Definition (prompt):** a decision is a choice, commitment, approval, directive that records a choice or change, or settled course of action that determines what an individual/team/organization will do or use. It does not require the words "decided" or "approved." Explicitly not decisions: proposals, options under consideration, recommendations without acceptance, open questions, conditional intent, experiments, hypotheticals, uncommitted plans, actions that do not show a choice was made.
- **Policy/SOP mode (Decision 3):** when `Document.category` (already assigned by `classifyDocument` earlier in the same job) is `Policies` or `SOPs`, or the text is a standing rule/procedure/checklist, only extract text that records the *act* of choosing or changing something ("effective X the merge method changed from merge-commit to squash"). A standing rule stated as policy is not a decision.
- **Per-decision output:** `statement`, `subject`, `rationale` (null if not stated — unchanged), `decidedAt` (`YYYY-MM-DD` or null — unchanged parsing), `explicitness` (`explicit | implicit`), `actors[]`, `alternatives[]`, `signals[]`, and `evidence[]` (`{ quote, type, chunkIndex }`).
- **`signals` come from a fixed vocabulary**, e.g. positive: `explicit_decision`, `explicit_commitment`, `approval`, `directive`, `resolved_discussion`, `implementation_action`, `assumed_direction`; negative: `described_as_proposal`, `open_question_remains`, `conditional_language`, `experimental_language`. Unknown labels returned by the model are dropped.
- **Certainty is computed in code, not trusted from the model.** A single module holds signal weights and tier thresholds (starting from the additive scheme in the source discussion: explicit decision/commitment +3, directive +2, implementation action +2, negatives −2/−3), mapping score → `confirmed | likely | candidate`, and score ≤ 0 → not stored. Only signals observable within one document are used in this feature. Weights are heuristic constants to be tuned against the FR-7 harness, not a claim of calibration.
- **Evidence is verified.** Each `quote` must be a substring of the cited chunk's text after whitespace/case/quote normalization. Quotes that fail are discarded. A decision left with no verified evidence is dropped — this is the guard against fabricated support.
- **Within-document dedup:** decisions repeated across batches are merged (normalized statement plus token-set similarity), unioning their evidence and signals.
- A per-document cap of **5** stored `candidate`-tier rows, keeping only the 5 highest-scoring; the rest are discarded (not merely hidden), so a noisy document (e.g. a long meeting transcript) cannot flood the review queue. `likely` and `confirmed` tiers are never capped.

### FR-2 — Data model (additive)
See Data Model Impact. New fields on `Decision`, a new `DecisionEvidence` table, and the status-default change performed only at cutover (tracker DX-J), never earlier.

### FR-3 — Reconcile on regenerate (worker)
Replaces the unconditional `timelineEvent.deleteMany` + `decision.deleteMany` in `processSummarizationJob`, following the existing Lessons precedent (`lesson.deleteMany({ source: "extracted", status: "draft" })`).
- Delete only rows that are `source = "extracted"`, `status = "pending"`, and unreviewed (`reviewedAt` null).
- **Preserve** every other row: `active`, `rejected`, `reversed`, `superseded`, manually created, or edited.
- Match each new extraction against preserved rows by normalized original statement (`aiStatement`, so a reviewer editing the wording does not break matching) plus token-set similarity. A match creates nothing; new evidence for a matched row is appended. A match against a `rejected` row is suppressed — the reviewer already said no. Only unmatched extractions become new `pending` rows.
- `TimelineEvent`: no longer created at extraction. Created when a decision is confirmed (if it has `decidedAt`), removed when rejected. Regenerate deletes only timeline events tied to decisions it deletes, never the whole document's set.

### FR-4 — Review authorization
- New `canReviewDecision({ document, userId, role })` in `src/lib/decisionAccess.js`: `super_admin` always; otherwise `dept_admin` who is a department **admin** of the document's department (or, for a project document with no direct department, the project's department) via the existing `canManageDepartment`. If there is no resolvable department, `super_admin` only. The document's owner/uploader is **not** sufficient (matches the standing rule that publish gates need a reviewer, not the author). Members and guests cannot review.
- Enforced server-side on every write and on the review-queue read; the UI only mirrors it.
- Per Decision 5, `canReviewDecision` is the **only** authorization gate for `Decision.status`/`statusNote` writes — it replaces `canManageDecision` for this purpose everywhere (confirm, reject, and outcome changes to `reversed`/`superseded` alike). `canManageDecision` remains defined for any other future use but is no longer called from the decision status write path.

### FR-5 — Read-path gating
`pending` and `rejected` must not appear anywhere except the review queue / rejected view, and only to users passing FR-4 for that decision's department. Readers to gate (verify each in DX-D):
- `getDecisionEvidence()` and `getAccessibleDecisions()` in `src/lib/decisionIntelligence.js` (chat grounding and repository list/search). Chat grounding continues to surface `reversed`/`superseded` with their outcome label, as today, but never `pending`/`rejected`.
- `GET /api/projects/[id]/timeline` and `GET /api/org/[orgId]/department/[deptId]/timeline`.
- `GET /api/documents/[id]` (includes `decisions`) and the document, project, and department pages that render it.
- `GET /api/org/[orgId]/decisions/[decisionId]`: a `pending`/`rejected` decision returns 404 to non-reviewers.
- `src/lib/lessonsIntelligence.js` and any lesson↔decision picker: a lesson must not link to a decision that is `pending`/`rejected`.
- Audit `worker/cluster.js`, `src/lib/vectorSearch.js`, and `src/lib/msGraph.js` references to decisions for any that read `Decision` rows.
- `decisionAccessSql()` still requires the source document to be a published repository document (or an org-scope project document), so pending decisions on unpublished documents stay invisible until the document is published — consistent with existing draft/publish behavior.

### FR-6 — Review workflow (API + UI)
- **API:**
  - `PATCH /api/org/[orgId]/decisions/[decisionId]` extended: `status`, `statusNote`, and (reviewers only) `statement`, `rationale`, `decidedAt`. On the first edit of `statement`, the original is retained in `aiStatement`. Sets `reviewedById`/`reviewedAt`. Confirm creates the `TimelineEvent`; reject removes it. A reject accepts an optional `reviewNote`.
  - `POST /api/org/[orgId]/decisions/bulk-review` — `{ ids, action: "confirm" | "reject", note? }`. Each id is authorized independently; unauthorized or missing ids are reported, not silently skipped.
  - Optional: `POST /api/org/[orgId]/decisions` for a reviewer to add a decision the model missed (`source = "manual"`, lands `active` since the reviewer's entry is the review). Last task; may be deferred.
- **Decisions page** (`src/app/(app)/org/[orgId]/decisions/page.jsx`): status filter lists statuses in the canonical order above. Reviewers get a "Pending review (N)" tab, grouped by source document, ordered `confirmed` → `likely` → `candidate` within a document, with "Confirm all in this document" and per-row confirm/reject. Non-reviewers do not see the tab or the count.
- **Detail modal** (`DecisionDetailModal.jsx`): a "Why KMS thinks this" panel — certainty tier, explicit vs implicit, evidence quotes with their type and a link to the source document, actors, alternatives, and the signals that produced the score. Reviewers can edit statement/rationale/date before confirming. Once `active`, the existing outcome controls (status + note, Rank 14) apply.
- A pending-count badge on the sidebar's Decisions entry for reviewers only.

### FR-7 — Evaluation harness (dry-run, no writes)
- A read-only script that runs v1 and v2 extraction on real documents' `Chunk.text` (NGI org's documents, plus a few synthetic fixtures containing implicit decisions, question→action sequences, proposals, and policy text) and prints a side-by-side diff with tier, signals, and evidence. It never writes to the DB and never triggers the worker. This is the verification method for extraction quality (consistent with the standing preference to verify via read-only DB scripts rather than browser automation). It also reports token/cost per document.

---

## Non-Functional Requirements

- **RBAC:** review and rejected-view access is per department (FR-4); no decision becomes visible to a user who could not already access its source document (`decisionAccessSql()` unchanged as the outer boundary).
- **No silent data loss:** regenerate never deletes a reviewed row (FR-3).
- **Additive and reversible:** all schema changes are additive and nullable/defaulted; pre-existing rows are untouched.
- **Cost:** per-document extraction cost is measured in FR-7 before cutover and must stay in the same order as today's per-chunk summarization spend.
- **Auditability:** every confirm/reject records who and when (`reviewedById`, `reviewedAt`, `reviewNote`). Whether to also write to the org's existing security audit log is an Open Question.

---

## Data Model Impact (proposed, not final)

```
Decision {
  ...existing fields unchanged...
  status        String    // existing column; adds "pending" and "rejected". Default stays "active" until cutover (DX-J), then becomes "pending"
  certainty     String?   // "confirmed" | "likely" | "candidate" — null for pre-existing rows
  explicitness  String?   // "explicit" | "implicit"
  score         Int?      // computed signal score, for reproducibility/tuning
  signals       String[]  @default([])
  subject       String?
  actors        String[]  @default([])
  alternatives  String[]  @default([])
  source        String    @default("extracted")   // "extracted" | "manual"
  aiStatement   String?   // extractor's original wording; set when a reviewer edits `statement`
  reviewedById  String?
  reviewedAt    DateTime?
  reviewNote    String?
  evidence      DecisionEvidence[]
}

DecisionEvidence {
  id          String   @id @default(cuid())
  decisionId  String   // onDelete: Cascade
  documentId  String   // the document the quote came from; equals Decision.documentId today,
                       // separate so later cross-document evidence needs no migration
  chunkId     String?  // onDelete: SetNull — chunk rows can be rebuilt on re-ingest
  chunkIndex  Int?
  quote       String
  type        String   // explicit_statement | approval | commitment | directive |
                       // resolved_discussion | follow_up_action | assumed_direction
  createdAt   DateTime @default(now())
  @@index([decisionId])
}
```
`status` remains a plain string (as in Rank 14), so adding values needs no enum migration. Migration is generated with `prisma migrate diff --from-url <live db> ... --script` and applied with `prisma migrate deploy` — never `migrate dev`, never a live URL as the shadow DB (see tracker DX-B).

---

## What Is Deliberately Not Adopted From the Source Discussion

- **LLM-supplied confidence numbers.** The model emits signal labels; code computes the tier. Model self-reported confidence is poorly calibrated and unauditable.
- **Auto-routing by tier** (confirmed → stored, likely → flagged, candidate → hidden). Superseded by Decision 1: everything waits for review.
- **Cross-source "decision consequences" and the full Decision Event model** (evidence levels 4–5, subject/choice/context/actors/time/supersedes as one object). Valuable direction; the evidence table is built to accept it, but it is a separate feature.
- **Treating any "directive" as a decision.** In this codebase's actual documents that turns policies and checklists into decisions. Decision 3 narrows it to directives that record a choice or change.

---

## Open Questions

1. ~~Outcome changes vs review.~~ **Resolved (Decision 5):** every status transition, including `reversed`/`superseded`, requires `canReviewDecision`.
2. ~~Visibility drop at cutover.~~ **Resolved (Decision 6):** accepted permanently, no auto-activate safety net.
3. ~~Candidate-tier cap per document.~~ **Resolved (Decision 7):** 5, highest-scoring kept, rest discarded.
4. **Legacy rows.** Existing `active` rows stay as-is and will not be re-extracted by v2 (regenerate preserves them and matches against them). Is a one-off "re-review legacy rows" pass wanted, or do reviewers reject noise as encountered?
5. **Audit log.** Should confirm/reject also write to the existing org security audit log, or is `reviewedById/At/Note` on the row sufficient?
6. **Model choice.** `gpt-4o-mini` initially; the FR-7 harness decides whether implicit detection needs a stronger model.

---

## Acceptance Criteria (draft)

- A newly ingested document's extracted decisions all appear as `pending`, visible only in the review queue to a `dept_admin` of that department and to `super_admin`; not in chat grounding, timelines, the document page, or the repository for anyone else.
- A `dept_admin` of another department, a document owner who is not a reviewer, a member, and a guest cannot confirm, reject, edit, or see pending/rejected decisions (server-side, not just UI).
- Confirming a decision makes it `active`, creates its timeline event if dated, and it then appears in chat grounding and the repository. Rejecting it removes it from every surface but the rejected view.
- Regenerating a document preserves confirmed, rejected, edited, and manual decisions, does not resurrect a rejected one, and only replaces unreviewed `pending` rows.
- An implicit decision in a fixture ("question → later 'I'll proceed with X' → 'I've created the tickets'") is extracted with `explicitness = implicit`, verified evidence quotes, and a `likely`-or-lower tier; a proposal or open question in the same fixture is not extracted.
- A standing policy sentence in a `Policies`/`SOPs` document is not extracted; a recorded change in the same document is.
- Every stored evidence quote is a verified substring of its chunk.
- The detail modal shows certainty, explicit/implicit, evidence, and signals for a pending decision.
- Status filter and any status list render in the order `pending`, `active`, `rejected`, `reversed`, `superseded`.
- Pre-existing decisions are unchanged and still `active` after cutover.

---

## Future Scope — Cross-Document Certainty Enrichment (not in this build)

**The gap:** in this feature, `certainty` (`confirmed | likely | candidate`) is computed once, at extraction time, from signals found only within the source document's own chunks. It is never re-evaluated afterward. So a `candidate` decision sitting in the queue does not get promoted to `likely`/`confirmed` when a *different*, later document corroborates it — e.g. a vague "I've started experimenting with Postgres" stays `candidate` forever, even after a follow-up doc says "staging is now running on Postgres." This is the source discussion's section 5 ("temporal reasoning") and section 8's "Level 5 — consistent subsequent behavior," deliberately deferred out of this build (see "What Is Deliberately Not Adopted").

**Why deferred:** it depends on this feature's review pipeline (`pending`/`certainty`/`DecisionEvidence`) existing and being in real use first, so there's a population of stored candidates and real evidence data to enrich against, and so re-scoring logic can be validated against how reviewers actually triage the queue rather than designed speculatively.

**Sketch of what it would take, for whoever picks this up:**
- A re-check step, likely folded into `processSummarizationJob` right after a new document's own extraction (same "don't build a parallel job type" rule as the rest of this pipeline): after extracting a new document's decisions, search existing `pending`/`likely`/`candidate` decisions in the same project/department for a matching subject (embedding or keyword similarity on `subject`/`statement`, not just exact match).
- On a match, add the new document's supporting text as another `DecisionEvidence` row against the *existing* decision (not a new decision) — `DecisionEvidence.documentId` was deliberately kept separate from `Decision.documentId` in this build's schema specifically so this can happen without another migration.
- Re-sum `score` across all evidence (now potentially multi-document) using the same deterministic scoring module from FR-1, and update `certainty` if the tier changes. Never silently re-activate a decision a reviewer already rejected or edited — `rejected` and reviewer-edited rows should be excluded from re-scoring, same as `DX-E`'s reconcile-on-regenerate logic already excludes them.
- `reviewedAt`/`reviewedById` should probably distinguish "reviewed, then later re-scored by new evidence" from "never reviewed" — likely needs the enriched-but-already-active case to surface as a notification/re-review prompt rather than silently changing a decision a human already signed off on.
- Needs its own cost/scale thought: this is now an O(new decisions × open candidates in scope) matching pass per document, not the current single LLM call.

This is intentionally left as a sketch, not a spec — worth returning to once `DX-A`–`DX-M` are shipped and there's real review-queue behavior to design against.
