# Requirements: Knowledge Recommendation Engine

**Capability:** Knowledge Recommendation Engine
**PRD Rank:** 10 (Tier 2 — Organizational Intelligence)
**Owner:** Simran — full feature end-to-end, one PR.
**Purpose:** Deliver relevant knowledge proactively — surface documents a person hasn't asked for but would want, instead of requiring them to already know what to search for.

---

## Problem Statement

Like Rank 9, this is **not greenfield** — it's a v0 that shipped under a different name and is currently switched off in the one place it was mounted:

- `src/lib/recommendations.js`'s `getRecommendations()` already implements both proactive (ambient, no query) and predictive (explicit query) recommendations, seeded from `OrgMemberMemory` (recent chat topics) and ranked through the same `hybridOrgSearch()` RBAC-scoped retrieval path chat uses.
- `GET /api/org/[orgId]/recommendations` and `src/components/recommendations/RelatedWorkPanel.jsx` ("Related to your work") are fully built and functional.
- The panel was mounted on both the project page and the department page as of Tier 1 Block B (Task `6-C`), then removed from the project page "per demo feedback" (`TIER1_BLOCK_B_IMPLEMENTATION_TRACKER.md`), and — as of commit `80d3657` (2026-09-03, same day as this doc) — commented out of the department page too, bundled into an unrelated commit that added semantic search to the repository/department document listings. **No reason for hiding it is recorded anywhere** (not in the commit message body, not in any bug-fix or QA doc). The backend (`recommendations.js`, the API route) is untouched and still fully functional — this is a visibility decision, not a rollback, and the first thing this feature needs to do is get an actual answer on why it was hidden and where (if anywhere) it should reappear, rather than assume the answer is "just uncomment it."

The deeper problem, independent of the hidden panel, is **signal starvation**: `getRecommendations()` has exactly one behavioral input — `OrgMemberMemory`, which only records topics mentioned in chat. There is no signal at all from repository browsing, document opens, downloads, or search-result clicks. A recommendation engine that only knows what you've chatted about is not really watching "your work" — it's watching one narrow slice of it. Two other signals already exist in the schema but aren't wired in:
- `OrgMessage.feedback` (`"helpful" | "not_helpful"`) is captured but not read by `recommendations.js`.
- `DocumentRelationship` (the graph Rank 8 built) powers "also see" results inside chat (`expandWithRelatedDocuments()`) but isn't used by the standalone recommendation surface at all.

---

## Scope

In scope:
- Resolving the "why was it hidden, where should it live" question and re-establishing at least one real, visible surface for recommendations.
- A lightweight document-interaction signal (views at minimum) — new infrastructure, since none exists today.
- Wiring `OrgMessage.feedback` into recommendation ranking.
- Wiring the existing `DocumentRelationship` graph into the standalone recommendation surface (today it only benefits chat).
- Department/role-aware recommendation behavior.

Out of scope (handled elsewhere or explicitly deferred):
- Rebuilding `hybridOrgSearch()` or the embedding pipeline — reused as-is.
- Expert Discovery's directory/browse UI ([[REQUIREMENTS_EXPERT_DISCOVERY]], Rank 9) — a different question ("who," not "what"), even though it consumes the interaction signal this feature introduces.
- Email/notification digests — "proactive" here means present-when-visited, not push-delivered; a digest is a reasonable fast-follow but is a new delivery channel, not a ranking change.
- Full analytics/BI dashboards on document engagement — FR-6 below is a narrow admin-facing summary, not a general analytics product.

---

## Interface Contract with Rank 9 (Expert Discovery)

This feature owns the new document-interaction signal (FR-2). Rank 9 ([[REQUIREMENTS_EXPERT_DISCOVERY]], Sandeep) will consume it as an additive expertise signal once it exists, per that doc's Interface Contract section. Agree the event model's shape (model name, fields: at minimum `documentId`, `userId`, `type`, `createdAt`) with Sandeep before finalizing the migration, so his `refreshTopicExpertise()` doesn't need to be rewritten against a shape that changes later. Either feature can ship and merge independently — Rank 9's v1 does not require this signal to exist.

---

## Functional Requirements

