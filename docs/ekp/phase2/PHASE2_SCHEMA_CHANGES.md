# EKP Phase 2: Schema Changes

|                 |                                                                                         |
| --------------- | --------------------------------------------------------------------------------------- |
| **Covers**      | Workstreams C (Sandeep), D (Simran), E (Johurul)                                         |
| **Created**     | 2026-10-29, checked against `prisma/schema.prisma` on `dev` at `fb1397b` and a read-only `prisma migrate diff` against the shared database |
| **Status**      | **Implemented (`P2-1`, 2026-10-29).** Everything in §4–§6 is in `prisma/schema.prisma` and one migration, `20261029070816_ekp_p2_schema`. Changes after this go through §8. |
| **Precedence**  | Where this document and a workstream document differ on fields, **this document wins**. §7 lists the differences. |

**Related:** [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md) (branches, schema PR order) · [WS_C_TAXONOMY_SEMANTIC_LAYER.md](WS_C_TAXONOMY_SEMANTIC_LAYER.md) · [WS_D_ANALYTICS_DASHBOARDS.md](WS_D_ANALYTICS_DASHBOARDS.md) · [WS_E_CONTENT_COVERAGE.md](WS_E_CONTENT_COVERAGE.md) · database rules in [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md) §4.3.

## 1. Summary

| | C (Sandeep) | D (Simran) | E (Johurul) | Total |
| --- | --- | --- | --- | --- |
| New models | 8 | 5 | 4 | **17** |
| Existing models changed | `Organization`, `User` (back-relations), `Document` (back-relations) | `Document` (+1 field), `KnowledgeGap` (+1), `OrgMessage` (back-relation) | `Document` (+7 fields), `SyncRun` (+1) | 6 |
| Schema PRs | in `P2-1` | in `P2-1` | in `P2-1` | **1** (`P2-1`) + the `P2-0` baseline fix |
| Data back-fills (scripts, not SQL) | Default Category term set + `DocumentTerm` from `Document.category` | `Document.contentUpdatedAt` | — | 2 |
| Settings only (no migration) | 3 keys | 4 keys | 3 keys | 10 |

Every change is **additive** (new tables, new nullable or defaulted columns). Nothing existing is renamed or dropped in Phase 2, so the deployed app keeps working between a schema PR and the code that uses it.

**Implemented (2026-10-29, `P2-1`):** the Prisma blocks below are in `schema.prisma` as written. `prisma validate` passes. `20261029070816_ekp_p2_schema` was generated with `npm run ekp:migration:diff` against the shared database: 17 `CREATE TABLE`, `ADD COLUMN` on `Document` (8), `KnowledgeGap` (1) and `SyncRun` (1), foreign keys and indexes, no `DROP` and no change to an existing column.

**Why one migration instead of four:** with the four staggered schema PRs (E → C → D → E part 2), each owner had to merge the previous one, regenerate, and deploy in order, and any slip or parallel branch meant migration conflicts on the shared database. All of it is additive and unused until code reads it, so landing it once lets C, D and E build in parallel from day one with no schema PR in their milestones.

## 2. Read this first: two problems that affect every Phase 2 migration

A read-only `prisma migrate diff --from-url <shared db> --to-schema-datamodel prisma/schema.prisma --script` on `dev` today (`migrate status` says "up to date") produces:

```sql
DROP INDEX "public"."Chunk_embedding_vec_idx";
DROP INDEX "public"."WorkflowDefinition_orgId_kind_active_idx";
```

Both indexes exist in the database (created by migrations) but aren't declared in `schema.prisma`. **Every migration generated with `migrate diff` will include these two `DROP INDEX` lines** unless they are removed. Applying them would silently drop the vector search index (chat and search get much slower) and a WorkflowDefinition index.

| Index | Created by | Fix |
| --- | --- | --- |
| `WorkflowDefinition_orgId_kind_active_idx` | `20261020190000_ekp_b17_decommission_workflows` | **Fixed (`P2-0`, 2026-10-29):** `@@index([orgId, kind, active])` is now declared on `WorkflowDefinition` in `schema.prisma`. No migration folder: the database and migration history already have it. Verified: the read-only diff no longer shows this line. |
| `Chunk_embedding_vec_idx` (ivfflat on `vector(1536)`) | `20260617000000_add_chunk_embedding_vec_index` | Prisma can't declare an ivfflat index on an `Unsupported` column, so this can't be fixed in the schema. **Fixed in tooling (`P2-0`):** generate migrations with `npm run ekp:migration:diff` (`scripts/ekp/migration-diff.mjs`), which strips this one known line. |

**Migration checksums.** `migrate dev` refuses to continue (and offers a reset) when a migration file no longer matches the checksum recorded when it was applied. On 2026-10-29, four files on `dev` didn't match the shared database:

