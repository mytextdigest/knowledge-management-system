# Requirements: Decision Intelligence Repository

**Capability:** Decision Intelligence Repository
**PRD Rank:** 14 (Tier 2 — Organizational Intelligence)
**Owner:** Johurul — full feature end-to-end, one PR.
**Purpose:** Preserve why decisions were made — not just capture a decision, but make organizational decision history browsable, searchable, and traceable to its outcome.

---

## Problem Statement

Like Ranks 9–11, this is **not greenfield**. A meaningful v0 already exists, spread across three places nobody has connected into a first-class feature:

- `Decision` (`prisma/schema.prisma`: `statement`, `rationale`, `decidedAt`, `documentId`) is auto-extracted from every document during ingestion by `extractDecisions()` (`worker/summarize.js`), created idempotently alongside entity extraction (`worker/index.js`, `FR-P2-6`/`FR-P2-7`). This already runs for every document processed.
- `src/lib/decisionIntelligence.js` already does RBAC-scoped keyword retrieval over `Decision.statement`/`.rationale` (`getDecisionEvidence()`) and detects decision-oriented chat questions (`isDecisionQuestion()`), grounding chat answers in past decisions (wired into `GET /api/org/[orgId]/chat`).
- Decisions are already shown per-document (`GET /api/documents/[id]` includes `decisions: {orderBy: {decidedAt: "desc"}}`) and already flow into a per-project/per-department chronological timeline (`TimelineEvent`, `GET /api/projects/[id]/timeline`, `GET /api/org/[orgId]/department/[deptId]/timeline`, rendered on the project and department pages).