### FR-1 — Resolve and Re-Establish the Recommendation Surface
- Confirm with the team (specifically whoever hid it in commit `80d3657`) why "Related to your work" was removed from the department page, before deciding whether to restore it as-is, redesign it, or replace its placement.
- At minimum, land one clear, visible, always-reachable surface for recommendations (department page, project page, and/or a new personalized landing surface) — "the backend works but nothing shows it" is not an acceptable end state for this feature.
- If the decision is to keep it off specific listing pages because the new semantic search there already serves a similar need (per `80d3657`'s stated purpose), document that reasoning explicitly rather than leaving it silently commented out.

### FR-2 — Document Interaction Signal
- Introduce a lightweight event record for "a user opened/viewed this document" (download optional, if cheap to add at the same call site). This is new — no such tracking exists anywhere today (confirmed: no view/download model in `prisma/schema.prisma`, no tracking route under `src/app/api`).
- Write path must not add meaningful latency to the document-view request it's attached to (fire-and-forget / best-effort write, not a blocking dependency of the response).
- Respect the same RBAC boundary as everything else — a view event is only ever written for a document the viewing user could actually access (which is already enforced by the time they reach the view route, so this is a "don't bypass that check," not a new check).

### FR-3 — Feedback-Weighted Ranking
- `collapseByDocument()` / `getRecommendations()` in `src/lib/recommendations.js` should factor in `OrgMessage.feedback` history for the requesting user — documents behind answers marked `"helpful"` get a ranking boost; documents behind `"not_helpful"` answers get suppressed. This closes the gap flagged in `REQUIREMENTS_CONVERSATIONAL_ASSISTANT.md`'s FR-P3-6 ("Organizational Learning") that was never actually wired into this module.

### FR-4 — Relationship-Graph-Aware Recommendations
- Extend `getRecommendations()` to also pull candidates via `DocumentRelationship` (the same graph `expandWithRelatedDocuments()` already uses for chat "also see" results), not only fresh embedding similarity against `OrgMemberMemory` topics. A document structurally related to something the user recently engaged with is a stronger candidate than one merely topically similar.

### FR-5 — Department/Role-Aware Recommendations
- A `dept_admin` viewing their department's recommendation surface should be able to see department-wide trending/recommended content (aggregate, not just their personal feed), distinct from an individual member's personalized proactive list.

### FR-6 — Admin Visibility into Recommendation Effectiveness
- A narrow, department- or org-scoped summary (e.g., "most-recommended documents this month," "recommendations with zero click-through") reusing the aggregation-dashboard pattern already established by `GET /api/org/[orgId]/health` (knowledge gaps, conflict counts). Not a general analytics product — just enough for an admin to sanity-check the feature is doing something useful.

---

## Non-Functional Requirements

- Recommendation computation must continue to run on-request against existing indexes/embeddings (as it does today) or, for anything moved to a background job (e.g., pre-computing FR-4's graph candidates), follow the existing SQS job-chaining pattern (`worker/index.js`) — never a new inline synchronous cost on chat/upload.
- FR-2's interaction writes must be cheap enough to attach to every document view without operators noticing a latency change — batch or async-write if a synchronous insert proves too slow under load.
- Must continue to respect `ORG_OPENAI_KEY_MISSING` the same way `recommendations.js` does today (surfaced as a 400, not a silent empty result that looks like "no recommendations" when it's actually "org has no key configured").
- View-event data (FR-2) is sensitive in the same way expertise/citation data is (Rank 8's stated RBAC risk) — a department admin must not be able to see a specific individual's per-document view history unless that's an explicit, deliberate decision (see Open Questions).

---

## Data Model Impact (proposed, not final)

```
DocumentInteraction {
  id          String
  documentId  String → Document
  userId      String → User
  orgId       String → Organization
  type        String   // "view" | "download"
  createdAt   DateTime
}
```
Owned entirely by this feature. Indexed on `(documentId, type)` for aggregation (FR-6) and `(userId, createdAt)` for recommendation-ranking lookups (FR-2/FR-4). Coordinate the final shape with Sandeep per the Interface Contract before Rank 9 starts consuming it.

---

## Open Questions

1. Why was `RelatedWorkPanel` hidden in `80d3657`, and does that reasoning also apply to the project page (already removed earlier, per demo feedback) — i.e., is the long-term intent to retire the panel entirely in favor of the new semantic search UI, or was this incidental? **Must be answered before FR-1 is scoped further.**
2. Does "view" in FR-2 mean the document detail page was opened, or something stricter (e.g., N seconds of dwell time)? Start with page-open; revisit if it proves too noisy.
3. Should FR-6's admin visibility expose individual-level engagement, or only aggregate counts? Given Rank 8's precedent RBAC bug around "leaking association," default to aggregate-only unless a clear business need for individual-level is confirmed.
4. Is a personalized dashboard/landing surface in scope for this pass, or is "restore to department/project page" sufficient for v1?

---

## Acceptance Criteria (draft)

- At least one recommendation surface is visibly reachable in the product again, with an explicit, documented rationale for its placement.
- Recommendation ranking demonstrably uses at least one signal beyond `OrgMemberMemory` chat topics (interaction data, feedback, or relationship graph).
- A document behind a `"not_helpful"`-marked chat answer is measurably deprioritized in that user's subsequent recommendations.
- View-event writes add no observable latency regression to document viewing.
- No existing chat, search, or repository-listing flow regresses.
