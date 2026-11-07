# Workstream C: Taxonomy & Semantic Layer (Phase 2)

|                       |                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------- |
| **Owner**             | Sandeep                                                                               |
| **Reviewer**          | Johurul                                                                               |
| **Requirements**      | E15, E16, E3, E4 (+ RFP §6 A1 for term sets)                                          |
| **Foundations used**  | F1 document access, F2 audit, F3 scheduled jobs, F5 org settings, F7 search service (built by D) |
| **Phase 2 window**    | Mon 2 Nov – Tue 24 Nov 2026 (code-complete), integration to Mon 30 Nov                 |
| **Branch**            | `feature/ekp-ws-c` (one branch for the phase, one PR per milestone; see [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md) §3) |
| **Status**            | Draft for review. Shared design + C-M1 ready for review; C-M2 to C-M4 outlined, detail each before it starts. |

**Source documents (don't copy from them, link to them):**

- Requirements and acceptance criteria: [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (§4.1 E3, E4; §4.5 E15, E16)
- Architecture and design: [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§4 F7; §5.3)
- NYPA's answers: `docs/ekp/Copy of Attachment 5 - Q+A format NYPA Response_updated10.22.26.xlsx` (cited "Q&A #n") and the summary [NYPA_RFP_QA_Implications_2026-10-24.pdf](../NYPA_RFP_QA_Implications_2026-10-24.pdf)
- Plan, workflow and status board: [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md) · Phase 2 calendar and shared files: [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md)

## 1. Scope

| Milestone | Covers (PRS FR numbers) | Due | Demo |
| --- | --- | --- | --- |
| **C-M1** Taxonomy exists | E15.1, E15.2, E15.3, E15.7 + default Category term set | **Fri 6 Nov** | An admin builds a 3-level term set with synonyms; existing documents show their category as a term |
| **C-M2** Semaphore import | E16.1, E16.2, E16.3, E16.4, E16.5, E15.5 | **Fri 13 Nov** | A SKOS (TTL) export is imported as a read-only term set; a re-import with changes updates it; a synced SharePoint file shows its existing tags as KMS terms |
| **C-M3** Auto-tagging + ontology search | E15.4, E15.6, E3.1–E3.3 | **Fri 20 Nov** | A new document is auto-tagged from the term set; a synonym search finds a document that contains neither word; the evaluation score improves |
| **C-M4** Facets + tuning | E4.1–E4.4, E3.4 | **Tue 24 Nov** | Narrow search results by a parent term, then a child term; counts are correct and differ for a member and a guest |

**Out of scope for Phase 2:**

- **Direct Semaphore API connector.** NYPA says Semaphore "can be reached by API" (Q&A #177), but we have no instance before award. The importer is built behind an interface so the connector can be added after award. File import (SKOS/CSV) covers E16.2's "must".
- **Tag write-back to SharePoint managed metadata** (E32.6). Nice-to-have, after award.
- **Ontology editing** (relations beyond broader/narrower/related, classes, properties). NYPA has "taken initial steps" towards an ontology (Q&A #207) and expects nothing from the knowledge graph "beyond taxonomy-driven search, navigation, and content discovery" (Q&A #193). Our existing knowledge graph (E17) covers discovery.
- Taxonomy development, metadata mapping and content clean-up as a service. **NYPA does these itself** (Q&A #104, #105). We give them the tools.

## 2. What NYPA told us about taxonomy (Q&A, 22 Oct update)

### 2.1 The facts

| Topic | NYPA's answer | Q&A # |
| --- | --- | --- |
| **Tool** | Progress Semaphore. | 59 |
| **Size** | About **2,600 terms in 8 levels**. | 17, 177 |
| **Where it lives** | The model is managed in Semaphore and **synced into the SharePoint term store**. Semaphore can be reached by API. | 177 |
| **NYPA and Canals** | One enterprise taxonomy that contains both NYPA and Canals concepts, "much more robustly fleshed out for NYPA". | 177 |
| **Classification today** | The Semaphore licence includes **Classification Server** and the SharePoint term-store integration. Semaphore auto-classification runs today across **60 SharePoint Online sites and 200 libraries, about 250,000 items** tagged. | 128 |
| **Export** | The taxonomy can be exported as **SKOS / RDF / TTL** if an alternative tool is selected. The model is "portable". | 113, 222 |
| **Semaphore's future** | Under contract to the end of 2026; continued use is "TBD as a result of this RFP". NYPA says it "could either replace or work with" the existing tool, and asks vendors to "evaluate all taxonomy and ontology management solutions inclusive of Semaphore". NYPA is "open to the best possible solution". | 60, 113, 200, 222 |
| **Build or reuse** | **Leverage and enhance the existing taxonomy**; don't design a new one. NYPA has an existing enterprise taxonomy model and has taken initial steps towards an ontology. | 186, 207 |
| **Standards** | No enterprise-wide standard for the taxonomy tool. | 171 |
| **Who does the taxonomy work** | **NYPA**: taxonomy/ontology development, metadata mapping, content remediation. The KM team is product owner and approves deliverables and machine-generated outputs. | 104, 105, 164 |
| **Existing metadata** | Content stays in place. If knowledge-base content is moved, **its existing metadata must be preserved**. The solution "should allow for metadata enrichment of content". | 194, 223, 234 |
| **Knowledge graph** | NYPA has none today and expects the vendor to build one. Embedded or standalone is fine. No use cases beyond taxonomy-driven search, navigation and discovery for now. | 116, 193, 227 |
| **AI at go-live** | Auto-tagging and metadata generation are wanted "ideally" in the initial phase. Human review of AI output is required but should be light, stricter for critical content. | 195, 224 |
| **Throughput** | Classify large volumes, "e.g. 500 documents in 30 minutes" (a firm minimum, NFR-5). Vendors must state measured performance figures in the proposal. | 65, 230 |
| **Portability** | All data and metadata must be exportable in standard, non-proprietary formats. | 155 |
| **Competition** | At least one other bidder plans to "work with NYPA's Progress Semaphore models and SharePoint term store rather than replace them". | 16 |

### 2.2 What this means for the design

1. **Two modes, one model.** KMS must work **with** Semaphore (Semaphore is master, KMS term sets are read-only copies, E16.4) and also be able to **be** the taxonomy master if NYPA drops Semaphore after 2026 (local, editable term sets, E15). Both are the same `TermSet` model with `source: external | local`. A local set can be created by importing NYPA's SKOS export and then switching it to `local`.
2. **Two identifiers per term.** Semaphore exports SKOS concepts with URIs. The SharePoint term store holds the synced copy with term GUIDs, and the tags on SharePoint items carry those GUIDs. Each `Term` stores both `externalId` (SKOS concept URI) and `termStoreGuid`, so imported terms and SharePoint tags meet on the same term. How the two are matched is open question CQ-1.
3. **Use existing tags before AI.** About 250,000 items already carry Semaphore tags. A SharePoint document that arrives with term-store tags (`A-23`, built by Johurul in E-M1) is tagged from them (`DocumentTerm.source: "source_system"`). Auto-classification only suggests extra terms for it, or tags documents that have none. This is also our answer to the competitor in Q&A #16.
4. **Scale to 2,600 terms and 8 levels.** The tree editor loads children lazily and has search. Classification can't put 2,600 terms in one prompt, so it shortlists candidate terms first (see C-M3).
5. **NYPA configures, we don't curate.** Every taxonomy change is made in admin settings and audit-logged (NFR-2, NFR-3). AI-proposed terms (E15.6) and AI tags stay suggestions until a reviewer accepts them, with one-click and bulk accept to keep review light (Q&A #195).
6. **One taxonomy for NYPA and Canals** (Q&A #177). Don't model per-entity term sets. Departments already scope documents.
7. **Export.** Term sets are exportable as SKOS (TTL) and CSV (NFR-12, Q&A #155). This also proves the "portable" claim in the demo. Stretch for C-M4.

## 3. Working assumptions

| # | Assumption | Why | Cost if wrong |
| --- | --- | --- | --- |
| CS-1 | NYPA can give us a **SKOS TTL or RDF/XML export** after award; before award we test with a synthetic 2,600-term, 8-level SKOS file plus a public SKOS vocabulary | Q&A #113 | None for the importer. Mapping quirks are fixed on the real file. |
| CS-2 | Synced SharePoint tags carry the **term-store GUID**, which we can join to imported terms | Q&A #128, #177 | Fall back to matching by label path (CQ-1). |
| CS-3 | One **default "Category" term set** replaces the hard-coded 7-value `CATEGORY_TAXONOMY` in `worker/classify.js`; `Document.category` is kept and written in parallel during Phase 2 | Existing filters, health panel and classification review read `category` | Removing `category` later is a separate clean-up. |
| CS-4 | **Facets come from metadata fields** (E15.3) chosen by an admin, not from every term set | E4.4 | None. |
| CS-5 | We can test the **SharePoint term store via Graph** in our tenant (`nextgenerationinnovation.onmicrosoft.com`) | Semaphore syncs into it (Q&A #177) | If the app-only permission isn't grantable with `Sites.Selected`, the term-store import stays a spike and file import is the path. |

## 4. Shared design (decided once for the workstream)

### 4.1 Data model (in `P2-1`)

> **Already in the schema (`P2-1`, 2026-10-29).** All Phase 2 models and fields for C, D and E are in `prisma/schema.prisma` and one migration, `20261029070816_ekp_p2_schema`. You don't write a migration for them. Field-level detail and the reasons for each shape: [PHASE2_SCHEMA_CHANGES.md](PHASE2_SCHEMA_CHANGES.md) §4. If you need a change, see that doc's §8.

| Model | Key fields | Notes |
| --- | --- | --- |
| `TermSet` | `orgId`, `name`, `description`, `source` (`local` \| `external`), `readOnly`, `externalId`, `importFormat`, `lastImportedAt`, `createdById` | Unique (`orgId`, `name`). `readOnly` is true while an external tool is master (E16.4) |
| `Term` | `termSetId`, `parentId`, `label`, `normalizedLabel`, `description`, `status` (`active` \| `deprecated`), `mergedIntoId`, `ancestorIds String[]` (root first), `depth`, `sortOrder`, `externalId` (SKOS URI), `termStoreGuid`, `embeddingVec vector(1536)`, `embeddedAt` | Subtree and facet roll-up: `ancestor_ids @> ARRAY[termId]` (GIN index). A move rewrites `ancestorIds` for the subtree in one transaction. `parent` is `Restrict`: deprecate or merge, never delete with children. `embeddingVec` is read/written with `$queryRaw`, no ANN index |
| `TermSynonym` | `termId`, `label`, `normalizedLabel`, `kind` (`alt` \| `hidden`) | SKOS `altLabel` / `hiddenLabel`. Look up by `normalizedLabel` (lower-case, trimmed, single spaces) |
| `TermRelation` | `fromTermId`, `toTermId`, `kind` (`related`) | SKOS `related`, used by E3.3 |
| `MetadataField` | `orgId`, `key`, `name`, `termSetId`, `multi`, `required`, `facet`, `facetOrder` | Unique (`orgId`, `key`). E15.3, E4.4. Whether `required` or B's `metadata.requiredFields` setting drives the publish gate is open (schema doc SQ-3) |
| `DocumentTerm` | `documentId`, `termId`, `fieldId` (required), `source` (`manual` \| `auto` \| `source_system` \| `import`), `status` (`suggested` \| `accepted`), `confidence`, `createdById`, `acceptedById`, `acceptedAt` | Unique (`documentId`, `fieldId`, `termId`). `term` is `Restrict`: merge re-points tags before a term can go |
| `TermCandidate` | `orgId`, `topicId`, `label`, `normalizedLabel`, `suggestedTermSetId`, `suggestedParentId`, `status` (`pending` \| `accepted` \| `dismissed`), `acceptedTermId`, `decidedById`, `decidedAt` | E15.6 approvals. Unique (`orgId`, `normalizedLabel`) |
| `TaxonomyImport` | `orgId`, `termSetId`, `format` (`skos_ttl` \| `skos_rdfxml` \| `csv` \| `termstore`), `fileKey` (S3), `status` (`parsing` → `preview` → `applying` → `applied`, or `failed` / `discarded`), `summary Json`, `error`, `appliedAt` | E16.3 dry run: parse to a preview, apply later |

Unique label under one parent is enforced by the API, not the database (root terms have `parentId = NULL`, and Postgres treats NULLs as distinct).

**Merge and deprecate (E15.5):** merging term X into Y sets `X.status = deprecated`, `X.mergedIntoId = Y` and moves X's `DocumentTerm` rows to Y in one transaction. Deprecating without a target keeps the tags but hides the term from new tagging. Both write `taxonomy.changed` audit events with before/after.

### 4.2 APIs

All under `/api/org/[orgId]/taxonomy/`, org admin for writes (dept_admin read), guests read-only:
`term-sets` (list/create/update/delete), `term-sets/[id]/terms?parentId=` (lazy children), `terms/[id]` (update, move, deprecate, merge), `terms/search?q=` (labels + synonyms), `fields` (metadata fields), `term-sets/[id]/import` (file upload), `term-sets/[id]/export?format=ttl|csv`, `candidates` (E15.6).
Tagging: `/api/documents/[id]/terms` (list, add, remove, accept suggestion), using the document's existing edit permission.

### 4.3 Where search changes live

D builds the **F7 search service** (`src/lib/search/searchService.js`) in D-M1. C adds to it from C-M3: `expandQueryWithTerms`, a term boost (`w_term`) in the hybrid score, and `facets` in the response. **C doesn't change `hybridSearch.js` directly before D-M1 merges.** Facet counts and term filters always go through the F1 access predicate (E4.3, NFR-1).

## 5. Milestones

Each milestone ends with a PR from `feature/ekp-ws-c` into `dev`, opened one working day before the due date, and a demo on `dev` at the weekly meeting.

### C-M1 Taxonomy exists (due Fri 6 Nov)

- **Build:** `C-2` schema: already done in `P2-1` (§4.1). `C-3` default Category term set: an idempotent script (`scripts/ekp/p2/c3-default-category-termset.mjs`, schema doc §4.3) seeds the 7 categories per org, backfills `DocumentTerm` from `Document.category`, and `classify.js` dual-writes. `C-4` admin page **Settings → Taxonomy**: term-set list, lazy tree editor (create, nest, rename, reorder, deprecate, merge), synonyms and description per term, tree search; every change audited. `C-5` metadata fields (bound to a term set, single/multi, required) and manual tagging on the document page.
- **Edge cases:** a cycle when moving a term (reject); deleting a term set that has tags (block, offer deprecate); a guest or member calling write APIs (403); duplicate labels under one parent (reject).
- **Demo script:** (1) As org admin, create term set "Asset Type" with 3 levels and synonyms. (2) Merge two terms; a document tagged with the old one now shows the new one. (3) Open an existing document: its category shows as a term. (4) As a member, the editor is read-only.
- **Acceptance:** 3-level term set with synonyms built through the UI; merge re-points tags; all changes appear in the audit log; member and guest can't write.

### C-M2 Semaphore import (due Fri 13 Nov)

- **Build:** `C-6` importers `src/lib/taxonomy/import/{skos,csv}.js` behind one `TaxonomySource` interface: SKOS RDF/XML and TTL (`prefLabel`, `altLabel`, `hiddenLabel`, `broader`/`narrower`, `related`, `definition`, concept schemes), CSV (path or parent column, synonyms column). Creates `TermSet` with `source: external, readOnly: true`. `C-7` re-sync: diff by `externalId`; adds, updates labels, moves, and deprecates removed terms without dropping tags (E16.3); a dry-run summary before applying. `C-8` map `A-23`'s `DocumentSourceTag` rows to terms (by `termStoreGuid`, then label path) into `DocumentTerm` with `source: source_system`; run on import and after each SharePoint sync. `C-9` spike: read the SharePoint term store through Graph in the test tenant.
- **Scale:** a synthetic 2,600-term, 8-level SKOS fixture imports in under a minute and the tree stays responsive.
- **Demo script:** (1) Import the TTL file; show the 8-level tree as read-only. (2) Edit the file (rename a term, remove one, add one) and re-import; show the dry-run diff, then apply; tagged documents keep their tags. (3) In the test tenant, a SharePoint file with a managed-metadata value is synced and shows that term in KMS.
- **Acceptance:** PRS E16 acceptance (SKOS import, re-import with changes, SharePoint item arrives with its terms).

### C-M3 Auto-tagging + ontology search (due Fri 20 Nov)

- **Build:** `C-10` term-set classification in `worker/classify.js` (E15.4): embed term labels + synonyms + descriptions once per import; for each document, shortlist the top ~40 candidate terms by embedding similarity, then the model picks terms and confidences from the shortlist. Thresholds from F5. Below the threshold a tag is `suggested` and goes to review. Documents with `source_system` tags get only suggestions. Topics offered as candidate terms (E15.6, approve → term). `C-11` E3 in F7: match query n-grams to labels and synonyms, expand the keyword query with synonyms and narrower terms, boost documents tagged with matching, broader, narrower or related terms. Offline evaluation set (20–30 queries with expected documents on the NGI org, built with Simran, `D-13`): nDCG@10 with and without ontology signals.
- **Throughput:** 500 documents classified in 30 minutes (NFR-5, Q&A #65). Record the measured figure for the proposal (Q&A #230).
- **Demo script:** (1) Upload a document; it is tagged from the imported term set, with low-confidence tags waiting for review. (2) Search for a synonym that appears in neither the document nor its title: the document is found. (3) Show the evaluation report, with and without ontology.
- **Acceptance:** PRS E15 and E3 acceptance.

### C-M4 Facets + tuning (due Tue 24 Nov)

- **Build:** `C-12` F7 returns `facets: [{ fieldId, buckets: [{ termId, label, count, children }] }]` for admin-selected facet fields; counts roll up through `Term.ancestorIds` (`ancestor_ids @> ARRAY[termId]`) and are computed with the F1 predicate. A shared facet panel on the search page and the repository (expand/collapse, counts, combinable with department, source system, file type, date, lifecycle, owner). `C-13` E3.4 weights (`w_keyword`, `w_vector`, `w_term`, `w_graph`) in F5 settings with a reset-to-default. `C-14` export a term set as SKOS TTL and CSV (stretch).
- **Demo script:** (1) Search "transformer maintenance", pick the parent facet, then a child; counts update. (2) Same search as a guest: the counts are lower and don't reveal restricted documents. (3) Change a facet field's order in settings; the panel follows.
- **Acceptance:** PRS E4 acceptance; E4.3 checked with a member and a guest.

## 6. Open questions

| # | Question | Who decides | Default until decided |
| --- | --- | --- | --- |
| CQ-1 | Do term-store GUIDs equal anything in Semaphore's SKOS export, or do we match synced tags to imported terms by label path? | NYPA after award; test in C-9 | Store both ids; match GUID first, label path second, unmatched tags kept raw and reported |
| CQ-2 | Does the default Category term set stay once NYPA's taxonomy is imported, or is "Category" bound to an imported set? | Team review of C-M1 | Keep it; an admin can rebind the Category field |
| CQ-3 | Should auto-tags on documents that already carry Semaphore tags be suggestions only? | Team review of C-M3 | Yes (§2.2 point 3) |
| CQ-4 | Is `TermStore.Read.All` (app-only) grantable alongside `Sites.Selected` in NYPA's tenant? | NYPA's M365 governance team, after award | File import is the supported path |

## 7. Task tracker

> Source of truth for task status. Set `IN_PROGRESS` and `Started` when you begin, `DONE` and `Completed` when merged to `dev`, in the same PR. Record design changes as dated notes in §8.

| Status | Meaning |
| --- | --- |
| `TODO` | Not started |
| `IN_PROGRESS` | Being worked on |
| `REVIEW` | PR open |
| `DONE` | Merged to `dev` |
| `BLOCKED` | Waiting on a dependency or NYPA |
| `SKIP` | Deferred or out of scope |

| Task ID | Milestone · Title | Status | Assignee | Depends On | PR | Started | Completed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `C-1` | Finalize this document (shared design + C-M1), reviewed by Johurul | `TODO` | Sandeep | — | | | |
| `C-2` | C-M1 · Schema: `TermSet`, `Term`, `TermSynonym`, `TermRelation`, `MetadataField`, `DocumentTerm`, `TermCandidate`, `TaxonomyImport` | `DONE` | Johurul | — | `P2-1` (`20261029070816_ekp_p2_schema`) | 2026-10-29 | 2026-10-29 |
| `C-3` | C-M1 · Default Category term set, backfill `DocumentTerm` from `Document.category`, dual-write in `classify.js` | `TODO` | Sandeep | `C-2` | | | |
| `C-4` | C-M1 · Taxonomy admin: lazy tree editor, synonyms, deprecate/merge, search, audit | `TODO` | Sandeep | `C-2` | | | |
| `C-5` | C-M1 · Metadata fields + manual tagging on the document page | `TODO` | Sandeep | `C-2` | | | |
| `C-M1` | **Milestone PR + demo: Taxonomy exists** (due Fri 6 Nov) | `TODO` | Sandeep | `C-3`–`C-5` | | | |
| `C-6` | C-M2 · SKOS (RDF/XML, TTL) + CSV importers behind `TaxonomySource`; read-only external sets | `TODO` | Sandeep | `C-M1` | | | |
| `C-7` | C-M2 · Re-sync diff by `externalId` with dry run; deprecate removed terms without losing tags | `TODO` | Sandeep | `C-6` | | | |
| `C-8` | C-M2 · Map `A-23` SharePoint tags (`DocumentSourceTag`) to terms, on import and after each sync | `TODO` | Sandeep | `C-6`, `E-3` | | | |
| `C-9` | C-M2 · Spike: SharePoint term store via Graph in the test tenant | `TODO` | Sandeep | `C-6` | | | |
| `C-M2` | **Milestone PR + demo: Semaphore import** (due Fri 13 Nov) | `TODO` | Sandeep | `C-6`–`C-8` | | | |
| `C-10` | C-M3 · Term-set classification with candidate shortlist; suggestions + review; topics as candidate terms; throughput test | `TODO` | Sandeep | `C-M2` | | | |
| `C-11` | C-M3 · E3 query expansion + term boost in F7; evaluation set and nDCG report (with `D-13`) | `TODO` | Sandeep | `C-M2`, `D-3` | | | |
| `C-M3` | **Milestone PR + demo: Auto-tagging + ontology search** (due Fri 20 Nov) | `TODO` | Sandeep | `C-10`, `C-11` | | | |
| `C-12` | C-M4 · Facets in F7 + shared facet panel (search, repository), F1-scoped counts, admin facet fields | `TODO` | Sandeep | `C-M3` | | | |
| `C-13` | C-M4 · Search weights in F5 settings (E3.4) | `TODO` | Sandeep | `C-11` | | | |
| `C-14` | C-M4 · Export term set as SKOS TTL / CSV (stretch) | `TODO` | Sandeep | `C-6` | | | |
| `C-M4` | **Milestone PR + demo: Facets + tuning** (due Tue 24 Nov) | `TODO` | Sandeep | `C-12`, `C-13` | | | |
| `C-15` | Update RTM for E3, E4, E15, E16; join `P2-INT` cross-testing (27–30 Nov) | `TODO` | Sandeep | `C-M4` | | | |

## 8. Implementation notes

Add a dated note when a task changes the design (e.g. `2026-11-05 · C-4: tree loads children lazily, 200 per page`).
