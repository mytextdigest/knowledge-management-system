# Requirements: Project Intelligence

**Capability:** Project Intelligence
**PRD Rank:** 15 (Tier 2 — Organizational Intelligence)
**Owner:** Simran — full feature end-to-end, one PR.
**Purpose:** Link projects, documents, lessons, and experts — give a project lead a single view of everything the organization already knows that's relevant to their project, instead of four disconnected pages.

---

## Problem Statement

This is **not greenfield** — it is the shallowest starting position of any Tier-2 feature so far, closer to an integration/composition pass than a new subsystem. Almost every piece of data this feature needs already exists and is already computed:

- `src/app/(app)/project/page.jsx` already renders a per-project dashboard with a `TopicsView` (project-scoped `Topic` rows via `GET /api/projects/[id]/topics`), a collapsible Timeline panel (`TimelineEvent` via `GET /api/projects/[id]/timeline`), and a `LessonsPanel` (`GET`/`POST /api/projects/[id]/lessons`).
- `DocumentProjectLink` (`prisma/schema.prisma`) already captures cross-project document relevance, auto-suggested by `suggestProjectLinks()` (`worker/knowledgeContext.js`) via project-name matching in document text — but it is only ever surfaced from the *document* side (`src/app/(app)/document/page.jsx` ~line 1361, `RepositoryDocumentCard.jsx`), never from the project side. A project has no "documents that mention or relate to me from elsewhere" view today.
- `src/lib/knowledgeGraph.js` (Rank 13, merged) already models `belongs_to_project`/`linked_to_project`/`has_topic`/`expert_in`/`lesson_for_project` edges and already accepts a `filters.projectId` scope — but it requires a caller-supplied `startNode`; there is no "give me project X's whole neighborhood" entry point today.
- Both `REQUIREMENTS_KNOWLEDGE_RELATIONSHIP_DISCOVERY.md` (line 40) and `REQUIREMENTS_ORGANIZATIONAL_KNOWLEDGE_GRAPH.md` (line 33) explicitly named this feature as the future consumer of their general-purpose primitives: *"Project Intelligence's own cross-linking product surface (Rank 15) — this feature provides the general-purpose graph primitive; Rank 15 may build a project-specific view on top of it later."* This doc is that promised consumer.

The one genuine gap that isn't pure composition: **project-scoped topics have no automatically-computed experts.** `refreshTopicExpertise()` (`worker/knowledgeContext.js`) — which populates `TopicExpertise`, the data Expert Discovery (Rank 9) and this feature both need — is only ever invoked against the *repository-scope* `Topic` a document also gets classified into (`classifyRepositoryDocument()`, `worker/cluster.js`), never against a document's *project-scope* `Topic` (`classifyDocument()`, same file). The RBAC route for confirming expertise (`PATCH /api/org/[orgId]/context/experts/[topicId]/route.js`) already resolves access correctly for project-scope topics (`topic?.project?.departmentId`) — the access layer anticipates this, it's just never auto-scored. Closing this gap is the one piece of this feature that is backend work, not read-composition.

`REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md`'s Open Question 2 is also still unresolved and belongs to this feature to answer: `Lesson.topic` is free text today; whether to upgrade it to a real `Topic` join (making lessons discoverable alongside Expert Discovery's topic-scoped browsing) is explicitly flagged there as "a future Rank 15 tie-in."

---

## Scope

In scope:
- A project-centric "Project Intelligence" view — either a new tab/section on the existing `src/app/(app)/project/page.jsx` or a linked sub-page — surfacing, for one project: its documents, its topics (existing), its lessons (existing), its experts (new, see below), its timeline (existing), and documents from *other* projects/the repository that relate to it (`DocumentProjectLink`, `DocumentRelationship` scoped by `filters.projectId`).
- Closing the expert-scoring gap: project-scope `Topic` rows get `TopicExpertise` computed, either by extending `refreshTopicExpertise()` to also run for project-scope topics, or by a query-time bridge from a project's topics to its documents' repository-scope topics' existing `TopicExpertise` rows (see Open Questions — this is the central implementation decision of this feature).
- Surfacing non-`"suggested"` `DocumentProjectLink` rows (and, behind a filter, suggested ones) from the *project* side, not only the document side.
- Resolving `REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md` Open Question 2 (`Lesson.topic` free text vs. `Topic` join) as part of this feature's own scope.

