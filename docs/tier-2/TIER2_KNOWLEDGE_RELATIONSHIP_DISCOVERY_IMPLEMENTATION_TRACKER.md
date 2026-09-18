# Rank 12 (Knowledge Relationship Discovery) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 12. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for `TIER2_KNOWLEDGE_RECOMMENDATION_ENGINE_IMPLEMENTATION_TRACKER.md` and `TIER2_LESSONS_LEARNED_INTELLIGENCE_IMPLEMENTATION_TRACKER.md`, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Sandeep**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_KNOWLEDGE_RELATIONSHIP_DISCOVERY.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **This is an extension of existing, merged code, not a fresh build.** `worker/knowledgeContext.js`'s `processKnowledgeContext()` already runs today as a background job and already populates `DocumentRelationship` with single-signal (embedding-only) scoring for repository-scoped documents; `getAccessibleRelatedDocuments()` (`src/lib/knowledgeContext.js`) already serves it, RBAC-scoped, into a live "Related documents" panel on the document page. Read `13-A` before touching scoring logic — it's a multi-signal upgrade of a live job, not a new one.

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

## Milestone 13 — Rank 12 (Knowledge Relationship Discovery)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `13-A` | Multi-Signal Scoring — Topic + Entity + Project Signals (FR-1) | `TODO` | Sandeep | — | | |
| `13-B` | Decision/Lesson Chain Signal (FR-1) | `TODO` | Sandeep | `13-A` | | |
| `13-C` | Configurable Confidence Formula (FR-2) | `TODO` | Sandeep | `13-A`, `13-B` | | |
| `13-D` | Extend Coverage to Project-Scoped Documents (FR-3) | `TODO` | Sandeep | `13-C` | | |
| `13-E` | Relationship Type Taxonomy (FR-4) | `TODO` | Sandeep | `13-C` | | |
| `13-F` | Evidence Enrichment (FR-5) | `TODO` | Sandeep | `13-A`, `13-B` | | |
| `13-G` | Org-Wide Relationships Endpoint (FR-6) | `TODO` | Sandeep | `13-E`, `13-F` | | |
| `13-H` | Related-Documents UI Enrichment (FR-7) | `TODO` | Sandeep | `13-F` | | |
| `13-I` | Integration Validation | `TODO` | Sandeep | `13-D`, `13-G`, `13-H` | | |
| `13-J` | PR + Cross-Review | `TODO` | Sandeep | `13-I` | | |

---

### Task 13-A — Multi-Signal Scoring: Topic + Entity + Project Signals
- **Status:** `TODO`
- **Objective:** FR-1 — add topic-overlap (`TopicDocument`), entity-overlap (`Entity`), and project-context (`Document.projectId` / confirmed `DocumentProjectLink`) signals into `processKnowledgeContext()`'s existing scoring, alongside the embedding-similarity signal `findRelatedDocumentsWithPgvector()` already computes.
- **Key files:** `worker/knowledgeContext.js` (`findRelatedDocumentsWithPgvector()`, `relationshipType()`, `processKnowledgeContext()`).
- **Acceptance criteria:** a document pair with no strong embedding similarity but shared topic + shared entities is discoverable as a relationship.

### Task 13-B — Decision/Lesson Chain Signal
- **Status:** `TODO`
- **Objective:** FR-1 — connect two *different* documents when one's extracted `Decision` is referenced by a `Lesson` whose `documentId` is the other, or both share a `Lesson.projectId`. Distinct from the existing direct `Decision.documentId`/`Lesson.documentId` FKs, which already link a document to its own decisions/lessons.
- **Key files:** `worker/knowledgeContext.js`.
- **Acceptance criteria:** a design document and a later incident/lesson document that share a decision/lesson context are linked, with evidence identifying the shared decision or lesson.

