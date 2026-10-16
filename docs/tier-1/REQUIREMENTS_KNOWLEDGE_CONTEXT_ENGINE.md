# Requirements: Knowledge Context Engine

**Capability:** Knowledge Context Engine
**PRD Rank:** 8 (Tier 1)
**Owner:** Sandeep — full feature end-to-end, one PR.
**Purpose:** Understands relationships among documents, topics, people, and projects — turns the Knowledge Repository from a searchable pile of files into a connected graph of who knows what, what relates to what, and where a given piece of knowledge fits in the organization.

---

## Problem Statement

The current system (Tasks 3-A, 3-B) can retrieve relevant chunks for a query (`orgSearch()` in `src/lib/vectorSearch.js`) and answer questions citing `[Document Name → Department]`. But it has no model of:
- **Document-to-document relationships** beyond embedding similarity at query time (no persisted graph; every query recomputes from scratch).
- **People-to-knowledge relationships** — there's no way to answer "who has written about X" or "who should I ask about Y" (expertise discovery). `OrganizationMember`/`DepartmentMember` only model org structure, not knowledge ownership.
- **Topic relationships across the org** — `Topic`/`TopicDocument` (`prisma/schema.prisma`) exist but are scoped to a single `Project`, with no org-wide equivalent and no relationships *between* topics.
- **Project-to-knowledge relationships** — a repository document discussing "Project Phoenix" has no link back to an actual `Project` entity even if one exists with that name.

This capability is the layer that makes the Knowledge Repository feel like an institutional memory rather than a file cabinet with search.

---

## Scope

In scope:
- A persisted graph (or graph-like relational model) of relationships: Document ↔ Document, Document ↔ Topic, Topic ↔ Topic, Document ↔ Person (author/contributor/citer), Document ↔ Project.
- Org-wide topic extraction (extending the existing project-scoped `Topic` model to repository-scoped knowledge).
- Expertise discovery: "who knows about X" derived from authorship, upload history, and chat citation patterns.
- Surfacing relationships in the UI — e.g., "related documents" on a document page, "people who might help" on a search/chat result.

Out of scope:
- Initial classification/tagging of a single document in isolation — that's [[REQUIREMENTS_AUTO_CLASSIFICATION]]. The Context Engine consumes classification output (category, etc.) as one input signal but doesn't replace it.
- Real-time collaborative editing or document versioning graphs.
- Building a general-purpose graph database; default to modeling relationships relationally in Postgres unless query patterns prove that inadequate.

---

## Functional Requirements

### FR-1 — Org-Wide Topic Model
- Extend topic clustering beyond per-project (`Topic.projectId`) to also cover `scope=repository` documents at the org level.
- A topic should be discoverable independent of which department or project a document lives in — e.g., "Vendor Contracts" as a topic spanning Legal and Procurement.
- Reuse `centroidEmbedding`/`keywordDistribution` pattern from the existing `Topic` model rather than inventing a new representation, unless it doesn't scale to org volume.

### FR-2 — Document Relationship Graph
- Persist explicit relationships between documents: "references", "supersedes", "related-to" (derived from embedding proximity + shared topics, not just raw cosine similarity at query time).
- Relationships should be computed as a background job after ingestion, not on every page load.
- Surface "Related Documents" on the document detail page (`src/app/(app)/document/page.jsx`) and on repository document cards.

### FR-3 — Expertise Discovery
- For a given topic or document, identify people connected to it: document uploader, frequent citer (via `OrgMessage`/chat citation history), department members whose documents cluster in that topic.
- Answer the query pattern "who should I ask about X" — surfaced in Enterprise Chat (`/org/[orgId]/chat`) as a suggested-people panel alongside source citations, and/or as a standalone lookup.
- Must respect existing RBAC — never surface a person as an "expert" on a document the asking user wouldn't otherwise have access to. This is the highest-risk FR in this feature: getting the RBAC boundary wrong doesn't just show a wrong answer, it leaks the existence of a document or a person's association with one.