| Migration | Cause | Fix |
| --- | --- | --- |
| `20261016000000_ekp_user_identity_sso_config` | Trailing newline lost after it was applied | **Fixed in `P2-0`:** newline restored (same as commit `f71d813` on `feature/ekp-ws-a`, which never reached `dev`). Checksum verified. |
| `20261021000000_ekp_scheduled_jobs` | Same | Same |
| `20261021000200_ekp_document_acl_and_source_fields` | Same | Same |
| `20260824004832_add_invite_declined_at` | The file differs from what was applied on 2026-08-24, but the database matches it exactly (`OrganizationInvite.declinedAt`, `TIMESTAMP(3)`, nullable) | **Fixed 2026-10-29 (approved by Johurul):** that row's `checksum` in `_prisma_migrations` set to the file's sha256 (`a93a2e03…b7b59996`), guarded on the old value. The file couldn't be changed back, because the applied version isn't recoverable. |

After these fixes, all 57 applied migrations match their files, `migrate status` is "up to date", and `npm run ekp:migration:diff -- --check` reports no changes. The newline fix only reaches the team once `P2-0` is merged to `dev`.

**`npm run ekp:migration:diff`** (read-only against the database, never applies anything):
- `npm run ekp:migration:diff -- --check` prints the pending SQL and writes nothing. On `dev` today it prints "No schema changes".
- `npm run ekp:migration:diff -- --name <snake_case_name>` writes `prisma/migrations/<timestamp>_<name>/migration.sql`.
- It reads `DATABASE_URL` from `.env` and ignores any stray copy in the shell.
- It **refuses to write** (exit 1, prints the statements) if the SQL drops, truncates or alters an existing column. Phase 2 changes are additive, so that always means drift or a mistake; stop and ask in the channel.
- Tested 2026-10-29: `dev` schema → no changes; the full Phase 2 proposal (§4–§6) → 17 `CREATE TABLE`, no `DROP`; a schema with one column removed → refused.
- If a new raw-SQL index is ever added (like the vector index), add its name to `UNDECLARABLE_INDEXES` in the script in the same PR.

## 3. Conventions for the new models

- Same style as Workstream A's models (`DocumentAcl`, `ScheduledJob`, `SyncRun`): camelCase in Prisma, **snake_case columns via `@map`**, `createdAt`/`updatedAt` mapped to `created_at`/`updated_at`, `cuid()` ids.
- Every new org-scoped model has `orgId` with `onDelete: Cascade` to `Organization`.
- Rows that hang off a document use `onDelete: Cascade` to `Document` (purge removes them), except analytics rows, which use `SetNull` so history survives a purge.
- Prisma needs the back-relation on the other model. Each section lists the back-relations to add to `Organization`, `User` and `Document`.
- **Nullable columns in unique keys:** Postgres treats NULLs as distinct, so `@@unique([a, b])` with a nullable `b` doesn't stop duplicates. The designs below avoid nullable columns in unique keys, or say where the app must enforce uniqueness.
- **Case-insensitive lookups:** Prisma can't declare an index on `lower(label)`. Store a `normalized*` column (lower-case, trimmed, single spaces) and index that.
- **Data back-fills run as idempotent scripts** (`scripts/ekp/p2/*.mjs`) after `migrate deploy`, not as SQL in the migration. SQL can't generate `cuid()` ids, and a script can be re-run safely.
- Migration folder names: `<timestamp>_ekp_p2_<ws>_<name>`, e.g. `20261110120000_ekp_p2_c_term_notes` (the helper adds the timestamp).

## 4. Workstream C: taxonomy (in `P2-1`; was `C-2`)

### 4.1 Models