Out of scope (handled elsewhere or explicitly deferred):
- Relationship discovery/scoring itself (Rank 12) and the general-purpose graph traversal primitive/UI (Rank 13) — this feature is a project-scoped consumer of both, not a reimplementation. No new scoring logic, no new graph service.
- Cross-project comparison/portfolio-level views (e.g. "which projects share the most experts") — a real future direction, but this feature is single-project-centric, not a portfolio dashboard.
- `Project` lifecycle fields (`status`, `completedAt`) — `REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md` Open Question 1 already covers whether/when to add these; this feature does not depend on that decision landing first.
- Topic Evolution Tracking (Rank 16) — a project's topics may change composition over time, but historical tracking of that change is Rank 16's job, not this feature's. This feature shows current state only.

---

## Interface Contract with Organizational Knowledge Graph (Rank 13)

This feature is the first concrete consumer of `src/lib/knowledgeGraph.js`'s `filters.projectId` scoping. It does not add new node/edge types or new provenance tags — it calls the existing `getKnowledgeGraph()`/`GET /api/org/[orgId]/knowledge-graph` with a project-scoped start (or a project node itself as the start, if not already supported — see Open Questions) and renders the result inside a project-centric layout rather than the general graph explorer. Any gap found in graph filtering while building this (e.g. a project itself not being usable as a `startNode`) is fixed in `knowledgeGraph.js` directly, coordinated as a small addition, not forked into a parallel query path.

## Interface Contract with Knowledge Relationship Discovery (Rank 12)

