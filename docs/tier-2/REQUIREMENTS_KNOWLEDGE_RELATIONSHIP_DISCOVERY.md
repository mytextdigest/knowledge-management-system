# Requirements: Knowledge Relationship Discovery

**Capability:** Knowledge Relationship Discovery
**PRD Rank:** 12 (Tier 2 — Organizational Intelligence)
**Owner:** Sandeep — full feature end-to-end, one PR.
**Purpose:** Reveal hidden connections — surface why two pieces of organizational knowledge matter to each other even when they never use the same wording.

---

## Problem Statement

This is **not greenfield**. A single-signal version of this exact capability already runs in production today:

- `worker/knowledgeContext.js`'s `processKnowledgeContext()` is fired as an async job (`worker/index.js`) after every document is processed. It already does candidate discovery (`findRelatedDocumentsWithPgvector()`: top chunks of the new document, pgvector cosine-distance nearest-neighbor against every other document's chunks), a fixed similarity threshold (`RELATED_THRESHOLD = 0.72`), a naive type classifier (`relationshipType()`: `"references"` if the other document's filename is mentioned in the text, `"supersedes"` if the text matches a regex like `/supersedes|replaces|obsolete/`, otherwise `"related"`), and upserts the result into `DocumentRelationship` with `evidence: { embeddingSimilarity, strategy: "pgvector_chunk_knn" }`.
- That table is already read back out with RBAC applied: `getAccessibleRelatedDocuments()` (`src/lib/knowledgeContext.js`) powers a live "Related documents" panel on the document page (`src/app/(app)/document/page.jsx`, ~line 1348) today — filename + weight-percentage chips, no evidence or type shown.
- `DocumentRelationship.weight`/`.evidence` are the intended place to represent confidence and provenance — the schema already anticipated this.

So Rank 12 is an **upgrade of a live single-signal job to multi-signal scoring**, not new construction. Two gaps in the existing job matter more than "it only uses embeddings":

1. **Scope gap.** `processKnowledgeContext()` returns early (`{skipped: true}`) for any document where `doc.scope !== "repository"` — project-scoped documents get **zero** relationship discovery today.
2. **Overlap with an existing, separate feature.** The codebase already has a dedicated contradiction-detection pipeline — `DocumentConflict` (model) + `worker/detectConflicts.js` (populates it) + `GET /api/org/[orgId]/health` (surfaces conflict counts). A `CONTRADICTS` relationship type on `DocumentRelationship` would create two competing sources of truth for the same concept. **Resolved for this doc: Rank 12 does not introduce a `contradicts` type.** Contradiction stays owned by `DocumentConflict`; see the Interface Contract below for how the two are composed for callers (including [[REQUIREMENTS_ORGANIZATIONAL_KNOWLEDGE_GRAPH]], Rank 13).

---

## Scope

In scope:
- Extending the existing `processKnowledgeContext()` job with additional signals beyond embedding similarity: topic overlap (`TopicDocument`), entity overlap (`Entity`), project context (`Document.projectId` / confirmed `DocumentProjectLink`), and decision/lesson chain evidence (`Decision`, `Lesson`).
- Extending relationship discovery to project-scoped documents (closing the scope gap above), with an explicit decision on candidate pool boundaries (see Open Questions).
- A configurable confidence-weight formula, replacing the current fixed `RELATED_THRESHOLD`/raw-similarity weight.
- Enriching the existing `evidence` JSON shape with a per-signal breakdown (additive — no schema change).
- A new small relationship-type set, added to the existing `"related" | "references" | "supersedes"`: `shares_topic`, `shares_entity`, `related_to_project`, `related_to_lesson`. No `contradicts` type (see Problem Statement).
- A new org-wide relationships endpoint (nothing like this exists today — only the per-document read path).
- Enriching the existing "Related documents" panel on the document page with evidence/type/confidence, not just a weight percentage.

Out of scope (handled elsewhere or explicitly deferred):
- Contradiction detection — owned entirely by `DocumentConflict`/`worker/detectConflicts.js`; this feature composes with it, does not duplicate it.
- Graph visualization/traversal UI — that's [[REQUIREMENTS_ORGANIZATIONAL_KNOWLEDGE_GRAPH]] (Rank 13). This feature's job is producing well-scored, well-evidenced `DocumentRelationship` rows; Rank 13 consumes them.
- Rebuilding the pgvector candidate-retrieval mechanism — `findRelatedDocumentsWithPgvector()` is extended, not replaced.
- Project Intelligence's broader "link projects, documents, lessons, experts" cross-cutting layer (Rank 15) — this feature only strengthens document-to-document relationship scoring.

---

## Interface Contract with Existing Conflict Detection (`DocumentConflict`)

`DocumentRelationship` and `DocumentConflict` remain two separate models, populated by two separate jobs (`processKnowledgeContext()` and `worker/detectConflicts.js` respectively), and neither this feature nor Rank 13 should merge them into one type. Any API that answers "how are these two documents connected" (this feature's new org-wide endpoint, and Rank 13's graph service) must compose both sources and tag them distinctly in the response — e.g. `kind: "relationship"` vs `kind: "conflict"` — rather than Rank 12 inventing a `contradicts` relationship type that duplicates what `DocumentConflict` already tracks (including its review workflow: `status: "flagged" | "reviewed" | "dismissed"`, which `DocumentRelationship` has no equivalent of and should not need one).

## Interface Contract with Rank 13 (Organizational Knowledge Graph)

Rank 13 reads `DocumentRelationship` rows as one of its edge sources and does not implement its own discovery/scoring logic. Rank 13 does **not** need to wait for this feature to be complete — it can and should build against whatever `DocumentRelationship` rows exist today (the current single-signal job's output) and gets richer automatically as this feature improves scoring, since both read/write the same table. Coordinate the final `evidence` JSON shape (per-signal breakdown field names) with Simran before finalizing, since Rank 13's UI will want to render it (PRD Rank 13 doc, section 10, "Evidence and Trust").

---

## Functional Requirements

### FR-1 — Multi-Signal Scoring (extends `processKnowledgeContext()`)
- Add topic-overlap, entity-overlap, and project-context signals to the existing embedding-similarity signal already computed by `findRelatedDocumentsWithPgvector()`. Each signal is computed from data that already exists (`TopicDocument`, `Entity`, `Document.projectId`/confirmed `DocumentProjectLink`) — no new extraction pipeline.
- Decision/lesson chain signal: two *different* documents are linked with `related_to_lesson` evidence when one document's extracted `Decision` is the `decisionId` on a `Lesson` whose `documentId` is the other document (or both documents share a `Lesson.projectId`). This is distinct from the existing direct `Decision.documentId`/`Lesson.documentId` foreign keys, which already link a document to its own decisions/lessons — FR-1 is about connecting two *different* documents through a shared decision/lesson context, not duplicating those existing direct links.

### FR-2 — Configurable Confidence Formula
- Replace the fixed `RELATED_THRESHOLD = 0.72` cutoff and raw-similarity `weight` with a weighted combination of all active signals (embedding similarity + topic overlap + entity overlap + project context + decision/lesson evidence). Weights must be configurable (constants in one place, not scattered magic numbers), not re-hardcoded per signal.

### FR-3 — Extend Scope Coverage to Project Documents
- Remove or narrow the `doc.scope !== "repository"` early return in `processKnowledgeContext()` so project-scoped documents also get relationship discovery. Define the candidate pool explicitly (see Open Questions) rather than leaving it implicit.

### FR-4 — Relationship Type Taxonomy
- Add `shares_topic`, `shares_entity`, `related_to_project`, `related_to_lesson` to the existing `relationshipType()` classifier's output space, alongside the existing `related`/`references`/`supersedes`. A relationship gets the most specific type its evidence supports; `related` remains the fallback when evidence exists but doesn't cleanly classify. No `contradicts` type (Interface Contract above).

### FR-5 — Evidence Enrichment
- Extend the `evidence` JSON (currently `{embeddingSimilarity, strategy}`) with a per-signal breakdown, e.g. `{embeddingSimilarity, topicOverlap, entityOverlap, projectContext, lessonEvidence, strategy}`. Purely additive to the existing JSON column — no migration required beyond what already exists.

### FR-6 — Org-Wide Relationships Endpoint
- `GET /api/org/[orgId]/relationships` — new. RBAC-scoped the same way `getAccessibleRelatedDocuments()` already scopes the per-document read path (reuse that access-SQL pattern, don't reinvent it). Composes `DocumentRelationship` and `DocumentConflict` per the Interface Contract above, tagged by `kind`.

### FR-7 — Related-Documents UI Enrichment
- Extend the existing "Related documents" panel (`src/app/(app)/document/page.jsx`, ~line 1348) to show relationship type and a short evidence summary (e.g. "Same project · Authentication · 3 shared entities"), not just a weight percentage. This is a UI enhancement of existing, shipped functionality.

---

## Non-Functional Requirements

- Relationship (re)scoring continues to run as a background job (already true today via the existing SQS-backed worker queue) — this feature must not add synchronous cost to upload or chat latency.
- RBAC: relationship visibility must never exceed the visibility of the underlying documents. Reuse the existing `accessSql()`-style scoping already used by `getAccessibleRelatedDocuments()`/`vectorSearch.js`'s `scopeSql()` rather than writing new authorization logic.
- No regression to the existing document-page "Related documents" panel or the existing single-signal relationships already populated for repository-scoped documents — this is an extension, not a replacement, of a shipped feature.
- Must not create excessive low-quality relationships — the confidence formula (FR-2) should be tunable enough to keep the relationship count per document bounded and meaningful (no fixed number mandated here; validate empirically during `13-H`, see tracker).

---

## Data Model Impact

No new models or migrations required. This feature only:
- Writes richer `evidence` JSON into the existing `DocumentRelationship.evidence` column (FR-5).
- Writes new `type` values into the existing `DocumentRelationship.type` string column (FR-4) — no enum change needed since `type` is already a free-form `String`.
- Reads `Entity`, `TopicDocument`, `Decision`, `Lesson`, `DocumentProjectLink` — all already exist.

---

## Open Questions

1. For FR-3 (project-scope coverage): should project-scoped documents be compared only against other documents in the same project, or org-wide the same way repository documents are today? Org-wide risks noisy cross-project matches; project-only risks missing genuinely useful repository↔project connections. Needs a product decision before implementation.
2. Confidence-weight defaults (FR-2) — who signs off on the specific formula/weights before this ships? Propose validating against a handful of known-good and known-bad example pairs during implementation, rather than picking numbers a priori.
3. Should `DocumentConflict` rows be pulled into FR-6's response by this feature's endpoint, or should Rank 13's graph service query both models independently? Leaning toward composing them in one shared read helper (in `src/lib/knowledgeContext.js`, alongside `getAccessibleRelatedDocuments()`) so both this feature's endpoint and Rank 13 call one function instead of two independent implementations drifting apart.

---

## Acceptance Criteria (draft)

- A document pair connected only by shared project + shared topic + shared entities (no strong embedding similarity) is discoverable as a relationship — i.e., scoring is demonstrably multi-signal, not embedding-only.
- Project-scoped documents get relationships populated (previously: none).
- No `contradicts` relationship type exists on `DocumentRelationship`; conflict data continues to come exclusively from `DocumentConflict`.
- The document-page "Related documents" panel shows relationship type and evidence, not only a weight percentage.
- `GET /api/org/[orgId]/relationships` returns RBAC-scoped results composing both relationship and conflict data, clearly tagged.
- No latency regression on document upload/processing (relationship scoring remains fully background).