```prisma
model TermSet {
  id             String    @id @default(cuid())
  orgId          String    @map("org_id")
  name           String
  description    String?
  source         String    @default("local") // "local" | "external"
  readOnly       Boolean   @default(false) @map("read_only") // true while an external tool is master (E16.4)
  externalId     String?   @map("external_id") // SKOS ConceptScheme URI or term-store set GUID
  importFormat   String?   @map("import_format") // "skos_ttl" | "skos_rdfxml" | "csv" | "termstore"
  lastImportedAt DateTime? @map("last_imported_at")
  createdById    String?   @map("created_by_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization      @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdBy    User?             @relation("TermSetCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  terms        Term[]
  fields       MetadataField[]
  imports      TaxonomyImport[]

  @@unique([orgId, name])
  @@index([orgId, source])
}

model Term {
  id              String    @id @default(cuid())
  termSetId       String    @map("term_set_id")
  parentId        String?   @map("parent_id")
  label           String
  normalizedLabel String    @map("normalized_label")
  description     String?
  status          String    @default("active") // "active" | "deprecated"
  mergedIntoId    String?   @map("merged_into_id")
  // Materialized ancestry (root first). Subtree and facet roll-up: ancestor_ids @> ARRAY[termId].
  ancestorIds     String[]  @default([]) @map("ancestor_ids")
  depth           Int       @default(0)
  sortOrder       Int       @default(0) @map("sort_order")
  externalId      String?   @map("external_id") // SKOS concept URI
  termStoreGuid   String?   @map("term_store_guid") // SharePoint term-store GUID (joins DocumentSourceTag)
  // Candidate shortlist for classification (C-10). ~2,600 rows: no ANN index needed.
  embeddingVec    Unsupported("vector(1536)")? @map("embedding_vec")
  embeddedAt      DateTime? @map("embedded_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  termSet       TermSet        @relation(fields: [termSetId], references: [id], onDelete: Cascade)
  parent        Term?          @relation("TermHierarchy", fields: [parentId], references: [id], onDelete: Restrict)
  children      Term[]         @relation("TermHierarchy")
  mergedInto    Term?          @relation("TermMerge", fields: [mergedIntoId], references: [id], onDelete: SetNull)
  mergedFrom    Term[]         @relation("TermMerge")
  synonyms      TermSynonym[]
  relationsFrom TermRelation[] @relation("TermRelationFrom")
  relationsTo   TermRelation[] @relation("TermRelationTo")
  documentTerms DocumentTerm[]

  @@unique([termSetId, externalId]) // NULL externalId (local terms) is allowed many times
  @@index([termSetId, parentId])
  @@index([termSetId, normalizedLabel])
  @@index([ancestorIds], type: Gin)
  @@index([termStoreGuid])
  @@index([status])
}

model TermSynonym {
  id              String @id @default(cuid())
  termId          String @map("term_id")
  label           String
  normalizedLabel String @map("normalized_label")
  kind            String @default("alt") // "alt" | "hidden" (SKOS altLabel / hiddenLabel)

  term Term @relation(fields: [termId], references: [id], onDelete: Cascade)

  @@unique([termId, normalizedLabel])
  @@index([normalizedLabel])
}

model TermRelation {
  id         String @id @default(cuid())
  fromTermId String @map("from_term_id")
  toTermId   String @map("to_term_id")
  kind       String @default("related") // SKOS related (E3.3)

  from Term @relation("TermRelationFrom", fields: [fromTermId], references: [id], onDelete: Cascade)
  to   Term @relation("TermRelationTo", fields: [toTermId], references: [id], onDelete: Cascade)

  @@unique([fromTermId, toTermId, kind])
  @@index([toTermId])
}

model MetadataField {
  id         String   @id @default(cuid())
  orgId      String   @map("org_id")
  key        String   // stable key, e.g. "category", "asset_type"
  name       String   // display name
  termSetId  String   @map("term_set_id")
  multi      Boolean  @default(false)
  required   Boolean  @default(false) // see decision SQ-3
  facet      Boolean  @default(false) // E4.4
  facetOrder Int      @default(0) @map("facet_order")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  organization  Organization   @relation(fields: [orgId], references: [id], onDelete: Cascade)
  termSet       TermSet        @relation(fields: [termSetId], references: [id], onDelete: Restrict)
  documentTerms DocumentTerm[]

  @@unique([orgId, key])
  @@index([orgId, facet])
}

model DocumentTerm {
  id           String    @id @default(cuid())
  documentId   String    @map("document_id")
  termId       String    @map("term_id")
  fieldId      String    @map("field_id") // required: keeps the unique key NULL-free
  source       String    // "manual" | "auto" | "source_system" | "import"
  status       String    @default("accepted") // "suggested" | "accepted"
  confidence   Float?
  createdById  String?   @map("created_by_id")
  acceptedById String?   @map("accepted_by_id")
  acceptedAt   DateTime? @map("accepted_at")
  createdAt    DateTime  @default(now()) @map("created_at")

  document   Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)
  term       Term          @relation(fields: [termId], references: [id], onDelete: Restrict)
  field      MetadataField @relation(fields: [fieldId], references: [id], onDelete: Restrict)
  createdBy  User?         @relation("DocumentTermCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  acceptedBy User?         @relation("DocumentTermAcceptedBy", fields: [acceptedById], references: [id], onDelete: SetNull)

  @@unique([documentId, fieldId, termId])
  @@index([termId, status])
  @@index([fieldId, termId])
  @@index([documentId])
}

// E15.6: auto-discovered topics proposed as terms; a reviewer accepts or dismisses.
model TermCandidate {
  id                String    @id @default(cuid())
  orgId             String    @map("org_id")
  topicId           String?   @map("topic_id")
  label             String
  normalizedLabel   String    @map("normalized_label")
  suggestedTermSetId String?  @map("suggested_term_set_id")
  suggestedParentId String?   @map("suggested_parent_id")
  status            String    @default("pending") // "pending" | "accepted" | "dismissed"
  acceptedTermId    String?   @map("accepted_term_id")
  decidedById       String?   @map("decided_by_id")
  decidedAt         DateTime? @map("decided_at")
  createdAt         DateTime  @default(now()) @map("created_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  topic        Topic?       @relation(fields: [topicId], references: [id], onDelete: SetNull)

  @@unique([orgId, normalizedLabel])
  @@index([orgId, status])
}

// E16.3: an import is parsed into a preview (dry run) and applied later.
model TaxonomyImport {
  id          String    @id @default(cuid())
  orgId       String    @map("org_id")
  termSetId   String?   @map("term_set_id") // null until applied for a new set
  format      String    // "skos_ttl" | "skos_rdfxml" | "csv" | "termstore"
  fileKey     String?   @map("file_key") // S3 key of the uploaded file
  status      String    @default("parsing") // "parsing" | "preview" | "applying" | "applied" | "failed" | "discarded"
  summary     Json?     // { added, updated, moved, deprecated, unchanged, errors[] }
  error       String?
  createdById String?   @map("created_by_id")
  createdAt   DateTime  @default(now()) @map("created_at")
  appliedAt   DateTime? @map("applied_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  termSet      TermSet?     @relation(fields: [termSetId], references: [id], onDelete: SetNull)

  @@index([orgId, createdAt])
}
```

