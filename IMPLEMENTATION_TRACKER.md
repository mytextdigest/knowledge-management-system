# Enterprise Knowledge Repository — Implementation Tracker

> **For AI agents:** This file is the source of truth for task status. When you complete a task, update the `Status` field to `DONE` and fill in `Completed` date. When you start a task, set it to `IN_PROGRESS`. Add notes under the task if important decisions were made during implementation.
>
> **Reference document:** See `ENTERPRISE_KNOWLEDGE_REPO_PLAN.md` for full task specs, acceptance criteria, and architectural decisions.

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

## Milestone 0 — Spreadsheet Support (Prerequisite)

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `0-A` | Worker: Spreadsheet Ingestion | `DONE` | AI agent | — | 2026-06-08 | 2026-06-08 |
| `0-B` | UI: Spreadsheet File Support | `DONE` | AI agent | `0-A` | 2026-06-08 | 2026-06-08 |

### Task 0-A — Worker: Spreadsheet Ingestion
- **Status:** `DONE`
- **Key files to create/modify:**
  - `worker/extractSpreadsheet.js` (new)
  - `worker/index.js` (modified — route xlsx/csv to new extractor)
  - `prisma/schema.prisma` (add `metadata Json?` to `Chunk`)
  - New migration file
- **Notes:** Uses `xlsx` (SheetJS) to parse `.xlsx`/`.xls`/`.csv`. The extractor returns ready-made chunk records (`{ text, metadata }`) grouped by sheet and bucketed by accumulated character size, repeating column headers in each chunk's text for retrieval context. `processChunkJob` now produces a unified `chunkRecords: [{ text, metadata }]` array for both the spreadsheet path and the existing generic `chunkText()` path (non-spreadsheet docs get `metadata: null`). Migration `20260608031026_add_chunk_metadata` adds `Chunk.metadata JSONB` (applied via `prisma migrate deploy` due to pre-existing drift from `Topic`/`TopicDocument` tables — `migrate dev` would have required a destructive reset).

### Task 0-B — UI: Spreadsheet File Support
- **Status:** `DONE`
- **Key files to modify:**
  - `src/components/documents/FileUpload.jsx` (added `.csv`/`.xlsx`/`.xls` to default accepted types)
  - `src/components/documents/DocumentCard.jsx` (added `Sheet` icon mapping)
  - `src/lib/utils.js` (`getFileIcon` returns `'Sheet'` for spreadsheet extensions)
  - `src/components/layout/Sidebar.jsx` (added Excel/CSV file-type filters)
  - `src/app/(app)/document/page.jsx` — Summary tab (added a "Sheets" breakdown card derived from `chunk.metadata`, shown only for spreadsheet documents)
- **Notes:** Sheet breakdown is derived client-side from `doc.chunks[].metadata` (already included by `GET /api/documents/[id]`) — no new API endpoint needed. Full AI-generated workbook/sheet summaries and cross-sheet chat are left for a later milestone; this only surfaces the structural metadata captured during ingestion.

---

## Milestone 1 — Enterprise Foundation

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `1-A` | Schema: Org + RBAC Data Model | `DONE` | teammate | — | 2026-06-11 | 2026-06-12 |
| `1-B` | pgvector Migration | `DONE` | AI agent | — | 2026-06-13 | 2026-06-13 |
| `1-C` | Org Creation + Invite Flow | `DONE` | AI agent | `1-A` | 2026-06-13 | 2026-06-13 |

### Task 1-A — Schema: Org + RBAC Data Model
- **Status:** `DONE`
- **Key files created/modified:**
  - `prisma/schema.prisma` (new models + extensions to existing)
  - `prisma/migrations/20260611154517_add_org_rbac_schema/migration.sql` (new)
