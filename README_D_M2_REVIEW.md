# Simran D-M2 review patch (D-6 / D-7)

This patch was developed against the previously supplied KMS Phase 2 source/schema and D-5 dashboard patch. It is **not** a claim of a live integrated release.

Files:
- src/lib/analytics/usageMetrics.mjs: deterministic metrics and CSV.
- src/lib/analytics/rollup.mjs: idempotent UTC daily AnalyticsDaily upsert function.
- src/app/api/org/[orgId]/analytics/usage/route.js: authenticated scoped usage API and CSV.
- src/app/(app)/org/[orgId]/analytics/usage/page.jsx: separate Usage page at /org/:orgId/analytics/usage.
- scripts/ekp/p2/d6-d7-usage.test.mjs: hand-computed fixture tests.

Safety: Do not extract this patch into Sandeep's uncommitted C branch. Stage/apply only on Simran's dedicated branch after safely preserving C. No migrations, scheduler changes, or database writes are performed by the patch itself.

Local validation: node --test scripts/ekp/p2/d6-d7-usage.test.mjs; npx eslint src/lib/analytics src/app/api/org/[orgId]/analytics/usage src/app/(app)/org/[orgId]/analytics/usage; npx prisma validate.

**Outstanding D-M2 work:** wire rollupUsageDay into the real F3 job registry/scheduler and authenticated run-now control, add organization/department rollup orchestration and date backfill, prove PostgreSQL upserts, inspect performance on realistic volume, link Usage tab from D-5 existing page, run integrated RBAC tests. Current UI reads scoped SearchEvent data, not AnalyticsDaily, so it is not yet the intended pre-aggregated production dashboard. Role filter is supported through raw events; AnalyticsDaily schema cannot uniquely store role dimension. Current metrics use per-event click/no-click bounce proxy (not time-based session bounce). No synthetic NGI fixture loaded to DB.