### Task 13-C — Configurable Confidence Formula
- **Status:** `TODO`
- **Objective:** FR-2 — replace the fixed `RELATED_THRESHOLD = 0.72` cutoff and raw-similarity `weight` with a weighted combination of all signals from `13-A`/`13-B`. Weights live in one configurable place, not scattered per-signal magic numbers.
- **Key files:** `worker/knowledgeContext.js`.
- **Acceptance criteria:** relationship weight reflects combined signal strength, not embedding similarity alone; weights are adjustable without code restructuring.

### Task 13-D — Extend Coverage to Project-Scoped Documents
- **Status:** `TODO`
- **Objective:** FR-3 — remove/narrow the `doc.scope !== "repository"` early return in `processKnowledgeContext()`. Resolve Open Question 1 (candidate pool boundaries for project docs) before implementing.
- **Key files:** `worker/knowledgeContext.js`.
- **Acceptance criteria:** project-scoped documents get `DocumentRelationship` rows populated; candidate pool scoping decision is documented in this tracker's notes.

### Task 13-E — Relationship Type Taxonomy
- **Status:** `TODO`
- **Objective:** FR-4 — extend `relationshipType()`'s output space with `shares_topic`, `shares_entity`, `related_to_project`, `related_to_lesson`, in addition to the existing `related`/`references`/`supersedes`. No `contradicts` type — see requirements doc's Interface Contract with `DocumentConflict`.
- **Key files:** `worker/knowledgeContext.js`.
- **Acceptance criteria:** a relationship gets the most specific type its evidence supports; no `contradicts` value is ever written to `DocumentRelationship.type`.

### Task 13-F — Evidence Enrichment
- **Status:** `TODO`
- **Objective:** FR-5 — extend the `evidence` JSON (`{embeddingSimilarity, strategy}`) with a per-signal breakdown (`topicOverlap`, `entityOverlap`, `projectContext`, `lessonEvidence`). Purely additive to the existing JSON column. Agree the final field names with Simran (Rank 13) before finalizing, per the requirements doc's Interface Contract.
- **Key files:** `worker/knowledgeContext.js`.
- **Acceptance criteria:** `DocumentRelationship.evidence` contains a per-signal breakdown consumable by Rank 13's UI without a schema change.

### Task 13-G — Org-Wide Relationships Endpoint
- **Status:** `TODO`
- **Objective:** FR-6 — new `GET /api/org/[orgId]/relationships`, RBAC-scoped via the existing `accessSql()`-style pattern (`src/lib/knowledgeContext.js`). Composes `DocumentRelationship` and `DocumentConflict` rows, tagged by `kind` (`"relationship"` vs `"conflict"`), per the requirements doc's Interface Contract with existing conflict detection.
- **Key files:** new `src/app/api/org/[orgId]/relationships/route.js`; likely a new shared read helper in `src/lib/knowledgeContext.js`.
- **Acceptance criteria:** endpoint returns RBAC-scoped, `kind`-tagged results; no user sees a relationship/conflict involving a document they can't otherwise access.

### Task 13-H — Related-Documents UI Enrichment
- **Status:** `TODO`
- **Objective:** FR-7 — extend the existing "Related documents" panel (`src/app/(app)/document/page.jsx`, ~line 1348) to show relationship type and evidence summary, not only a weight percentage.
- **Key files:** `src/app/(app)/document/page.jsx`, `src/app/api/documents/[id]/route.js` (response shape for `relatedDocuments`).
- **Acceptance criteria:** panel shows e.g. "Same project · Authentication · 3 shared entities" alongside each related document, without regressing existing click-through navigation.

### Task 13-I — Integration Validation
- **Status:** `TODO`
- **Objective:** Full regression pass — confirm existing repository-scoped relationship discovery still works, confirm no `contradicts` type leaks in, confirm project-scope extension (`13-D`) doesn't introduce excessive/noisy relationships, confirm no upload/processing latency regression (scoring remains fully background).
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_KNOWLEDGE_RELATIONSHIP_DISCOVERY.md` verified.

### Task 13-J — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on the confidence-formula weights (`13-C`) and the `DocumentConflict` composition boundary (`13-G`), since both are judgment calls without a single objectively-correct answer.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on scoring-weight and conflict-boundary decisions.
