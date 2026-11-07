# Requirements: Organizational Knowledge Graph

**Capability:** Organizational Knowledge Graph
**PRD Rank:** 13 (Tier 2 — Organizational Intelligence)
**Owner:** Simran — full feature end-to-end, one PR.
**Purpose:** Enterprise-wide knowledge map — let users and future AI capabilities navigate how documents, projects, topics, people, decisions, and lessons connect across the organization, not just view them one at a time.

---

## Problem Statement

Unlike Ranks 9–11, the underlying **data** for this feature is not thin — it's genuinely rich and already relational: `Document`, `Project`, `Topic`/`TopicDocument`, `Entity`, `Decision`, `Lesson`, `TopicExpertise`, `DocumentProjectLink`, `DocumentRelationship`, and `TimelineEvent` all exist today in `prisma/schema.prisma`, each capturing part of "how organizational knowledge connects." What's genuinely greenfield is the **graph layer itself** — confirmed: no `src/lib/knowledgeGraph.js`, no `/knowledge-graph` route, no graph-shaped API anywhere in `src/app/api`. This feature's job is to normalize, expose, traverse, and visualize relationships that mostly already exist, not to invent new ones.

Two nuances need resolving before implementation, both raised during research review:

1. **`Document → Project` is not one relationship.** There's the direct `Document.projectId` foreign key *and* a separate many-to-many `DocumentProjectLink` table with a `status` field (`"suggested"` by default, confirmed elsewhere in the codebase before being treated as authoritative — see `src/components/repository/UploadToRepositoryModal.jsx` and the document page's "suggested project links" section). **Resolved for this doc:** only `Document.projectId` (direct) and `DocumentProjectLink` rows with `status !== "suggested"` become default graph edges. Unconfirmed suggestions are excluded unless a caller explicitly passes an `includeSuggested` filter, and when included, are tagged `source: "suggested"` per FR-4 below — never presented as an established fact.
2. **`TimelineEvent` is an existing, unmentioned edge source.** It already links `Project`, `Department`, `Document`, and `Decision` with a date and description (`GET /api/projects/[id]/timeline`, `GET /api/org/[orgId]/department/[deptId]/timeline`). It should feed the graph's edge set alongside `DocumentRelationship`/`TopicDocument`/etc., not be treated as a separate, unrelated concept.

---

## Scope

In scope:
- A `src/lib/knowledgeGraph.js` service that normalizes existing Prisma records into nodes (`Document`, `Project`, `Topic`, `Entity`, `Person/Expert`, `Decision`, `Lesson`, `Department`) and edges derived from existing relations (`TopicDocument`, confirmed `Document.projectId`/`DocumentProjectLink`, `Entity.documentId`, `Decision.documentId`, `Decision.lessons`/`Lesson.decisionId`, `Lesson.projectId`, `TopicExpertise`, `DocumentRelationship`, `TimelineEvent`).
- A bounded, RBAC-scoped traversal API: `GET /api/org/[orgId]/knowledge-graph`.
- A progressive-expansion graph UI: search → starting node → direct neighbors → expand on click, with node-type/department/project/relationship filters.
- Explicit provenance on every edge: explicit (native FK/relation) vs. inferred (`DocumentRelationship`, [[REQUIREMENTS_KNOWLEDGE_RELATIONSHIP_DISCOVERY]]) vs. conflict (`DocumentConflict`).

Out of scope (handled elsewhere or explicitly deferred):
- Relationship discovery/scoring itself — owned by [[REQUIREMENTS_KNOWLEDGE_RELATIONSHIP_DISCOVERY]] (Rank 12). This feature consumes `DocumentRelationship` rows; it does not compute them.
- A dedicated graph database (Neo4j or similar) — v1 is an application-layer graph over the existing PostgreSQL/Prisma data. Revisit only if real usage demonstrates PostgreSQL/application-level traversal can't support the required depth/volume.
- GraphRAG / using the graph as conversational-assistant retrieval context — a real future direction (see the PRD's "Connect" positioning of this capability alongside Expert Discovery and Decision Intelligence), but a Tier-3-shaped follow-on, not this pass.
- Project Intelligence's own cross-linking product surface (Rank 15) — this feature provides the general-purpose graph primitive; Rank 15 may build a project-specific view on top of it later.

---

## Interface Contract with Rank 12 (Knowledge Relationship Discovery)

This feature reads `DocumentRelationship` as one edge source and does not reimplement discovery/scoring. It does not block on Rank 12's completion — it builds against whatever `DocumentRelationship` rows exist at any point in time (today: the existing single-signal job's output) and improves automatically as Rank 12 lands richer signals, since both features read/write the same table. Coordinate the `evidence` JSON field names with Sandeep (owner of Rank 12) so this feature's edge-evidence rendering (FR-4) doesn't need to be rewritten against a shape that changes later.

## Interface Contract with Existing Conflict Detection (`DocumentConflict`)

`DocumentConflict` rows are surfaced as a third, distinct edge kind (`source: "conflict"`), never merged into or confused with `DocumentRelationship`-derived edges. This mirrors Rank 12's own Interface Contract with `DocumentConflict` — both features treat "related to" and "contradicts" as permanently separate concepts.

---

## Functional Requirements

### FR-1 — Knowledge Graph Service
- `src/lib/knowledgeGraph.js`: given `{orgId, startNode, depth, filters, currentUser}`, returns `{nodes, edges}` built from the existing Prisma models listed in Scope above. API/UI code does not need to understand every underlying Prisma relationship individually — that's this service's job.

