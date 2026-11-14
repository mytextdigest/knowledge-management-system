# EKP Phase 2: Overview

|                    |                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Window**         | Mon 2 Nov – Mon 30 Nov 2026 (4 weeks, Mon–Sat)                                               |
| **Theme**          | Governance insight, semantics and NYPA's main content (PowerPoint and video)                 |
| **Phase milestone**| **Mon 30 Nov:** taxonomy-driven search, admin dashboards, and PowerPoint/video ingestion live on `dev`, cross-tested by role, RTM re-scored |
| **Reviewer**       | Johurul reviews Sandeep's and Simran's PRs. Sandeep or Simran reviews Johurul's.             |
| **Created**        | 2026-10-29                                                                                   |

**Source documents:** [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md) (workflow, RTM, database rules) · [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (FRs, acceptance) · [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§4 foundations, §5.3–5.5 designs) · [KMS_EKP_Status_Update_2026-10-20.pdf](../KMS_EKP_Status_Update_2026-10-20.pdf) (phase dates).

## 1. Workstreams

| Workstream | Owner | Requirements | Document |
| --- | --- | --- | --- |
| **C** Taxonomy & semantic layer | **Sandeep** | E15, E16, E3, E4 | [WS_C_TAXONOMY_SEMANTIC_LAYER.md](WS_C_TAXONOMY_SEMANTIC_LAYER.md) |
| **D** Analytics & dashboards | **Simran** | E28, E29, E30, A5 (+ F7 search events) | [WS_D_ANALYTICS_DASHBOARDS.md](WS_D_ANALYTICS_DASHBOARDS.md) |
| **E** Content coverage (parts 1 + 2) + Phase 1 carry-over | **Johurul** | E11 (all), E13, E14 + `A-16` SAML, `A-23` SharePoint managed metadata | [WS_E_CONTENT_COVERAGE.md](WS_E_CONTENT_COVERAGE.md) |

**Phase 1 status going in:** Workstreams A and B are merged and treated as complete. Two Phase 1 tasks move into Workstream E: `A-16` (SAML 2.0) and `A-23` (keep SharePoint managed-metadata tags). Both were held back only until WS-A and WS-B had merged, because they change the shared database (rule: merge WS-A → merge WS-B → then build them). That condition is now met. They are tracked in WS-E as `E-3` (`A-23`) and `E-12` (`A-16`). `A-18` (Content Server) stays blocked until after award.

## 2. Milestone calendar

Every milestone is **demoable**: it ends with a merged PR into `dev` and a short live demo on the `dev` build with the mock org "NGI", at the weekly meeting on the due date. The demo script is in each workstream document.

| Due | WS-C (Sandeep) | WS-D (Simran) | WS-E (Johurul) |
| --- | --- | --- | --- |
| **Fri 6 Nov** | **C-M1** Taxonomy exists: term-set editor, default Category term set | **D-M1** Searches are measured: F7 search service, search events, no-results list | **E-M1** PowerPoint searchable + SharePoint tags kept (`A-23`) |
| **Fri 13 Nov** | **C-M2** Semaphore import: SKOS/CSV import, SharePoint tags mapped to terms | **D-M2** Usage & adoption dashboard (E29) | **E-M2** Video with transcript: VTT/Word, timestamp citations, streaming up to 8 GB |
| **Fri 20 Nov** | **C-M3** Taxonomy auto-tagging + ontology search (E15.4, E3) | **D-M3** Content health dashboard (E28) | **E-M3** Transcription, video chapters, SAML (`A-16`) |
| **Tue 24 Nov** | **C-M4** Taxonomy facets (E4), search weights | | |
| **Thu 26 Nov** | | **D-M4** Search quality (E30) + Power BI (A5) | **E-M4** Images, thumbnails/previews, templates (part 2) |
| **Fri 27 – Mon 30 Nov** | **P2-INT** Phase 2 integration and cross-testing (all roles), RTM re-score, gap analysis update | ← | ← |

**If a milestone is late:** demo what is merged, move the unfinished tasks to the next milestone, and don't move the date. Unfinished Phase 2 tasks move to the start of Phase 3, the same rule as Phase 1.

**NYPA demo:** due within 2 weeks of shortlisting (Q&A #84, #173), so likely mid-to-late November. **E-M2 (13 Nov) is the most important milestone for it:** NYPA's content is mostly PowerPoint, PDF and MP4 with VTT transcripts (Q&A #44, #132, #185).

## 3. Branches and PRs

**One branch per workstream for the whole of Phase 2**, cut from the latest `dev` on Mon 2 Nov:

| Workstream | Branch |
| --- | --- |
| C | `feature/ekp-ws-c` |
| D | `feature/ekp-ws-d` |
| E | `feature/ekp-ws-e` |

- **Commit per change** on the branch. Don't open a PR per task.
- **One PR per milestone** into `dev`, titled `WS-C M1: Taxonomy exists` and so on. The description lists the E-numbers/FRs covered, the tracker tasks closed, how it was tested, the demo steps and any schema changes. Open it at least **one working day before** the due date so review fits in.
- **After a milestone PR merges, merge `dev` back into your branch** and continue on the same branch. Don't rebase a branch while its PR is open.
- **The planned Phase 2 schema is already in.** Every model and field in [PHASE2_SCHEMA_CHANGES.md](PHASE2_SCHEMA_CHANGES.md) for C, D and E landed in one migration, `20261029070816_ekp_p2_schema` (`P2-1`, 2026-10-29), so nobody needs a schema PR to start. Merge `dev` into your branch and run `npx prisma generate`.
- **Any further schema change lands on `dev` first.** It starts with a **schema-only PR** (the `schema.prisma` change plus its migration folder) into `dev`. Only after it merges is `prisma migrate deploy` run against the shared database. Otherwise a teammate's `migrate dev` sees an unknown migration and asks for a reset. One migration per schema PR.
- Database rules from the plan §4.3 still apply: never `migrate reset`, never accept a reset prompt, never pass the live database as `--shadow-database-url`, unset any stray `DATABASE_URL` before prisma commands. Create migrations with `npm run ekp:migration:diff -- --name <name>`, not a plain `prisma migrate diff` (see [PHASE2_SCHEMA_CHANGES.md](PHASE2_SCHEMA_CHANGES.md) §2).

## 4. Shared files and who changes them in Phase 2

All schema changes, their order and the migration checklist are in [PHASE2_SCHEMA_CHANGES.md](PHASE2_SCHEMA_CHANGES.md). **Read its §2 before generating any migration.**

| Shared file | Phase 2 changes | Coordination |
| --- | --- | --- |
| `prisma/schema.prisma` | C: `TermSet`, `Term`, `TermSynonym`, `MetadataField`, `DocumentTerm`. D: `SearchEvent`, `SearchClick`, `AnalyticsDaily`, `DocumentLink`. E: `DocumentSourceTag` (`A-23`), `Document.transcriptOfId`, `mediaSegments`, `durationSeconds`, `thumbnailPath`, `AssetTemplate`. | Schema-only PRs, merged one at a time. Week 1 has three of them: merge order **E (`A-23`) → C → D**, so C can reference `DocumentSourceTag`. |
| `src/lib/hybridSearch.js` + new `src/lib/search/searchService.js` (F7) | **D builds F7** (one search entry point + event logging) in D-M1. C adds term expansion, term boost and facets inside it from C-M3. | C codes against F7 once D-M1 merges. Until then C works on taxonomy models and import only. |
| `worker/index.js` | E: new extraction branches (PPTX, VTT, Word transcripts, media, images), thumbnails. C: classification switches to term sets (`worker/classify.js`). | E owns `index.js`; C owns `classify.js`. Post in the channel before touching the other's file. |
| `src/lib/connectors/` SharePoint sync | E: `A-23` reads list-item fields. C: maps the stored values to terms (no sync change). | C reads `DocumentSourceTag`; doesn't change the sync. |
| `src/lib/auth.js`, `middleware.js` | E: `A-16` SAML. | Others ask Johurul first. |
| Analytics section `/org/[orgId]/analytics` | D owns it. B's governance metrics page (E31) becomes one of its tabs. | C and E link to it; they don't add tabs. |

## 5. Cross-workstream dependencies

| Needs | From | By | For |
| --- | --- | --- | --- |
| `A-23` raw SharePoint managed-metadata values (`DocumentSourceTag`) | E (`E-3`; table in `P2-1`) | Fri 6 Nov | C-M2 mapping of existing Semaphore tags to terms (E16.5) |
| F7 `searchService` + `SearchEvent` | D (`D-3`, `D-4`) | Fri 6 Nov | C-M3 query expansion and boost, C-M4 facets |
| Offline search evaluation set + runner | D (`D-13`) and C (`C-11`) build it together | Fri 20 Nov | E3 "measurably better" (C) and E30.5 (D) |
| Term sets + `DocumentTerm` | C (`C-3`; tables in `P2-1`) | Fri 6 Nov | D: content-health and usage breakdowns by term (nice-to-have) |
| Slide and timestamp chunk metadata (`metadata.slide`, `metadata.start`) | E (E-M1, E-M2) | 13 Nov | D: click and citation events record the slide or timestamp |
| Thumbnails (`Document.thumbnailPath`) | E (`E-15`) | 26 Nov | Search and repository cards (C facet panel sits next to them) |

## 6. Rules for every Phase 2 feature

Same as the plan §4.4: RBAC on every API (`resolveOrgRole`, `canManageDepartment`, guests read-only), F1 document access for anything that lists or counts documents (search, facets, dashboards, exports), `logAudit()` on every state change, settings in F5 rather than constants (RFP §6 A1, NFR-3), reviewer gates for publishing. Already-met requirements (E6, E8, E9, E17, E18, E20, E27) must keep working; run their suites before each milestone PR.