**Back-relations to add:**
- `Organization`: `termSets TermSet[]`, `metadataFields MetadataField[]`, `termCandidates TermCandidate[]`, `taxonomyImports TaxonomyImport[]`
- `User`: `termSetsCreated TermSet[] @relation("TermSetCreatedBy")`, `documentTermsCreated DocumentTerm[] @relation("DocumentTermCreatedBy")`, `documentTermsAccepted DocumentTerm[] @relation("DocumentTermAcceptedBy")`
- `Document`: `terms DocumentTerm[]`
- `Topic`: `termCandidates TermCandidate[]`

### 4.2 Why these shapes

| Choice | Reason |
| --- | --- |
| `ancestorIds String[]` with a GIN index, not a `path` string with `LIKE 'a/b%'` | A prefix `LIKE` needs a `text_pattern_ops` index, which Prisma can't declare (it would show as drift, like §2). A GIN index on an array is declarable, and facet roll-ups become `ancestor_ids @> ARRAY[$termId]`. A move rewrites `ancestorIds` for the moved subtree in one transaction (at most a few hundred rows in an 8-level, 2,600-term taxonomy). |
| Both `externalId` (SKOS URI) and `termStoreGuid` on `Term` | NYPA's model lives in Semaphore and is synced into the SharePoint term store (Q&A #177). Imports carry SKOS URIs; tags on SharePoint items carry term-store GUIDs (`DocumentSourceTag`, from E). Storing both lets them meet on one term (open question CQ-1 in WS-C). |
| `parent` with `onDelete: Restrict` | Terms are deprecated or merged, never deleted with children attached (E15.5). |
| `DocumentTerm.term` with `onDelete: Restrict` | A tagged term can't be deleted; merge re-points the tags first. |
| `DocumentTerm.fieldId` required | Keeps the unique key free of NULLs. Every imported term set gets a field created with it (default: same name, not a facet). |
| `embeddingVec` on `Term`, no ANN index | C-10 shortlists candidate terms by similarity. 2,600 rows scan in milliseconds, and an ivfflat index would add a second undeclarable index (§2). Read and written with `$queryRaw`, as `Chunk` is today. |
| Uniqueness of a label under its parent | Not a database constraint: root terms have `parentId = NULL`, which Postgres treats as distinct. The API enforces it (C-4 edge case). |
| `TaxonomyImport` | A 2,600-term import is parsed in the background, previewed as a diff, then applied (E16.3 dry run). The file stays in S3 between preview and apply. |

### 4.3 Back-fill (script `C-3`, after `migrate deploy`)

`scripts/ekp/p2/c3-default-category-termset.mjs`, idempotent, per org:
1. Create term set "Category" (`source: local`) with the 7 values of `CATEGORY_TAXONOMY` (`worker/classify.js`) as root terms, and metadata field `key: "category"`.
2. For every document with `category` set, insert `DocumentTerm` (`source: "auto"`, `status: "accepted"`, `confidence: categoryConfidence`). Skip existing rows.
3. Print counts per org. Verify with a read-only query: documents with a category = Category `DocumentTerm` rows.

