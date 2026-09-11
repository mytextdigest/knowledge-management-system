# Task 9 review fixes

This patch addresses the merge review for the Knowledge Context Engine.

## Closed review items

- Related-document RBAC bypass now uses `isSuperAdmin(role)` only.
- Removed the README link to a missing implementation document.
- Enterprise Chat now queries and displays RBAC-filtered suggested experts.
- Suggested project links can be confirmed or dismissed in one click.
- Expertise scores combine uploader contribution, citation activity, and department-topic membership.
- Related-document generation uses bounded PostgreSQL/pgvector nearest-neighbor queries instead of loading up to 1,000 documents into Node.
- Repository topic assignment reuses the existing clustering helpers and LLM topic naming in `worker/cluster.js`.
- Task 9 tests now cover RBAC guards, project-link authorization/statuses, pgvector usage, clustering reuse, and expertise signals.

## Local validation

```powershell
npm install
npx prisma generate
npm run task9:test
npx eslint src worker scripts/task-9
npm run dev
```

The review-fix patch does not add a new migration.