### FR-2 — Graph Traversal API
- `GET /api/org/[orgId]/knowledge-graph` with parameters for starting node (type + id), traversal depth, and filters (department, project, topic, relationship type, `includeSuggested`). v1 bounds depth to 1–2 hops and imposes a node/edge cap per response (see Open Questions for the default).
- Response shape is frontend-neutral JSON (`{nodes: [{id, type, label, ...}], edges: [{source, target, type, source: "explicit"|"inferred"|"conflict"|"suggested"}]}`), so the same service can support the UI now and other consumers (e.g. future GraphRAG) later without a reshape.

### FR-3 — RBAC Before Traversal
- Authorization happens inside the graph service *before* nodes/edges are returned — never only when a user later tries to open the underlying document. Reuse the existing `accessSql()`-style scoping (`src/lib/knowledgeContext.js`) rather than writing new authorization logic. A confidential document must not be indirectly disclosed by an edge label even if its content stays hidden (e.g. showing `Confidential Acquisition Plan → Project Phoenix` as an edge is itself a disclosure).

### FR-4 — Edge Provenance and Evidence
- Every edge carries a `source` tag: `"explicit"` (native FK/relation — e.g. `Document.projectId`, `Decision.documentId`), `"inferred"` (from `DocumentRelationship`, carrying its `evidence`/`weight`), `"conflict"` (from `DocumentConflict`), or `"suggested"` (unconfirmed `DocumentProjectLink`, only present when `includeSuggested` is requested). The UI renders these visibly differently — an established organizational fact must never look identical to an AI-inferred or AI-suggested one.

### FR-5 — Document→Project Edge Resolution
- Default graph edges for `Document → Project` come from `Document.projectId` (direct) and `DocumentProjectLink` rows where `status !== "suggested"` only. Suggested links are excluded by default (see Problem Statement, point 1).

### FR-6 — Progressive Graph UI
- Entry point is a search box, not an immediately-rendered full network. Selecting a node shows a neighbor-count summary (e.g. "Authentication → 12 Documents, 3 Projects, 4 Experts, 2 Decisions, 3 Lessons") before expansion. Expand/collapse per node. Filters for node type, department, project, relationship type, and (per FR-5) a toggle to include suggested links. Clicking a document node navigates to the existing document page (`/document?id=...`) rather than duplicating document UI inside the graph.

### FR-7 — TimelineEvent as an Edge Source
- `TimelineEvent` rows (already populated per-document during ingestion, already read via the existing project/department timeline APIs) feed graph edges connecting `Project`/`Department`/`Document`/`Decision`, tagged `source: "explicit"` since they're a native relation, not an inference.

---

## Non-Functional Requirements

- No dedicated graph database in v1 — pure Postgres/Prisma, consistent with everything else in this codebase.
- No endpoint may return an organization's entire graph — every response is bounded by starting point, depth, and a node/edge limit (progressive expansion, not a single large payload).
- RBAC must be applied before nodes/edges leave the service layer (FR-3) — this is a hard requirement given the graph's ability to indirectly disclose restricted associations even without exposing content.
- Must not regress or duplicate the existing per-document related-documents panel, per-project/department timeline pages, or Expert Discovery/Recommendations pages — this feature is a new cross-cutting view, not a replacement for those existing surfaces.

---

## Data Model Impact

No new models required for v1 — this is a read-layer over existing tables (`Document`, `Project`, `Topic`, `TopicDocument`, `Entity`, `Decision`, `Lesson`, `TopicExpertise`, `DocumentProjectLink`, `DocumentRelationship`, `TimelineEvent`, `Department`, `Organization`, `User`). A materialized/cached graph representation is explicitly deferred — only build it if real traversal-performance measurements justify it, not preemptively.

---

## Open Questions

1. Should a `User`/`Person` node appear for every document uploader, or only for confirmed experts (`TopicExpertise` rows)? Defaulting to "confirmed experts only" keeps the graph meaningfully curated rather than noisy; needs a product call.
2. Default depth/node-count limits for v1 — propose 2 hops and ~75 nodes per expansion as a starting point, to be revisited after real usage rather than fixed a priori.
3. Is doubling this graph service as future GraphRAG context for the conversational assistant (chat) explicitly in scope for a fast-follow, or purely aspirational for now? Affects whether FR-1's service signature should anticipate a "return as LLM-context text" mode now or later.

---

## Acceptance Criteria (draft)

- Major KMS knowledge objects (Document, Project, Topic, Entity, Person/Expert, Decision, Lesson, Department) are representable as graph nodes with stable IDs.
- Existing native relations are normalized into edges without requiring [[REQUIREMENTS_KNOWLEDGE_RELATIONSHIP_DISCOVERY]] (Rank 12) to be complete first.
- `DocumentRelationship` (inferred) and `DocumentConflict` (conflict) rows are surfaced as distinctly-tagged edges, never merged with explicit relations.
- Suggested (unconfirmed) `DocumentProjectLink` rows never appear as plain, undistinguished edges.
- RBAC is enforced before any node/edge is returned — verified with a case where a user can see Document A but not Document B, and no edge to B is exposed.
- Traversal works to at least 2 hops from a chosen start node with a bounded response size.
- No separate graph database is introduced.
- Reusable backend service (`src/lib/knowledgeGraph.js`) and API (`GET /api/org/[orgId]/knowledge-graph`) exist independent of the visualization UI.
