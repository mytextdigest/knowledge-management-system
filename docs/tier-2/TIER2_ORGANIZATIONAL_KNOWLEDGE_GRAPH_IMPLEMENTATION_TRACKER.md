# Rank 13 (Organizational Knowledge Graph) — Implementation Tracker
### Tier 2 — Organizational Intelligence

> **For AI agents:** This file is the source of truth for task status on Rank 13. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Single-owner feature — do not redistribute.** Matching the convention used for other Tier 2 trackers, this whole feature is one person's end-to-end ownership, submitted as one PR — not split across the team. Every task below is assigned to **Simran**. The task breakdown exists to track sequencing and progress, not to divide work among people.
>
> **Reference documents:** `REQUIREMENTS_ORGANIZATIONAL_KNOWLEDGE_GRAPH.md` for full FR text, data model, and acceptance criteria this tracker's tasks implement.
>
> **The graph layer itself is genuinely new — the data it reads is not.** No `src/lib/knowledgeGraph.js`, `/knowledge-graph` route, or graph-shaped API exists anywhere today. But `Document`, `Project`, `Topic`, `Entity`, `Decision`, `Lesson`, `TopicExpertise`, `DocumentProjectLink`, `DocumentRelationship`, and `TimelineEvent` all already exist and are already related — this feature normalizes and exposes those relations, it does not invent new organizational data. Does **not** block on `TIER2_KNOWLEDGE_RELATIONSHIP_DISCOVERY_IMPLEMENTATION_TRACKER.md` (Rank 12) — build against whatever `DocumentRelationship` rows exist today.

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

## Milestone 14 — Rank 13 (Organizational Knowledge Graph)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `14-A` | Knowledge Graph Service — Node/Edge Normalization (FR-1) | `TODO` | Simran | — | | |
| `14-B` | Document→Project Edge Resolution Rule (FR-5) | `TODO` | Simran | `14-A` | | |
| `14-C` | TimelineEvent as an Edge Source (FR-7) | `TODO` | Simran | `14-A` | | |
| `14-D` | Edge Provenance/Evidence Tagging (FR-4) | `TODO` | Simran | `14-A`, `14-B` | | |
| `14-E` | Graph Traversal API (FR-2) | `TODO` | Simran | `14-D` | | |
| `14-F` | RBAC Enforcement Before Traversal (FR-3) | `TODO` | Simran | `14-E` | | |
| `14-G` | Progressive Graph UI (FR-6) | `TODO` | Simran | `14-F` | | |
| `14-H` | Integration Validation | `TODO` | Simran | `14-F`, `14-G` | | |
| `14-I` | PR + Cross-Review | `TODO` | Simran | `14-H` | | |

---

### Task 14-A — Knowledge Graph Service: Node/Edge Normalization
- **Status:** `TODO`
- **Objective:** FR-1 — build `src/lib/knowledgeGraph.js`, converting existing Prisma records (`Document`, `Project`, `Topic`, `Entity`, `Person/Expert` via `TopicExpertise`, `Decision`, `Lesson`, `Department`) into normalized `{id, type, label}` nodes and their existing relations (`TopicDocument`, `Entity.documentId`, `Decision.documentId`, `Decision.lessons`/`Lesson.decisionId`, `Lesson.projectId`, `TopicExpertise`, `DocumentRelationship`) into `{source, target, type}` edges.
- **Key files:** new `src/lib/knowledgeGraph.js`.
- **Acceptance criteria:** service returns nodes/edges for a given org/start node without the API/UI needing to know the underlying Prisma schema.

### Task 14-B — Document→Project Edge Resolution Rule
- **Status:** `TODO`
- **Objective:** FR-5 — default `Document → Project` edges come from `Document.projectId` (direct) and `DocumentProjectLink` rows with `status !== "suggested"` only. Suggested links excluded by default.
- **Key files:** `src/lib/knowledgeGraph.js`.
- **Acceptance criteria:** an unconfirmed `DocumentProjectLink` never appears as a plain edge without an explicit `includeSuggested` filter.

### Task 14-C — TimelineEvent as an Edge Source
- **Status:** `TODO`
- **Objective:** FR-7 — feed existing `TimelineEvent` rows (Project/Department/Document/Decision) into the graph's edge set, tagged `source: "explicit"`.
- **Key files:** `src/lib/knowledgeGraph.js`.
- **Acceptance criteria:** a decision's timeline context (project, department, document) appears as graph edges without a new extraction step.

### Task 14-D — Edge Provenance/Evidence Tagging
- **Status:** `TODO`
- **Objective:** FR-4 — every edge tagged `source: "explicit" | "inferred" | "conflict" | "suggested"`. Inferred edges carry `DocumentRelationship.evidence`/`.weight`; conflict edges come from `DocumentConflict`. Coordinate `evidence` field names with Sandeep (Rank 12) per both features' Interface Contracts.
- **Key files:** `src/lib/knowledgeGraph.js`.
- **Acceptance criteria:** every edge in the service's output carries a `source` tag; inferred/conflict edges carry their originating evidence.

### Task 14-E — Graph Traversal API
- **Status:** `TODO`
- **Objective:** FR-2 — `GET /api/org/[orgId]/knowledge-graph` with starting node, depth (1–2 hops v1), and filters (department, project, topic, relationship type, `includeSuggested`). Frontend-neutral `{nodes, edges}` JSON.
- **Key files:** new `src/app/api/org/[orgId]/knowledge-graph/route.js`.
- **Acceptance criteria:** endpoint returns bounded, filtered graph data; response shape stable enough for future non-UI consumers.

### Task 14-F — RBAC Enforcement Before Traversal
- **Status:** `TODO`
- **Objective:** FR-3 — apply the existing `accessSql()`-style scoping (`src/lib/knowledgeContext.js`) inside the graph service before nodes/edges are returned, not after. Verify a confidential document's existence isn't disclosed via an edge label even when its content stays hidden.
- **Key files:** `src/lib/knowledgeGraph.js`.
- **Acceptance criteria:** a user who cannot access Document B never receives an edge referencing Document B, even indirectly.

### Task 14-G — Progressive Graph UI
- **Status:** `TODO`
- **Objective:** FR-6 — search-to-node entry point, neighbor-count summary, expand-on-click, filters (node type, department, project, relationship type, suggested-link toggle). Clicking a document node navigates to the existing document page.
- **Key files:** new page under `src/app/(app)/org/[orgId]/knowledge-graph/`, new components under `src/components/knowledge-graph/`.
- **Acceptance criteria:** UI never renders a full org graph at once; expansion is progressive and bounded.

### Task 14-H — Integration Validation
- **Status:** `TODO`
- **Objective:** Full regression pass — confirm RBAC holds under multiple test scenarios (cross-department, cross-project), confirm suggested links stay hidden by default, confirm explicit/inferred/conflict edges render distinctly, confirm no regression to existing document/project/department/timeline pages.
- **Acceptance criteria:** all acceptance criteria in `REQUIREMENTS_ORGANIZATIONAL_KNOWLEDGE_GRAPH.md` verified.

### Task 14-I — PR + Cross-Review
- **Status:** `TODO`
- **Objective:** Submit this feature's PR. Request review explicitly focused on RBAC enforcement (`14-F`) given the graph's inherent risk of indirect information disclosure.
- **Acceptance criteria:** merged to `dev` with explicit reviewer sign-off on the RBAC boundary.
