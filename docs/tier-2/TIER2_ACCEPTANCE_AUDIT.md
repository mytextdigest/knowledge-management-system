# Tier 2 Acceptance Audit — Expert Discovery + Knowledge Recommendation Engine

Date: 2026-09-06

This audit was performed against the supplied Tier 2 requirements and implementation trackers for Rank 9 / Expert Discovery (Sandeep) and Rank 10 / Knowledge Recommendation Engine (Simran), using the latest KMS base supplied for this phase.

## Executive result

The code paths required by Tasks 10-A–10-G and 11-B–11-G are implemented. The review hardening in this audited build also closes four gaps that could otherwise trigger PR comments:

1. Recommendation impressions are no longer counted as expertise activity; only `view`/`download` signals contribute.
2. Expert discovery now prevents a mixed cross-department topic from leaking an expert association from an inaccessible department.
3. Department recommendation/effectiveness aggregation includes both repository documents and org-scoped project documents via the effective project department.
4. Interaction writes independently enforce repository/project access instead of broadly treating every org admin as authorized.

Two items cannot truthfully be marked complete by code alone:

- **10-F / 10-H:** the DB-backed RBAC test exists and has been strengthened, but must be executed against the developer PostgreSQL database before merge. Browser regression is also a local/manual validation step.
- **11-A:** the dedicated Recommendations page is implemented and documented, but the requirements explicitly require team/product confirmation of why `RelatedWorkPanel` was hidden and approval of the replacement placement. That sign-off must be recorded in the PR or tracker.

## Rank 9 — Expert Discovery

| Task | Acceptance check | Implementation evidence | Audit status |
|---|---|---|---|
| 10-A | Add `source`, `confirmedBy`, `lastSignalAt`; additive migration | `prisma/schema.prisma`; `prisma/migrations/20260906000000_add_tier2_expert_recommendation/migration.sql` | Implemented |
| 10-B | Searchable standalone expert directory with name/topic/score/contact | `/org/[orgId]/experts`; `GET /api/org/[orgId]/context/experts`; sidebar entry | Implemented |
| 10-C | Project-scope expertise and scope-specific SQL RBAC | `worker/knowledgeContext.js`; `src/lib/expertDiscoveryQuery.mjs` | Implemented + hardened |
| 10-D | Self confirm/dismiss; dept-admin confirm; manual state survives refresh | `PATCH /api/org/[orgId]/context/experts/[topicId]`; refresh preserves non-inferred source | Implemented |
| 10-E | Recency-weighted score; stale heavy contributor can be outranked | `src/lib/expertiseScoringPolicy.mjs`; 90-day half-life; logic test | Implemented + behavior-tested |
| 10-F | Real DB-backed cross-department RBAC regression | `scripts/task-10/expert-rbac.integration.test.mjs` now tests a shared topic spanning allowed + forbidden departments | Implemented; DB execution pending |
| 10-G | “People who know this” on document page | document GET enriches `experts`; `document/page.jsx` renders mailto links | Implemented |
| 10-H | Full regression/no latency/no chat regression | scoring remains worker-side; static/logic checks pass | Local DB/browser validation pending |
| 10-I | PR + cross-review | branch/PR workflow | Pending PR/review |

### Expert Discovery RBAC hardening

The original Tier 2 draft filtered the joined topic document but could still expose a global `TopicExpertise` association when the same repository topic contained documents from multiple departments. The audited query requires both:

- the viewer can access the joined topic document/project, and
- the expert association is connected to that accessible department/project (or the expert is an org super admin).

The DB integration test now seeds the exact mixed-topic leak case.

## Rank 10 — Knowledge Recommendation Engine

