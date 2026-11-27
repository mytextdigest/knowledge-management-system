# Tier 2 Rank 12 + Rank 13 Handoff

## Sandeep — Rank 12 Knowledge Relationship Discovery

Upgrades the existing background relationship job rather than replacing it. Multi-signal scoring now combines embedding similarity, topic overlap, entity overlap, confirmed/direct project context, and decision/lesson evidence. The scoring policy is centralized and bounded. Project documents use same-project plus published repository candidates in the same organization. Evidence field names are shared with Rank 13. `DocumentConflict` remains separate and no `contradicts` relationship type is created.

New org endpoint: `GET /api/org/[orgId]/relationships`. Existing document Related Documents UI now renders relationship type and evidence summary.

## Simran — Rank 13 Organizational Knowledge Graph

Adds an application-layer graph over existing PostgreSQL/Prisma data; no graph database and no graph persistence model. `src/lib/knowledgeGraph.js` performs normalization, RBAC scoping, provenance tagging, and bounded traversal. Suggested project links are opt-in. The UI is search-first and progressively expands a chosen node rather than rendering an organization-wide graph.

New org endpoint: `GET /api/org/[orgId]/knowledge-graph`.
New UI: `/org/[orgId]/knowledge-graph`.

## Final validation before PR

Run `npm run task13:test`, `npm run task14:test`, existing Task 10/11 regressions, Prisma generation, ESLint, and the app/browser smoke checks. Validate cross-department/cross-project RBAC against the connected dev database before merge. PR review should explicitly cover Rank 12 scoring/conflict composition and Rank 13 indirect-disclosure RBAC.