### FR-4 — Document-to-Project Linking
- Detect when a repository document references an existing `Project` by name/context and offer a link between them.
- Advisory only (like FR-2/FR-3 in [[REQUIREMENTS_AUTO_CLASSIFICATION]]) — never auto-merges or auto-links without confirmation.

### FR-5 — Relationship-Aware Search & Chat
- `orgSearch()` results can optionally be expanded with "also see" results pulled from the relationship graph (FR-2), not just raw vector similarity — e.g., a document that's topically central but didn't directly match the query embedding.
- Enterprise Chat answers can mention related context ("this is also discussed in [Document B]") when relationship data supports it.
- Same RBAC constraint as FR-3 applies: a related document mentioned in a chat answer must be one the asking user can access.

---

## Non-Functional Requirements

- Relationship computation must be background/batch — never inline with upload or chat response latency.
- Must scale to the same target as Task 3-A's stated acceptance criterion: "performance acceptable for a repository of 1000+ documents." Graph queries (e.g., "documents related to this topic") need their own indexing strategy, not a full-table scan equivalent to the unindexed pgvector problem fixed in Task 3-A's `ivfflat` index.
- RBAC must be enforced in the relationship/expertise queries themselves (SQL `WHERE`, consistent with the existing rule "RBAC filtering is in the SQL WHERE clause, not post-query filtering" used throughout `vectorSearch.js`), not as a post-filter on top of graph traversal results.
- Expertise discovery must not expose personally-identifying activity (e.g., exact chat questions asked) — only the fact of association with a topic/document.

---

## Data Model Impact (proposed, not final)

```
Topic + orgId        String?   // nullable: existing project-scoped topics keep orgId = null
      + scope        String  @default("project")  // "project" | "repository"

DocumentRelationship {
  id            String
  fromDocumentId String → Document
  toDocumentId   String → Document
  type           String   // "references" | "supersedes" | "related"
  weight         Float    // strength/confidence
  createdAt      DateTime
}

DocumentProjectLink {
  id          String
  documentId  String → Document
  projectId   String → Project
  confidence  Float
  status      String  // "suggested" | "confirmed" | "dismissed"
}

TopicExpertise {
  id        String
  topicId   String → Topic
  userId    String → User
  score     Float   // derived from authorship/citation frequency
  updatedAt DateTime
}
```
These are starting points — validate against actual query patterns (e.g., "related documents for doc X" vs. "experts for topic Y") before finalizing indexes. `Topic` already exists in the schema (landed in Block A); this feature only adds the `scope` column plus the three new tables above, all owned by this single feature/PR.

---

## Open Questions

1. Is org-wide topic extraction a new batch job, or an extension of whatever clustering currently produces `Topic` rows for projects (`worker/cluster.js`)? Confirm before implementation — reusing the existing job is strongly preferred over a parallel one.
2. How is "citation" tracked today, if at all? `OrgMessage` stores chat content but citations are recomputed in the response and not retained on reload — expertise discovery (FR-3) needs persisted citation data, which may require a schema change to `OrgMessage` first.
3. Should relationship/topic/expertise data be org-scoped only, or could a document's relationships span multiple orgs the same user belongs to? (Likely no — keep strictly org-scoped to avoid RBAC leakage.)
4. What UI surface is expertise discovery worth building first — a chat-side panel, a dedicated "Ask an Expert" page, or just metadata on document/topic pages?
5. For FR-5, what's the threshold for injecting a relationship-derived "also see" result into a chat answer — always when relationship data exists, or only above some relationship-weight threshold, to avoid noisy/low-confidence tangents in answers?

---

## Acceptance Criteria (draft)

- An org-wide topic exists independent of any single project, derived from `scope=repository` documents.
- A document detail page shows at least one "related document" link backed by persisted relationship data, not a live similarity query.
- A chat or search query about a topic can surface at least one relevant person, respecting the asking user's RBAC — verified by a query that returns zero people when the asking user has no access to the underlying documents.
- Relationship and expertise computations run as background jobs and do not add latency to upload, search, or chat response times.
- A repository document that clearly references an existing project surfaces a `DocumentProjectLink` suggestion, confirmable/dismissable in one click.