| Task | Acceptance check | Implementation evidence | Audit status |
|---|---|---|---|
| 11-A | Visible recommendation surface + documented placement rationale | `/org/[orgId]/recommendations`; sidebar entry; tracker/handoff notes | Implemented; sign-off confirmed 2026-09-09 (see below) |
| 11-B | `DocumentInteraction` model + required indexes | schema + shared Tier 2 migration | Implemented |
| 11-C | Best-effort view write with no blocking view latency and RBAC | document page uses un-awaited `fetch(...keepalive)`; interaction POST independently checks access | Implemented + hardened |
| 11-D | Helpful boosts / not-helpful suppresses | requesting-user `OrgMessage.feedback`; `recommendationRankingPolicy.mjs`; behavior test | Implemented + behavior-tested |
| 11-E | Existing `DocumentRelationship` graph used for recent activity | `relatedInteractionCandidates()` reuses `expandWithRelatedDocuments()` | Implemented |
| 11-F | Dept-admin department-wide trending distinct from personal feed | recommendation route `mode=department`; UI personal/department switch; project-aware aggregate | Implemented + hardened |
| 11-G | Narrow aggregate effectiveness summary | effectiveness route + impressions/engagements/zero-click + top docs UI | Implemented + hardened |
| 11-H | ORG key handling/privacy/no regression | 400 `ORG_OPENAI_KEY_MISSING`; aggregate-only admin reporting; source/logic tests | Local DB/browser validation pending |
| 11-I | PR + cross-review | branch/PR workflow | Pending PR/review |

## Automated validation in this audited package

Run:

```powershell
npm run task10:test
npm run task11:test
```

The equivalent combined source/logic run in the audit environment reports:

```text
15 passed
0 failed
0 skipped
```

These include behavior checks proving:

- a 365-day-old heavy expertise contributor falls below a recent contributor under the fixed 90-day half-life;
- `not_helpful` reduces the recommendation score while `helpful` increases it;
- feedback accumulation is bounded;
- recommendation impressions are excluded from expertise signals;
- department recommendation/effectiveness SQL accounts for project departments;
- the interaction route does not use the broad `isOrgAdmin` shortcut.

## Required local pre-merge validation

```powershell
npx prisma generate
npx prisma migrate status

npm run task10:test
npm run task11:test

$env:RUN_TIER2_DB_TESTS="1"
npm run task10:test:integration
Remove-Item Env:RUN_TIER2_DB_TESTS

npx eslint src worker scripts/task-10 scripts/task-11
npm run dev
```

Manual browser checks should cover:

1. employee can search Experts and sees only accessible department/project expertise;
2. cross-department employee cannot discover the hidden expert through a shared topic;
3. self Confirm/Dismiss survives a worker refresh;
4. dept admin can Confirm SME only in a managed department;
5. document detail renders People who know this without breaking Decisions/Related Documents;
6. viewing a document writes a `view` interaction without delaying page rendering;
7. a not-helpful cited document is scored lower on the next personal recommendation call;
8. relationship-derived recommendations appear after a viewed document has a graph neighbor;
9. dept admin sees department aggregate mode and only manageable department data;
10. effectiveness shows impressions, engagements, zero-click count, and most-recommended documents;
11. missing org OpenAI key still returns `ORG_OPENAI_KEY_MISSING` as HTTP 400 when embedding-backed recommendations are required;
12. existing Enterprise Chat Suggested people to ask still works.

## External sign-off required for 11-A

Record one explicit decision in the PR before merge, for example:

> Confirmed: keep `RelatedWorkPanel` off the department/project listing pages to avoid duplicating the semantic-search experience introduced in `80d3657`. Use the dedicated, sidebar-reachable `/org/[orgId]/recommendations` page as the v1 recommendation surface.

Until an authorized team/product owner confirms that decision, 11-A remains `BLOCKED` by the requirements even though the replacement UI is implemented.

## Update — 2026-09-09

Johurul confirmed the decision above: `/org/[orgId]/recommendations` is the v1 recommendation surface, `RelatedWorkPanel` stays off the department page. `11-A` is now `DONE` in the tracker. The now-dead `RelatedWorkPanel.jsx` component and its commented-out import/usage in `department/[deptId]/page.jsx` were removed rather than left unmounted, since the placement decision is final rather than provisional.
