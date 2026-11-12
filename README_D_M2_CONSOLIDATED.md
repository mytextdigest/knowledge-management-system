# Simran D-M2 consolidated D-6 / D-7 package

Applies ONLY to `feature/ekp-ws-d` in its separate worktree. The existing D-M2 review files are included in this consolidated package; extraction overwrites those same D-M2 files. The integration script modifies only the F3 registry and D5 analytics navigation after checking expected anchors, and creates .bak files. No DB writes, migrations, commits or pushes are performed by extraction or script.

1. Expand ZIP to `C:\Users\sande\Downloads\kms-simran-d-m2`.
2. `& .\Apply-D-M2-Integration.ps1`
3. `node --test scripts/ekp/p2/d6-d7-usage.test.mjs scripts/ekp/p2/d6-d7-orchestration.test.mjs`
4. `node --check src/lib/jobs/registry.js`
5. `npx prisma validate`
6. `npx eslint src/lib/analytics src/lib/jobs/registry.js "src/app/api/org/[orgId]/analytics/usage" "src/app/(app)/org/[orgId]/analytics/usage" "src/app/(app)/org/[orgId]/analytics/page.jsx"`
7. `git diff --check`

D-6 F3 scheduled job `analytics.usage-daily` is created lazily as disabled by existing `ensureOrgJobs`. Enable only after approved database testing. D-7 Usage dashboard accessible from Search Analytics. Daily rollup persists metrics in AnalyticsDaily, but D-7 currently uses scoped SearchEvent queries for accurate role filtering, unique-user counts and top queries. Thus dashboard performance at production scale remains unverified. Raw queries currently have no hard page cap and should not be enabled for high-volume production without query limits/preaggregation. Bounce rate is explicitly no-click proxy, not a session-based bounce rate. No tenant or DB integration tests performed. No schema changes.

The provided source snapshot is Nov 4 and D5 patch Nov 5, not an exact copy of Simran's current branch. The guarded script refuses to patch unexpected registry/page anchors. Do not overwrite locally edited registry/page with older snapshots.