Cross-project/repository document relevance shown by this feature reads `DocumentRelationship` rows exactly as Rank 12 writes them (via the existing `getAccessibleOrgRelationships()`/org relationships endpoint, filtered client- or query-side to the project's documents). No new relationship scoring is introduced by this feature.

## Interface Contract with Expert Discovery (Rank 9) and Lessons Learned (Rank 11)

`TopicExpertise` and `Lesson` are read, not owned, by this feature. Closing the project-scope expert-scoring gap (Scope, above) extends *when* `TopicExpertise` rows get created (or are queryable for a project-scope topic) — it does not change `TopicExpertise`'s schema, its manual-confirmation flow (`PATCH /api/org/[orgId]/context/experts/[topicId]`), or Expert Discovery's own repository-scope page/behavior. `Lesson.topic`'s upgrade to a `Topic` join (if adopted per Open Questions) is additive: existing free-text `Lesson.topic` values are preserved, not migrated destructively.

---

## Functional Requirements

### FR-1 — Project Intelligence View
- A project-centric view (new tab on `src/app/(app)/project/page.jsx` or a linked sub-page) presenting, for the current project: its topics (existing `TopicsView`), its lessons (existing `LessonsPanel`), its timeline (existing Timeline panel), its experts (FR-2, new), and documents from elsewhere that relate to it (FR-3, new). This composes existing panels plus two new ones — it does not rebuild the existing three.

### FR-2 — Project-Scoped Expert Computation
- Project-scope `Topic` rows become associated with `TopicExpertise` data, closing the gap described in the Problem Statement. The exact mechanism (extend `refreshTopicExpertise()` to run for project-scope topics too, vs. a query-time join from project topic → same document's repository-scope topic → its `TopicExpertise`) is an implementation decision for the owner to make and document in the tracker (see Open Questions) — either satisfies this requirement as long as a project's page can show "who's an expert in this project's topics" without a schema change to `TopicExpertise` itself.

### FR-3 — Related Documents and Projects (Project-Side View)
- The project page (or its Project Intelligence tab) shows documents connected to it via `DocumentProjectLink` (`status !== "suggested"` by default, with an `includeSuggested` toggle matching Rank 13's own convention) and via `DocumentRelationship`/`DocumentConflict` scoped to the project's own documents (reusing Rank 12's org relationships endpoint, filtered to this project's document IDs). This is the inverse direction of the existing document-side "suggested project links" panel — same data, new vantage point.

### FR-4 — Lesson Topic Linkage (Resolves Lessons Learned Open Question 2)
- Resolve whether `Lesson.topic` should remain free text or become a foreign key to `Topic`. If upgraded: existing free-text values are preserved (additive migration, no destructive backfill required — see Non-Functional Requirements); lessons become browsable/filterable alongside a topic's experts and documents in FR-1's view. If kept free text: document why in this feature's tracker, so the decision isn't silently re-litigated later.

### FR-5 — Project Node as Graph Entry Point
- A user can reach a project-scoped view of the Rank 13 knowledge graph directly from the project page (e.g. "View in Knowledge Graph" from FR-1's view), pre-filtered to `filters.projectId`, without needing to already know a specific document/topic/expert node to start from.

---

## Non-Functional Requirements

- RBAC: nothing in this feature relaxes existing document/project/department access control. Related documents/projects surfaced via FR-3 must respect the same `accessSql()`-style scoping already enforced by Rank 12/13's endpoints — a user never sees a related document they couldn't otherwise open.
- No regression to the existing `TopicsView`, `LessonsPanel`, Timeline panel, or the document-side `DocumentProjectLink` suggestion UI — this feature composes and extends, it does not replace any of them.
- FR-2's mechanism must not require a backfill migration across every existing project-scope `Topic`/`Document` pair before shipping — new/updated documents should populate it going forward at minimum, consistent with how every other Tier-2 additive field in this codebase has shipped (default-safe, no mandatory backfill).
- FR-4, if it adds a `Lesson.topicId` foreign key, must not require every existing `Lesson.topic` free-text row to be resolved to a real `Topic` before merge — nullable, additive, coexists with the free-text field.

---

## Data Model Impact (proposed, not final)

```
// FR-2 — only if the "extend refreshTopicExpertise()" mechanism is chosen over
// the query-time-join alternative. No schema change either way to TopicExpertise
// itself; this note exists to flag that FR-2's mechanism choice has no data
// model impact of its own — it's a scoring/query-path decision, not a migration.

// FR-4 — only if Lesson.topic is upgraded to a real Topic join:
Lesson {
  ...existing fields unchanged...
  topic    String?  // existing free-text field, preserved as-is
  topicId  String?  // new, optional, additive — FK to Topic, nullable so existing rows are unaffected
  topicRef Topic?   @relation(fields: [topicId], references: [id])
}
```
No new models required either way. Any schema change is additive to `Lesson` only, and only if FR-4 resolves toward a real join.

---

## Open Questions

1. **FR-2 mechanism.** Extend `refreshTopicExpertise()` to also run for project-scope `Topic` rows (mirrors repository-scope exactly, but doubles the write path per document), or compute a query-time bridge from a project-scope topic to its documents' repository-scope topics' existing `TopicExpertise` (no new writes, but couples this feature's read path to the fact that every project document also gets a parallel repository-scope classification today). Needs an implementation call before FR-2 starts; the query-time bridge is cheaper and doesn't risk double-counting signals into `TopicExpertise.signals`, but relies on an implementation detail (dual classification) of `worker/cluster.js` that isn't guaranteed to remain true forever.
2. **FR-5 graph entry point.** Does `getKnowledgeGraph()` already support a `Project` row as a valid `startNode` type, or does this feature need to add that as a small extension to `src/lib/knowledgeGraph.js`? Needs a code check at implementation time, not a product decision — flagged here so it isn't discovered mid-FR-1.
3. **FR-4 resolution.** Real `Topic` join, or stay free text? Affects whether this feature touches `prisma/schema.prisma` at all. Lessons' own doc left this open specifically for this feature to decide — resolve before FR-1 UI work locks in what a "topic" filter chip means across panels.
4. Should FR-3's "related documents/projects" view include repository-scope `DocumentRelationship` rows whose `weight` is very low (per Rank 12's `RELATIONSHIP_MIN_CONFIDENCE` policy), or apply a stricter project-facing threshold? Needs a product call once real data volume is visible — default to reusing Rank 12's existing floor unless it proves too noisy at the project level.

---

## Acceptance Criteria (draft)

- A project's page (or a linked tab) shows topics, lessons, timeline, experts, and related documents/projects together, without duplicating any existing panel's implementation.
- At least one mechanism exists for computing "who's an expert in this project's topics" — verified against a project with documents that already have repository-scope `TopicExpertise` data.
- Non-suggested `DocumentProjectLink` rows and RBAC-scoped `DocumentRelationship`/`DocumentConflict` rows for the project's own documents are visible from the project side, not only the document side.
- `Lesson.topic`'s free-text-vs-join question (Lessons' Open Question 2) is explicitly resolved and documented, whichever way it goes.
- A user can reach a project-filtered view of the Rank 13 knowledge graph directly from the project page.
- No regression to the existing `TopicsView`, `LessonsPanel`, Timeline panel, or document-side project-link suggestions.
- No related document/project is ever shown to a user who couldn't otherwise access it.