- **New models:** `Organization`, `OrganizationMember`, `OrganizationInvite`, `Department`, `DepartmentMember`
- **Extended models:** `User` (orgMembers, departmentMembers relations), `Project` (scope, orgId, indexes), `Document` (scope, orgId, departmentId, lifecycle, category, indexes). `Chunk.metadata` was already added in Task 0-A.
- **Notes:** The teammate applied the migration directly to the KMS AWS RDS database (timestamp `20260611154517`) without committing the migration file to the repo. The migration file was added to the repo retroactively to bring the migration history in sync (`prisma migrate status` shows "Database schema is up to date"). `migrate dev` is blocked by Django table drift on the shared Render DB; the KMS database is the correct target (`DATABASE_URL` in `.env`).

### Task 1-B — pgvector Migration
- **Status:** `DONE`
- **Key files created/modified:**
  - `prisma/schema.prisma` (added `embeddingVec Unsupported("vector(1536)")? @map("embedding_vec")` alongside existing `embedding Json?`; added `@@index([documentId])` — done by teammate in commit 5f7607c)
  - `prisma/migrations/20260613000000_add_pgvector/migration.sql` (new — enables vector extension, adds `embedding_vec` column, creates document_id index)
  - `worker/index.js` (processEmbeddingJob now writes to both `embedding` JSON and `embedding_vec` vector column via `$executeRaw`)
  - `src/lib/vectorSearch.js` (new — `similaritySearch()` for project-scoped pgvector search; `orgSearch()` for RBAC-filtered org-wide search)
  - `scripts/backfill-embeddings.js` (new — one-time script to populate `embedding_vec` from existing JSON embeddings)
- **Notes:** Both `embedding Json?` and `embeddingVec vector(1536)?` are kept on the Chunk model. Existing chat routes continue reading from `embedding`; new vector search uses `embedding_vec`. The `<=>` (cosine distance) operator is used for ANN search. Run `node scripts/backfill-embeddings.js` once after applying the migration to backfill existing chunks.

### Task 1-C — Org Creation + Invite Flow
- **Status:** `DONE`
- **Key files created/modified:**
  - `src/app/api/org/route.js` (new — GET list orgs, POST create org + auto super_admin)
  - `src/app/api/org/[orgId]/settings/route.js` (new — GET org info, PATCH name/API key; super_admin only)
  - `src/app/api/org/[orgId]/members/route.js` (new — GET member list; all org members)
  - `src/app/api/org/[orgId]/invite/route.js` (new — POST send invite email with token; super_admin only)
  - `src/app/api/org/invite/[token]/route.js` (new — GET public token validation)
  - `src/app/api/org/invite/[token]/accept/route.js` (new — POST create member record, mark invite accepted)
  - `src/components/layout/Header.jsx` (modified — workspace switcher dropdown: Personal + orgs + Create Org)
  - `src/components/org/CreateOrgModal.jsx` (new — modal for org creation)
  - `src/app/(app)/org/[orgId]/settings/page.jsx` (new — General/Members/API Key tabs; invite form)
  - `src/app/org/invite/[token]/page.jsx` (new — invite acceptance page, outside (app) group to skip API-key guard)
- **Notes:** Workspace switcher placed in `Header.jsx` (global, all pages) rather than the document-filter `Sidebar.jsx`. The invite page lives outside `(app)/` to allow new members who haven't set up a personal OpenAI key to accept invitations. Invite tokens expire in 7 days; email sent via existing nodemailer transporter. `NEXT_PUBLIC_APP_URL` env var controls the base URL in invite emails (falls back to `NEXTAUTH_URL` then `localhost:3000`).

---

## Milestone 2 — Repository Core

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `2-A` | Repository API Layer | `DONE` | AI agent | `1-A` | 2026-06-13 | 2026-06-13 |
| `2-B` | Department Management | `TODO` | — | `1-A`, `1-C` | — | — |
| `2-C` | Repository UI | `TODO` | — | `2-A` | — | — |

