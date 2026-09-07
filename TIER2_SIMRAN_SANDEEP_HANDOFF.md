# Tier 2 Combined Handoff — Sandeep + Simran

## Scope
This branch implements Sandeep's Expert Discovery (10-A–10-I) and Simran's Knowledge Recommendation Engine (11-A–11-I) together on the supplied latest KMS base.

## Key product/technical decisions
- Expert Discovery: dedicated, sidebar-reachable **Experts** page.
- Recommendations: dedicated, sidebar-reachable **Knowledge Recommendations** page; the old `RelatedWorkPanel` remains unmounted pending explicit team/product confirmation of the placement decision required by 11-A.
- Shared interaction contract: `DocumentInteraction(documentId, userId, orgId, type, createdAt)`.
- Expertise decay: fixed 90-day half-life.
- Dismissed expertise: hidden from discovery and preserved across background refresh.
- Admin expertise confirmation: super admin org-wide; dept admin only for a department they manage and a target member in that department.
- Recommendation effectiveness: aggregate-only; no endpoint exposes individual employees' per-document view history.

## Review hardening added after full requirements audit
- Excluded `recommendation_impression` events from expertise scoring; only real view/download activity contributes.
- Hardened Expert Discovery SQL against a mixed-topic cross-department association leak.
- Strengthened the real DB RBAC integration test to seed one shared topic across an accessible and inaccessible department.
- Made expertise topic authorization independent of whether an existing expert row is present, supporting admin SME designation.
- Tightened document-interaction write RBAC to repository/project access rules rather than broad org-admin bypass.
- Made department trending/effectiveness include org-scoped project documents via `COALESCE(Document.departmentId, Project.departmentId)`.
- Limited dept-admin department choices to member departments in the Recommendations UI; API still enforces `canManageDepartment`.
- Added a visible “Most recommended documents · 30d” effectiveness list.
- Added pure scoring policy modules and behavior tests for expertise decay and helpful/not-helpful recommendation effects.
- Updated Tier 2 trackers and Rank 8 `9-G` status notes so source-of-truth docs no longer misleadingly show all work as TODO.

## Validation completed here

```text
Tier 2 source + scoring behavior checks: 15 passed, 0 failed, 0 skipped
JavaScript syntax checks for modified non-JSX modules: passed
ZIP/package audit: pending final packaging step
```

## Still required before merge
1. Run `npx prisma generate` and `npx prisma migrate status` against the developer environment.
2. Run `RUN_TIER2_DB_TESTS=1 npm run task10:test:integration` against PostgreSQL. Do not mark 10-F / Rank 8 9-G DONE until it passes.
3. Run ESLint and browser regression locally.
4. Obtain and record explicit team/product sign-off for the dedicated Recommendations page decision required by 11-A.
5. PR + cross-review, with reviewer focus on Expert Discovery SQL RBAC and interaction-data privacy.

See `TIER2_ACCEPTANCE_AUDIT.md` for the complete requirement-by-requirement matrix and manual QA checklist.
