# Tier 2 Rank 12 + Rank 13 Acceptance Audit

## Rank 12 — Knowledge Relationship Discovery (Sandeep)

- 13-A: multi-signal relationship scoring includes embedding, topic, entity, and project signals.
- 13-B: decision/lesson chain evidence participates in discovery and scoring.
- 13-C: confidence weights and threshold live in one policy module; output is bounded.
- 13-D: project documents are no longer skipped. Candidate pool is same-project + published repository knowledge in the org.
- 13-E: taxonomy includes shares_topic, shares_entity, related_to_project, related_to_lesson plus existing related/references/supersedes. No contradicts type.
- 13-F: evidence JSON is additive and shared with Rank 13.
- 13-G: org relationships endpoint composes DocumentRelationship and DocumentConflict with distinct kind values and applies access SQL to both document endpoints.
- 13-H: existing Related documents UI now shows type and evidence summary without changing click-through behavior.
- 13-I: static/logic regression suite added; DB/browser validation should be run in the developer environment before merge.
- 13-J: PR/cross-review remains a workflow step after local validation.

## Rank 13 — Organizational Knowledge Graph (Simran)

- 14-A: reusable `src/lib/knowledgeGraph.js` normalizes Document, Project, Topic, Entity, Expert, Decision, Lesson, and Department nodes.
- 14-B: direct and confirmed project links are explicit; suggested links require includeSuggested.
- 14-C: TimelineEvent supplies explicit contextual edges.
- 14-D: every emitted edge carries provenance; inferred edges preserve Rank 12 evidence/weight and conflicts remain distinct.
- 14-E: frontend-neutral bounded traversal API supports a start node, 1–2 hops, filters, and caps.
- 14-F: document RBAC is resolved in the service before graph construction/traversal; inaccessible document edges cannot leave the service.
- 14-G: search-first progressive UI, neighbor counts, expansion, relationship/suggested filters, and document navigation are implemented.
- 14-H: static acceptance tests added; DB/browser cross-department/project scenarios should be validated before merge.
- 14-I: PR review should explicitly sign off on graph RBAC and indirect-disclosure boundary.

## Shared contract

Rank 12 writes `DocumentRelationship` scoring/evidence. Rank 13 consumes it. `DocumentConflict` is never converted to a `DocumentRelationship` contradiction type. Rank 13 represents conflict as separate provenance.