What's genuinely missing — and what "Decision Intelligence Repository" as a Tier-2, PRD-level capability actually means beyond what exists — is:
1. **No cross-org browsable/searchable decision surface.** Decisions are only visible per-document or per-project/department timeline, or indirectly through chat. There is no page equivalent to the Experts, Recommendations, or Lessons pages where someone can browse "decisions across the organization."
2. **No outcome tracking.** `Decision` has no `status`/`outcome` field — nothing captures whether a decision held, was reversed, or was superseded, even though `Lesson.decisionId` already exists specifically to let a later lesson reference the decision it came from (`REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md`'s Interface Contract). Today that link exists in the schema but nothing surfaces "here's what we decided, and here's what we learned once it played out" as a connected view.

`REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md` already anticipated this feature explicitly: *"Decision Intelligence Repository (Rank 14) — a broader 'preserve why decisions were made' capability; [Lessons'] `Lesson` may reference a `Decision` but does not replace or extend the `Decision` model's own scope."* This doc is that broader capability.

---

## Scope

In scope:
- A dedicated, browsable/searchable Decision repository surface (org-wide, filterable by project/department/topic/date), following the same "dedicated page, sidebar-reachable" pattern established by Expert Discovery, Recommendations, and Lessons.
- Extending `Decision` with an optional outcome/status field (e.g. `"active" | "reversed" | "superseded"`) and a link forward to the `Lesson`(s) that resulted from it (`Lesson.decisionId` already exists for this).
- Reusing the existing extraction (`extractDecisions()`), chat-grounding (`decisionIntelligence.js`), and timeline (`TimelineEvent`) infrastructure as-is — this feature is a repository/browse layer on top, not a rebuild.

Out of scope (handled elsewhere or explicitly deferred):
- Decision *extraction* logic — `extractDecisions()` (`worker/summarize.js`) is unchanged by this feature.
- Chat-grounding logic — `isDecisionQuestion()`/`getDecisionEvidence()` (`src/lib/decisionIntelligence.js`) are unchanged; this feature only adds a browse/repository surface and optional outcome data alongside them.
- Timeline API/UI (`TimelineEvent`, per-project/department pages) — unchanged; the new repository surface may link into it, not replace it.
- Full project-management-style decision workflows (approval chains, decision owners with notifications, etc.) — this is "preserve and browse," not a decision-management product.
- Rank 12/13's relationship/graph work — a decision node may appear in [[REQUIREMENTS_ORGANIZATIONAL_KNOWLEDGE_GRAPH]]'s graph (it already lists `Decision` as a node type), but this feature does not depend on Rank 12/13 landing first.

---

## Interface Contract with Lessons Learned Intelligence (Rank 11)

`Lesson.decisionId` already exists specifically so a lesson can reference the decision it followed from (`REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md`'s Interface Contract). This feature is the consumer-facing surface for that link — the repository view should show, for a decision with associated lessons, what was learned once it played out. No change to the `Lesson` model or its authoring flow is required; this feature only reads the existing relation.

## Interface Contract with Existing Extraction/Chat-Grounding

`extractDecisions()`, `isDecisionQuestion()`, and `getDecisionEvidence()` are unchanged by this feature. Any new field added to `Decision` (the outcome/status field in FR-2) must be nullable/optional with a safe default, so existing extraction (which does not set it) continues to work without modification.

---

## Functional Requirements

### FR-1 — Decision Repository Page
- A dedicated, sidebar-reachable page listing decisions across the organization (or scoped to a department/project the user has access to), following the existing Experts/Recommendations/Lessons page pattern. Filterable by project, department, date range, and (once FR-2 exists) outcome status.

### FR-2 — Decision Outcome Tracking
- Add an optional `status` field to `Decision` (e.g. `"active" | "reversed" | "superseded"`, default `"active"`), settable manually (by a project/department admin or the decision's originating document's owner — see Open Questions) and, where a `Lesson` explicitly references the decision, informable by that lesson's content. This is additive and does not change extraction behavior (Interface Contract above).

### FR-3 — Decision-to-Lesson Linkage Display
- Where a `Decision` has one or more `Lesson` rows referencing it (`Lesson.decisionId`), the repository view surfaces them together — "here's what was decided, here's what we learned." Read-only consumption of the existing relation; no change to lesson authoring.

### FR-4 — Decision Search
- Reuse the existing RBAC-scoped keyword search already built for chat grounding (`getDecisionEvidence()`'s query shape in `src/lib/decisionIntelligence.js`) as the basis for the repository's search, rather than building a second search implementation against `Decision`.

### FR-5 — Decision Detail View
- Clicking a decision shows its statement, rationale, decided-at date, source document (link to the existing document page), any linked lessons (FR-3), and — if useful — related `TimelineEvent` context. Does not duplicate the document page's own decision list; links to it instead.

---

## Non-Functional Requirements

- RBAC: a decision must never be visible to a user who couldn't already access its source document — reuse the existing `scopeSql()`/`accessSql()` pattern (`src/lib/vectorSearch.js`, `src/lib/knowledgeContext.js`), consistent with how `getDecisionEvidence()` already scopes decision retrieval for chat.
- No regression to existing per-document decision display, chat decision-grounding, or project/department timelines — this feature adds a new surface and an optional field, it does not modify existing read paths.
- FR-2's status field must not require backfilling every existing `Decision` row before shipping — default to `"active"` and let status changes happen going forward.

---

## Data Model Impact (proposed, not final)

```
Decision {
  ...existing fields unchanged...
  status String @default("active")  // "active" | "reversed" | "superseded" — new, optional, additive
}
```
No new models required. Purely additive migration to the existing `Decision` table.

---

## Open Questions

1. ~~**Ownership.**~~ **Resolved:** Johurul owns this feature end-to-end, one PR — see tracker.
2. Who is authorized to set/change a decision's outcome status (FR-2) — the document's owner, any project/department admin, or only whoever authored the referencing `Lesson`? Given the precedent set by Lessons Learned (human-confirmed, never auto-published), status changes should likely require a person, not an LLM inference, but the specific role boundary needs a call.
3. Should FR-1's repository page live at the org level only, or also get a department/project-scoped variant (mirroring how Recommendations has both a personal and department-admin view)?
4. Is there a real need for decision search to be semantic (embedding-based) rather than the existing keyword/BM25 approach `getDecisionEvidence()` already uses? Defaulting to reusing the existing approach (FR-4) unless a concrete gap is demonstrated.

---

## Acceptance Criteria (draft)

- A dedicated, sidebar-reachable page lists decisions org-wide (RBAC-scoped) with project/department/date filtering.
- A decision with linked lessons visibly shows them in its detail view.
- Existing chat decision-grounding (`isDecisionQuestion()`/`getDecisionEvidence()`) and per-document/timeline decision display are unchanged and unregressed.
- The new `status` field defaults safely for all existing `Decision` rows without a backfill step.
- No decision is visible to a user who couldn't already access its source document.