### Task 2-A — Repository API Layer
- **Status:** `DONE`
- **Key files created/modified:**
  - `src/lib/orgGuard.js` (new — `resolveOrgRole(email, orgId)`, `isSuperAdmin()`, `isOrgAdmin()` helpers)
  - `src/app/api/org/[orgId]/repository/route.js` (new — GET with dept/category/lifecycle/fileType/date/page filters; RBAC in WHERE; draft hidden from non-admins)
  - `src/app/api/documents/[id]/lifecycle/route.js` (new — PATCH; enforces valid transition table; super_admin or dept_admin only)
  - `src/app/api/projects/[id]/scope/route.js` (new — PATCH; super_admin only; sets scope=org + orgId)
  - `src/app/api/documents/ingest/route.js` (extended — accepts scope, orgId, departmentId, category; projectId optional for repository scope; org membership verified; orgId forwarded in SQS message)
  - `src/app/api/org/[orgId]/settings/route.js` (refactored to use shared resolveOrgRole)
  - `src/app/api/org/[orgId]/members/route.js` (refactored to use shared resolveOrgRole)
  - `src/app/api/org/[orgId]/invite/route.js` (refactored to use shared resolveOrgRole)
- **Notes:** Lifecycle endpoint only applies to `scope=repository` documents. Repository listing merges Source A (scope=repository, orgId match, dept RBAC) and Source B (docs from org-scoped projects) using a single `AND [{ OR: [A, B] }, ...filters]` Prisma query. Lifecycle transition table mirrors the diagram in ARCHITECTURE_DECISIONS.md; `archived → published` is included as a restore path for super_admin.

### Task 2-B — Department Management
- **Status:** `TODO`
- **Key files to create/modify:**
  - `src/app/api/org/[orgId]/departments/route.js` (new)
  - `src/app/api/org/[orgId]/departments/[deptId]/members/route.js` (new)
  - `src/app/(app)/org/[orgId]/settings/page.jsx` (add departments tab)
- **Notes:** —

### Task 2-C — Repository UI
- **Status:** `TODO`
- **Key files to create/modify:**
  - `src/app/(app)/org/[orgId]/repository/page.jsx` (new)
  - `src/components/repository/RepositoryDocumentCard.jsx` (new)
  - `src/components/repository/RepositoryFilters.jsx` (new)
  - `src/components/repository/UploadToRepositoryModal.jsx` (new)
  - `src/components/layout/Sidebar.jsx` (org nav items)
  - `src/app/(app)/project/page.jsx` (add promote-to-org toggle)
- **Notes:** —

---

## Milestone 3 — Enterprise AI

| Task ID | Title | Status | Assignee | Depends On | Started | Completed |
|---------|-------|--------|----------|------------|---------|-----------|
| `3-A` | Org-Wide Semantic Search | `TODO` | — | `1-B`, `2-A` | — | — |
| `3-B` | Enterprise Chat | `TODO` | — | `3-A` | — | — |

### Task 3-A — Org-Wide Semantic Search
- **Status:** `TODO`
- **Key files to create/modify:**
  - `src/lib/vectorSearch.js` (extend with `orgSearch()`)
  - Existing search API route (add `scope=org` mode)
- **Notes:** —

### Task 3-B — Enterprise Chat
- **Status:** `TODO`
- **Key files to create/modify:**
  - `prisma/schema.prisma` (add `OrgConversation`, `OrgMessage`)
  - New migration file
  - `src/app/api/org/[orgId]/chat/route.js` (new — streaming RAG)
  - `src/app/(app)/org/[orgId]/chat/page.jsx` (new)
  - `src/components/chat/` (extend or create org chat variant)
- **Notes:** —

---

## Architectural Decisions Log

> Do not change these without updating `ENTERPRISE_KNOWLEDGE_REPO_PLAN.md` as well.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Inference cost | Org pays (org-level OpenAI API key on `Organization` model) | Enterprise accounts manage their own key |
| Org creation | Any authenticated user can create an org (creator = super_admin) | Slack-model, self-serve |
| Project scope | Projects promotable to org-scope via toggle | Avoids data duplication |
| Org switching UI | Sidebar workspace switcher | Familiar pattern, URL-based (`/org/[orgId]/...`) |
| Document entity | Unified — scope field on existing `Document` model | Single pipeline, no duplication |
| Vector storage | pgvector on existing Postgres | No new infra, handles org-wide scale |
| Spreadsheet timing | Prerequisite (Milestone 0 before org work) | Listed as supported doc type in repo requirements |