`Document.category` stays and is written in parallel during Phase 2 (WS-C assumption CS-3). Two existing features still read it: the repository filters, and `ReviewPolicy.categories` (B's review scoping). Moving them to terms is a later clean-up.

### 4.4 Settings (F5 registry, no migration)

`search.weights` (`{ keyword, vector, term, graph }`, E3.4), `classification.termThreshold` (auto-accept confidence for term tags), `classification.maxCandidateTerms` (shortlist size, default 40).

## 5. Workstream D: analytics (in `P2-1`; was `D-2`)

### 5.1 Models

```prisma
model SearchEvent {
  id              String    @id @default(cuid())
  orgId           String    @map("org_id")
  userId          String?   @map("user_id") // SetNull: aggregates survive a user deletion
  kind            String    // "search" | "repository" | "chat"
  query           String
  normalizedQuery String    @map("normalized_query")
  filters         Json?
  resultCount     Int       @map("result_count")
  answerShown     Boolean   @default(false) @map("answer_shown")
  confidence      String?   // chat: "high" | "medium" | "low" (as OrgMessage.confidence)
  latencyMs       Int?      @map("latency_ms") // proposal performance figures (Q&A #230)
  firstTokenMs    Int?      @map("first_token_ms")
  departmentId    String?   @map("department_id") // searcher's primary department at the time
  role            String?   // searcher's org role at the time (E29.3)
  previousEventId String?   @map("previous_event_id") // reformulation link (same user, < 60 s)
  orgMessageId    String?   @unique @map("org_message_id") // chat answer, for feedback (E30.2)
  createdAt       DateTime  @default(now()) @map("created_at")

  organization  Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user          User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  previous      SearchEvent?  @relation("SearchReformulation", fields: [previousEventId], references: [id], onDelete: SetNull)
  reformulations SearchEvent[] @relation("SearchReformulation")
  orgMessage    OrgMessage?   @relation(fields: [orgMessageId], references: [id], onDelete: SetNull)
  clicks        SearchClick[]

  @@index([orgId, createdAt])
  @@index([orgId, normalizedQuery])
  @@index([orgId, resultCount, createdAt])
  @@index([userId, createdAt])
}

model SearchClick {
  id            String   @id @default(cuid())
  searchEventId String   @map("search_event_id")
  documentId    String?  @map("document_id") // SetNull: CTR history survives a purge
  rank          Int
  chunkRef      Json?    @map("chunk_ref") // { slide } or { start } from Chunk.metadata (E)
  dwellSeconds  Int?     @map("dwell_seconds") // capped at 1,200 s like DocumentInteraction
  clickedAt     DateTime @default(now()) @map("clicked_at")

  searchEvent SearchEvent @relation(fields: [searchEventId], references: [id], onDelete: Cascade)
  document    Document?   @relation(fields: [documentId], references: [id], onDelete: SetNull)

  @@index([searchEventId])
  @@index([documentId])
}

model AnalyticsDaily {
  id            String   @id @default(cuid())
  orgId         String   @map("org_id")
  date          DateTime @db.Date
  metric        String   // "searches" | "ctr" | "bounce_rate" | "p95_latency_ms" | …
  departmentKey String   @default("all") @map("department_key") // department id or "all"
  sourceSystem  String   @default("all") @map("source_system") // "sharepoint" | "manual" | … | "all"
  value         Float
  dims          Json?    // extra breakdown, e.g. { role: "member" }
  computedAt    DateTime @default(now()) @map("computed_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@unique([orgId, date, metric, departmentKey, sourceSystem])
  @@index([orgId, metric, date])
}

model DocumentLink {
  id            String    @id @default(cuid())
  documentId    String    @map("document_id")
  url           String
  urlHash       String    @map("url_hash") // sha256(url): long URLs don't fit a btree unique key
  status        String    @default("unknown") // "ok" | "broken" | "unknown"
  httpStatus    Int?      @map("http_status")
  checkedAt     DateTime? @map("checked_at")
  firstBrokenAt DateTime? @map("first_broken_at")

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, urlHash])
  @@index([status, checkedAt])
}

// A5: read-only key for the Power BI reporting API. Never stored in clear.
model ReportingApiKey {
  id          String    @id @default(cuid())
  orgId       String    @map("org_id")
  name        String
  keyHash     String    @unique @map("key_hash") // sha256 of the key
  keyPrefix   String    @map("key_prefix") // first 8 chars, shown in the UI
  createdById String?   @map("created_by_id")
  lastUsedAt  DateTime? @map("last_used_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdBy    User?        @relation("ReportingApiKeyCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@index([orgId])
}
```

**Changes to existing models:**

```prisma
model KnowledgeGap {
  // …existing fields…
  queryIds String[] @default([]) @map("query_ids") // SearchEvent ids that produced this gap (E30.4); keep the latest 50
}

model Document {
  // …existing fields…
  // When the content last changed (upload, replace, version restore, source modified).
  // Not @updatedAt: classification, ACL sync and starring also update the row.
  contentUpdatedAt DateTime? @map("content_updated_at")
  searchClicks     SearchClick[]
  links            DocumentLink[]
}

model OrgMessage {
  // …existing fields…
  searchEvent SearchEvent?
}
```

Add `@@index([orgId, contentUpdatedAt])` to `Document`.

**Back-relations to add:** `Organization`: `searchEvents SearchEvent[]`, `analyticsDaily AnalyticsDaily[]`, `reportingApiKeys ReportingApiKey[]`. `User`: `searchEvents SearchEvent[]`, `reportingApiKeysCreated ReportingApiKey[] @relation("ReportingApiKeyCreatedBy")`.

### 5.2 Why these shapes

| Choice | Reason |
| --- | --- |
| `Document.contentUpdatedAt` (new) | E28.1 needs "time since last update", and `Document` has **no `updatedAt`** today. The stale scan (`src/lib/governance/staleScan.js`) uses `createdAt` and the last chat citation. A plain `@updatedAt` would move on every classification write, ACL sync or star, so recency would mean nothing. Set it in the upload, replace (B-8 version), restore and sync paths. |
| `AnalyticsDaily.departmentKey` / `sourceSystem` default `"all"`, not nullable | A nullable column in the unique key lets the roll-up insert duplicates for the "all departments" row (Postgres NULLs are distinct). With `"all"`, the nightly job can `upsert` safely and stay idempotent. No foreign key to `Department`, which is fine for a reporting table. |
| `SearchEvent.userId` and `SearchClick.documentId` nullable with `SetNull` | Usage history survives a user deletion or a document purge (B-9). |
| `SearchEvent.orgMessageId` | Chat answers already store feedback in `OrgMessage.feedback`. Linking the event to its message gives E30.2 answer feedback per query without a new feedback table. `ChatAuditLog` stays as is (the stale scan and gap detection read it). |
| `SearchEvent.departmentId` / `role` copied at search time | Adoption by department and role (E29.3) must reflect who the user was then, not after a move. |
| `DocumentLink.urlHash` | Postgres can't put an arbitrary-length URL in a btree unique index safely. |
| `ReportingApiKey` (not an `OrgSetting`) | The API looks keys up by hash on every request, so it needs its own indexed column, plus revoke and last-used tracking. `OrgSetting` is a key-value blob per org. |
| Indexes on `SearchEvent` | `(orgId, createdAt)` for the roll-up and activity list, `(orgId, normalizedQuery)` for top queries, `(orgId, resultCount, createdAt)` for the no-results list. At about 2,600 users this is thousands of rows a day; dashboards read `AnalyticsDaily`, never scan raw events for long ranges. |

### 5.3 Back-fill (script, after `migrate deploy`)

`scripts/ekp/p2/d2-content-updated-at.mjs`: set `contentUpdatedAt = COALESCE(externalModifiedAt, latest DocumentVersion.createdAt, createdAt)` where it's null. Idempotent. One `UPDATE … FROM` in batches of 1,000.

### 5.4 Settings (F5 registry, no migration)

`analytics.bounceWindowSeconds` (60), `analytics.reformulationWindowSeconds` (60), `analytics.rawRetentionMonths` (13, DQ-2), `links.checkTimeoutSeconds` (10).

## 6. Workstream E: content coverage (in `P2-1`; was `E-2` and `E-13`)

### 6.1 Part 1: SharePoint tags (`A-23`) and media

```prisma
// A-23 / PRS E16.5: managed-metadata values already on the source item (Semaphore tags at NYPA).
// Raw values only; Workstream C maps them to Term rows (C-8) by termGuid = Term.termStoreGuid.
model DocumentSourceTag {
  id               String   @id @default(cuid())
  documentId       String   @map("document_id")
  sourceSystem     String   @default("sharepoint") @map("source_system")
  fieldName        String   @map("field_name") // internal column name
  fieldDisplayName String?  @map("field_display_name")
  label            String
  termGuid         String   @map("term_guid")
  termSetGuid      String?  @map("term_set_guid")
  syncedAt         DateTime @default(now()) @map("synced_at")

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, fieldName, termGuid])
  @@index([termGuid])
}

// Media work per document (audio extraction, transcription, segments). Keeps history,
// retries and cost; the document page shows the latest job's status and progress.
model MediaJob {
  id           String    @id @default(cuid())
  orgId        String    @map("org_id")
  documentId   String    @map("document_id")
  kind         String    // "extract_audio" | "transcribe" | "segment"
  status       String    @default("queued") // "queued" | "running" | "done" | "failed"
  progress     Int       @default(0) // 0–100
  provider     String?   // "openai-whisper" | "azure-openai" (EQ-1)
  audioSeconds Float?    @map("audio_seconds")
  costUsd      Decimal?  @db.Decimal(10, 4) @map("cost_usd")
  attempts     Int       @default(0)
  error        String?
  startedAt    DateTime? @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  createdAt    DateTime  @default(now()) @map("created_at")

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  document     Document     @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId, createdAt])
  @@index([status, createdAt])
}
```

**Changes to existing models:**

```prisma
model Document {
  // …existing fields…
  // E11.5: a transcript points to its recording. Citations on the transcript open the recording.
  transcriptOfId       String?   @map("transcript_of_id")
  transcriptOf         Document? @relation("DocumentTranscript", fields: [transcriptOfId], references: [id], onDelete: SetNull)
  transcripts          Document[] @relation("DocumentTranscript")
  transcriptLinkSource String?   @map("transcript_link_source") // "auto" | "manual": a sync never overwrites "manual"
  durationSeconds      Float?    @map("duration_seconds")
  mediaSegments        Json?     @map("media_segments") // E11.7: [{ title, start, end }]
  sourceTags           DocumentSourceTag[]
  mediaJobs            MediaJob[]

  @@index([transcriptOfId])
}

model SyncRun {
  // …existing fields…
  filesSkipped Int @default(0) @map("files_skipped") // A-24 files above the size limit (deferred from Phase 1)
}
```

**Back-relations to add:** `Organization`: `mediaJobs MediaJob[]`.

### 6.2 Part 2: thumbnails and templates

```prisma
model AssetTemplate {
  id          String   @id @default(cuid())
  orgId       String   @map("org_id")
  name        String   // "How-To Guide", "FAQ", "SOP", "Key Takeaways"
  status      String   @default("active") // "active" | "retired"
  createdById String?  @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  organization Organization           @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdBy    User?                  @relation("AssetTemplateCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  versions     AssetTemplateVersion[]

  @@unique([orgId, name])
}

// E14.4: each saved change is a new immutable version; assets keep the version they were made from.
model AssetTemplateVersion {
  id             String   @id @default(cuid())
  templateId     String   @map("template_id")
  version        Int
  sections       Json     // [{ key, title, guidance, required }]
  requiredFields Json     @default("[]") @map("required_fields") // metadata field keys (E21 / C)
  createdById    String?  @map("created_by_id")
  createdAt      DateTime @default(now()) @map("created_at")

  template  AssetTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  documents Document[]

  @@unique([templateId, version])
}
```

```prisma
model Document {
  // …existing fields…
  thumbnailPath     String?   @map("thumbnail_path") // S3 thumbnails/{docId}.jpg (E13)
  templateVersionId String?   @map("template_version_id")
  templateVersion   AssetTemplateVersion? @relation(fields: [templateVersionId], references: [id], onDelete: Restrict)
  assetData         Json?     @map("asset_data") // E14: { sections: { key: richTextJson } }; Document.content holds the rendered text

  @@index([templateVersionId])
}
```

**Back-relations to add:** `Organization`: `assetTemplates AssetTemplate[]`. `User`: `assetTemplatesCreated AssetTemplate[] @relation("AssetTemplateCreatedBy")`.

### 6.3 Why these shapes

| Choice | Reason |
| --- | --- |
| `MediaJob` table instead of `Document.mediaStatus` / `mediaProgress` | WS-E needs per-job progress, retries, provider, audio minutes and cost (for the proposal's figures, Q&A #230, and for NYPA's provider approval). One row per job keeps that history; two columns on `Document` would keep only the last state and widen an already wide table. |
| `transcriptLinkSource` | A dept_admin can link or unlink a transcript by hand (WS-E §3.4). Without this flag the next sync would undo it. |
| `transcriptOf` with `onDelete: SetNull` | Deleting a recording leaves its transcript searchable on its own. |
| `AssetTemplateVersion` with `onDelete: Restrict` from `Document` | E14.4: changing a template must never change existing assets, so versions are immutable and can't be deleted while an asset uses them. |
| `assetData` Json + `content` text | The editor needs the structured sections; ingestion, search and chunking keep using `Document.content`. |
| `SyncRun.filesSkipped` | The per-run skipped count that WS-A deferred until a migration was allowed (`A-24` note). Non-media files above the size limit are still skipped after E-6. |

### 6.4 Values that change without a migration

| Column | New values |
| --- | --- |
| `Document.contentType` | `"asset"` (E14) |
| `Document.sourceProvider` | `"authored"` (E14) |
| `Chunk.metadata` (Json, exists) | `{ kind: "slide", slide, title, hasNotes }`, `{ kind: "time", start, end, speakers }`, `{ kind: "image", ocr }` (WS-E §3.2) |
| `Document.status` | media documents above the size limit are no longer `skipped_too_large` after E-6; a one-off script re-queues them |

### 6.5 SAML (`A-16`): outside Prisma

- `@boxyhq/saml-jackson` creates its own tables in a separate Postgres schema, `jackson`. They are **not** in `schema.prisma` and get no Prisma migration.
- Prisma only reads the `public` schema here (no `schemas` in the datasource), so `migrate diff` shouldn't report them. **Check this** with the same read-only `migrate diff` right after Jackson's first start, before anyone else generates a migration.
- Jackson runs its own migrations when it starts. Point it at the **direct** (non-pooled) Neon URL, the same as for dumps and migrations; DDL through the pooled URL can fail.
- Tell the team before the first start against the shared database.
- `OrgSsoConfig.protocol` already accepts `"saml"`; no change.

### 6.6 Settings (F5 registry, no migration)

`media.transcription` (`{ enabled: false, provider: "openai-whisper" }`, EQ-1), `media.maxConcurrentJobs` (1), `media.chunkSeconds` (75).

## 7. Differences from the workstream documents

The workstream documents were written before this check. **Their data-model sections were updated to the final fields on 2026-10-29**; the table is kept as a record of what changed from the first draft.

| Doc | Workstream doc says | This document | Why |
| --- | --- | --- | --- |
| WS-C §4.1 | `Term.path` (materialized string) | `Term.ancestorIds String[]` + GIN index | Declarable index; no drift (§4.2) |
| WS-C §4.1 | — | `normalizedLabel` on `Term` and `TermSynonym` | Case-insensitive synonym lookups need an indexed column |
| WS-C §4.1 | — | `Term.embeddingVec`, `embeddedAt` | C-10 candidate shortlist |
| WS-C §4.1 | `DocumentTerm.fieldId` implied optional | Required | NULL-free unique key |
| WS-C | — | New `TermCandidate`, `TaxonomyImport` | E15.6 approvals and E16.3 dry run need state |
| WS-D §4.2 | `AnalyticsDaily.departmentId?`, `sourceSystem?` | `departmentKey`, `sourceSystem` default `"all"` | Idempotent upsert |
| WS-D §4.2 | `DocumentLink` unique on URL | `urlHash` | Long URLs |
| WS-D §4.2 | — | `SearchEvent.role`, `orgMessageId`, `userId` nullable; `SearchClick.documentId` nullable | E29.3, E30.2, history survives deletes |
| WS-D §4.4 | Reporting key "stored hashed" | New `ReportingApiKey` model | Indexed lookup, revoke |
| WS-D | — | `Document.contentUpdatedAt` + back-fill | `Document` has no `updatedAt` (§5.2) |
| WS-E §3.1 | `Document.mediaStatus`, `mediaProgress` | `MediaJob` model | History, retries, cost |
| WS-E §3.1 | — | `Document.transcriptLinkSource` | Manual links survive sync |
| WS-E §3.1 | `AssetTemplate` with `version`; `Document.templateId` + `templateVersion` | `AssetTemplate` + `AssetTemplateVersion`; `Document.templateVersionId` | Immutable versions (E14.4) |
| WS-E §3.1 | — | `Document.assetData`, `SyncRun.filesSkipped` | E14 structured content; A-24 deferred count |

## 8. Order, owners and checks

| # | PR | Owner | Date | Contents | Back-fill after deploy |
| --- | --- | --- | --- | --- | --- |
| 0 | `P2-0` baseline | Johurul | 2026-10-29 | `@@index([orgId, kind, active])` on `WorkflowDefinition` (no migration folder), three migration newline fixes, `npm run ekp:migration:diff` | — |
| 1 | `P2-1` Phase 2 schema | Johurul | 2026-10-29 | §4, §5 and §6 in one migration, `20261029070816_ekp_p2_schema`. Replaces `C-2`, `D-2`, `E-2` and `E-13` | — (see below) |

**Rollout of `P2-1`** (Johurul, before Mon 2 Nov):
1. Push `P2-0` and `P2-1` to `dev`.
2. Announce in the channel, then `unset DATABASE_URL && npx prisma migrate deploy` once against the shared database, then `npx prisma migrate status` shows "up to date" and `npm run ekp:migration:diff -- --check` shows no changes.
3. Everyone: `git pull` on `dev`, merge `dev` into your workstream branch, `npx prisma generate`. No `migrate dev` needed.

**Back-fills stay with the workstream tasks** (idempotent scripts, run once by the owner after their code is ready, not at deploy):
- `C-3` Sandeep: `scripts/ekp/p2/c3-default-category-termset.mjs` (§4.3)
- `D-9` Simran: `scripts/ekp/p2/d2-content-updated-at.mjs` (§5.3), together with setting `contentUpdatedAt` in the upload, replace, restore and sync paths

**If you need a schema change after `P2-1`** (a missed field, an index): keep it small and additive, and follow these steps:

1. `git pull` on `dev`, then merge `dev` into your workstream branch.
2. `unset DATABASE_URL`. Edit `schema.prisma`.
3. Generate the migration with `npm run ekp:migration:diff -- --name <name>` (§2). Don't use a plain `prisma migrate diff`: it adds a `DROP INDEX` for the vector index.
4. Read the generated `migration.sql`: it must contain only your change.
5. Open a **schema-only PR** into `dev` (the `schema.prisma` change + the migration folder, nothing else). The reviewer checks the SQL line by line. Post in the channel so nobody else generates a migration at the same time.
6. After it merges: `npx prisma migrate deploy` once against the shared database (the owner does this, after announcing it), then `npx prisma migrate status` shows "up to date".

**Never** `migrate reset`, never accept a reset prompt from `migrate dev`, never pass the live database as `--shadow-database-url`.

## 9. Decisions needed

| # | Question | Proposed |
| --- | --- | --- |
| SQ-1 | Is the `MediaJob` model (instead of two `Document` columns) agreed? | Yes (§6.3) |
| SQ-2 | Is `Document.contentUpdatedAt`, set only on content changes, agreed? | Yes (§5.2). B's stale scan can switch to it later. |
| SQ-3 | Required metadata lives in two places: B's setting `metadata.requiredFields` (used by the publish gate, `src/lib/governance/publishGate.js`) and C's `MetadataField.required`. Which one is the source of truth? | Keep B's setting as the source of truth in Phase 2; let a rule reference a metadata field key. `MetadataField.required` is in `P2-1` (default `false`); if the team agrees, leave it unused rather than drop it, so no destructive migration is needed. |
| SQ-4 | Do SharePoint tags whose `termGuid` matches no imported term stay raw only, or create a placeholder term? | Raw only, reported in the import summary (CQ-1) |
| SQ-5 | Raw `SearchEvent` retention | 13 months (DQ-2) |
