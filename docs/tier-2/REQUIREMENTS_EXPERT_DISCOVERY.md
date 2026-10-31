# Requirements: Expert Discovery

**Capability:** Expert Discovery
**PRD Rank:** 9 (Tier 2 — Organizational Intelligence)
**Owner:** Sandeep — full feature end-to-end, one PR. Continues his ownership of [[REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE]] (Rank 8), which this feature extends.
**Purpose:** Find who knows what — turn expertise that already lives implicitly in the org (who uploaded, who cites, who's on the team) into something a person can actually search for and browse, not just stumble into mid-chat.

---

## Problem Statement

This capability is **not greenfield**. Rank 8 (Knowledge Context Engine, `docs/tier-1/TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md`, Task `9-D`) already shipped a working v0 under a different name:

- `TopicExpertise` (`prisma/schema.prisma`) stores a per-user, per-topic score.
- `worker/knowledgeContext.js`'s `refreshTopicExpertise()` computes that score from three blended signals — uploads to the topic, chat citations (`ChatAuditLog.citedDocIds`), and department membership overlap — as a background step chained onto the existing `"cluster"` SQS job.
- `src/lib/knowledgeContext.js`'s `getAccessibleExperts()` serves it, RBAC-gated in the SQL `WHERE` clause (never a post-filter).
- `src/app/api/org/[orgId]/context/experts/route.js` exposes it, consumed today by exactly one surface: Enterprise Chat's "Suggested people to ask" panel (`src/app/(app)/org/[orgId]/chat/page.jsx`), triggered reactively per question.

That v0 answers "who might know about *this specific question I just typed*." It does not answer "who are our experts" as a browsable, standalone question — which is what Rank 9 actually promises. This doc scopes the gap between the two, not a rebuild.

Two gaps carried over from Rank 8 are inherited by this feature rather than newly discovered:
1. **Task `9-G` (Integration Testing + RBAC Regression Check) is still `IN_PROGRESS`**, not `DONE` — the tracker's own status note says the RBAC spot-check "was never actually executed" against real seeded cross-department data, only verified by code review after a real bug (`isOrgAdmin` vs `isSuperAdmin`) was found and fixed once already. Expert Discovery is the highest-blast-radius consumer of that exact code path (`accessSql()` in `src/lib/knowledgeContext.js`), so this feature cannot be called done without closing that gap.
2. **Rank 8's own Open Question #4** — "chat-side panel, dedicated 'Ask an Expert' page, or just metadata on document/topic pages?" — was shipped as "chat-side panel" and left there. This feature answers that question properly.

---

## Scope

In scope:
- A standalone, searchable/browsable expert surface (not just a reactive chat sidebar).
- Extending expertise scoring to `Topic.scope = 'project'` topics, not only `scope = 'repository'` (today's `getAccessibleExperts()` hard-filters to `t.scope = 'repository'`, so all project-only work is invisible to expertise).
- A way to correct or confirm an inferred expertise signal — today everything is 100% behavior-inferred with no override.
- Recency-aware scoring, so a stale contributor doesn't permanently outrank someone currently active on a topic.
- Closing Task `9-G`'s known RBAC test gap for the query paths this feature builds directly on top of.
- Surfacing "suggested people to ask" on document/topic pages, not only inside a chat question flow.

Out of scope (handled elsewhere or explicitly deferred):
- **Activity/interaction signal expansion** (document views, downloads — today's only signals are uploads and chat citations) — that infrastructure is [[REQUIREMENTS_KNOWLEDGE_RECOMMENDATION_ENGINE]]'s (Rank 10, Simran's) to build; this feature consumes it once available as an additive signal, per the Interface Contract below, but does not build it.
- Rebuilding topic clustering itself (`Topic`, `TopicDocument`, `worker/cluster.js`) — already exists, unchanged by this feature.
- Org-wide knowledge graph visualization (Rank 13, `Organizational Knowledge Graph`) — a broader capability than a person-lookup tool.
- Decision Intelligence Repository (Rank 14) and Lessons Learned Intelligence ([[REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE]], Rank 11) — "who decided X and why" is a different question from "who knows about X."

---

## Interface Contract with Rank 10 (Recommendation Engine)

Rank 10 ([[REQUIREMENTS_KNOWLEDGE_RECOMMENDATION_ENGINE]], Simran) is expected to introduce a lightweight document-interaction/activity signal (document views, possibly downloads) that today does not exist anywhere in the schema. This feature's expertise scoring should be written to **consume** that signal as an additional input once it lands (a person who reads deeply on a topic without ever citing it in chat should still be able to register as engaged), but this feature does not block on it, does not build it, and must ship a complete, useful v1 using only today's existing signals (uploads, citations, department membership) if Rank 10 lands later or on a different timeline. Coordinate the exact shape of the interaction event (model name, fields) with Simran before consuming it, so `worker/knowledgeContext.js` doesn't end up querying a shape that changes underneath it.

---

## Functional Requirements

### FR-1 — Standalone Expert Directory
- A dedicated, browsable surface (page or panel) where a user can search "who knows about X" by topic name or free text, without first composing a chat question.
- Results show, per person: name, matched topic(s), a relevance/expertise score, and a way to start a conversation with them (at minimum, a `mailto:` link using `User.email` — no in-app messaging exists today, do not build one for this feature).
- Must reuse `getAccessibleExperts()` / its RBAC pattern rather than a parallel query — extend it, don't fork it.
- Resolves Rank 8's Open Question #4.

### FR-2 — Project-Scope Expertise
- Extend `refreshTopicExpertise()` to also score `Topic.scope = 'project'` topics, respecting the same project-level access rules already enforced elsewhere (`Project.scope`, department membership) rather than the repository-only access rule `accessSql()` currently assumes.
- `getAccessibleExperts()` must apply the correct access check per topic scope (repository-scope topic → repository access rule; project-scope topic → project access rule) — do not silently reuse the repository rule for both, which would either over- or under-expose results.

### FR-3 — Expertise Confirmation / Correction
- A person can confirm ("yes, I know this") or dismiss ("not really my area") their own inferred `TopicExpertise` entry.
- A `dept_admin` can confirm/promote a department member's expertise on a topic (e.g., a designated SME who hasn't personally uploaded much yet).
- A confirmed/admin-set entry must not be silently overwritten by the next automated `refreshTopicExpertise()` run — the background job needs a way to distinguish "inferred" from "confirmed" and leave confirmed entries alone (or only adjust the inferred component of the score).

### FR-4 — Recency-Weighted Scoring
- `TopicExpertise.score` currently has no time dimension — a 2-year-old upload counts identically to one from this week. Introduce a decay factor (e.g., signals older than N months contribute less) so the score reflects current, not historical, expertise.
- Must not require re-scanning full history on every refresh — compute decay at read time or via the existing incremental refresh, whichever is cheaper against the existing `refreshTopicExpertise()` per-topic recompute pattern.

### FR-5 — RBAC Integration Test (closing Task 9-G)
- A real, DB-backed integration test (not the existing source-pattern string assertions in `scripts/task-9/*.test.mjs`) that seeds cross-department data, queries `getAccessibleExperts()` as a low-privilege user with no access to a department's documents, and asserts zero experts from that department are returned.
- This is a prerequisite for this feature's own acceptance criteria, not optional cleanup — Expert Discovery is the feature that makes this exact RBAC boundary user-visible and searchable, raising the cost of it being wrong.

### FR-6 — Expertise on Document/Topic Pages
- Show "people who know this" (reusing FR-1's directory query, scoped to the current document's topic) on the document detail page (`src/app/(app)/document/page.jsx`), alongside the existing Decisions/Related Documents cards.

---

## Non-Functional Requirements

- No new synchronous latency on chat, upload, or search — all scoring stays in the existing background job chain (`worker/index.js` → `"cluster"` → `processKnowledgeContext` → `refreshTopicExpertise`), consistent with how this data is computed today.
- Every new or modified query path must apply RBAC in the SQL `WHERE` clause, never a post-filter — the same non-negotiable rule Rank 8 states for this exact code (`TIER1_KNOWLEDGE_CONTEXT_ENGINE_IMPLEMENTATION_TRACKER.md` header note).
- Expertise confirmation/dismissal actions (FR-3) must be cheap, one-click actions, consistent with the "suggestion, not authority" pattern used by `DocumentDuplicate` and `DocumentProjectLink`.
- Must not expose personally-identifying activity detail (e.g., the literal chat questions someone asked) — only the resulting topic association, matching the existing constraint already documented for Task `9-D`.

---

## Data Model Impact (proposed, not final)

```
TopicExpertise + source        String  @default("inferred") // "inferred" | "self_confirmed" | "admin_confirmed" | "dismissed"
                + confirmedBy   String?  // userId of confirming dept_admin, null for self-confirm
                + lastSignalAt  DateTime? // most recent contributing signal's timestamp, for FR-4 decay
```
No new top-level model is required for FR-1–FR-5 — this is additive to the existing `TopicExpertise` row. FR-6 introduces no schema change (read-only reuse of FR-1's query). Confirm final column names with whatever interaction-event model Rank 10 lands (Interface Contract above) before finalizing, in case a `lastSignalAt`-equivalent already exists there.

---

## Open Questions

1. Does the standalone directory (FR-1) live as its own page (e.g. `/org/[orgId]/experts`) or as a panel embedded in an existing page (department, dashboard)? Resolve before starting FR-1's UI work.
2. For FR-3, can a `dept_admin` confirm expertise for a member outside their own department, or only within it — consistent with the existing `dept_admin` scoping rule in `orgGuard.js`?
3. What decay half-life makes sense for FR-4 — fixed constant, or configurable per org?
4. Should dismissed (FR-3) entries be hidden entirely or shown de-prioritized (useful signal: "this person explicitly says this isn't their area")?

---

## Acceptance Criteria (draft)

- A user can search "who knows about [topic]" from a dedicated surface and get a ranked, RBAC-correct list of people, without first asking a chat question.
- Expertise on project-scope work (not just repository-scope) is discoverable.
- A person can confirm or dismiss their own suggested expertise, and that choice survives the next background refresh.
- An integration test proves a low-privilege user gets zero results for a department they have no access to — Task `9-G` can be marked `DONE` on the strength of this feature's test, not just this feature's own code review.
- No regression to the existing "Suggested people to ask" chat panel.
