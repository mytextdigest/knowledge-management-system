# EKP Implementation Plan: Closing the NYPA RFP Requirements

**Team:** Johurul (lead and reviewer) · Sandeep · Simran
**Created:** 2026-10-09
**Source of requirements:** NYPA RFP Q26-7821RJM §2.1 (identical to RFI §3.1) and §6. Current status is in `docs/NYPA_RFP_Q26-7821_KMS_GAP_ANALYSIS.md`.

---

## 1. The Goal

NYPA's RFP lists **32 requirements** for an Enterprise Knowledge Platform (EKP). To win, KMS has to meet all 32.

| Today | Status |
|---|---|
| ✅ Met | 8 |
| 🟡 Partial | 18 |
| ❌ Gap | 6 |

**Our goal: take KMS from 8 / 32 to 32 / 32.** We also need to meet NYPA's new architecture and security guidelines (RFP §6), starting with the ones a reviewer will check first (single sign-on, audit trail, encryption, environments).

**Key dates**

| Date | Event | What it means for us |
|---|---|---|
| 14 Oct | Questions to NYPA due | Some requirements wait on NYPA's answers (marked ❓ below) |
| 19 Oct | NYPA answers | Update affected requirement docs that week |
| **28 Oct** | **Proposal due** | Phase 1 (Workstreams A and B) in progress |
| ~Nov | Demo, within 2 weeks of shortlisting | Show whatever is merged from Phase 1 |
| Q1 2027 | Project start | Later phases continue |

---

## 2. The Phases

### 2.1 Phases from the readiness deck (for reference)

| Phase | Theme | Workstreams |
|---|---|---|
| 1 | Remove the biggest risks | A (M365 & connectors, single sign-on) + the audit-trail part of B |
| 2 | Enterprise governance & insight | B (rest), C (taxonomy), D (analytics) |
| 3 | Breadth & polish | E (content coverage), F (personalization) |

### 2.2 Current plan

**Phase 1 = Workstream A + Workstream B.** These cover the RFP's only mandatory requirement (SharePoint), Microsoft sign-in, and the governance and audit-trail gaps a reviewer will check first.

| Phase | Workstream | Requirements | Owner |
|---|---|---|---|
| **1** | **A**: M365 & connectors (+ Microsoft single sign-on) | E2, E12, E32, S2 | **Johurul** |
| **1** | **B**: Governance & lifecycle | E19, E21, E22, E23, E24, E25, E26, E31 | **Sandeep & Simran** (B has the most requirements) |
| Later | C: Taxonomy & semantic layer | E3, E4, E15, E16 | TBD |
| Later | D: Analytics & dashboards | E28, E29, E30, A5 | TBD |
| Later | E: Content coverage | E11, E13, E14 | TBD |
| Later | F: Personalization & experience | E1, E5, E7, E10, A7 | TBD |
| Later | G: Platform & security (RFP §6) | A1–A8, S1, S3–S9 | TBD |

- **Workstream G is new.** It covers the RFP §6 architecture and security guidelines, which weren't in the RFI or the deck.
- **Single sign-on (S2) moved into Workstream A,** because SharePoint permissions need users mapped to Microsoft identities.
- **Sandeep and Simran agree how to split B between them** when they write the B requirements doc (see §6).
- **Order and owners for C–G are decided at the end of Phase 1.**

---

## 3. Requirement Definitions

How to read each entry:
- **RFP:** the exact requirement text. This is what NYPA will score.
- **Done when:** the acceptance criteria. A requirement is only ✅ when every bullet is true and demonstrable.
- **Today:** what already exists and where.
- **Open:** decisions the owner must make in their requirements doc, and ❓ items waiting on NYPA's answers.

The owner details these entries in their workstream document under `docs/ekp/phase1/` (see §4 Workflow). **Expand, don't shrink:** keep every "Done when" bullet. You can add bullets but not drop them without team agreement.

### Workstream A: M365 & Connectors (Johurul)

> **Suggested order:** Microsoft single sign-on (S2) → SharePoint per-file permissions and scheduled sync (E2) → site pages (E12) → deep links (E32) → Content Server and ServiceNow connectors (E2). The last item depends on NYPA's answers about versions and access ❓. If the answers come late, it's the part of A most likely to slip past Phase 1.

**E2: Unified search across SharePoint (mandatory), Content Server, ServiceNow, respecting original permissions** 🟡
- **Done when:**
  - A SharePoint file a user can't open in SharePoint never appears in their search results, chat answers or citations. Permissions are read per file/item from Microsoft Graph, not per site.
  - Permission changes in SharePoint are reflected in KMS within the sync interval.
  - SharePoint sync runs on a schedule (configurable interval), not only via "Sync Now".
  - Content Server and ServiceNow each have a connector on the existing connector base, with search results merged into the same index and permissions enforced ❓.
- **Today:** Graph connector with Sites.Selected, delta sync, sync-run history (`src/lib/msGraph.js`, `src/lib/connectors/`). Access is mapped site → KMS department.
- **Open:** how to model per-item permissions (ACL table vs. principal list on `Document`). How KMS users map to Entra identities (depends on S2). ❓ Content Server version and API, ServiceNow modules.

**E12: Supports site pages, wikis and knowledge articles within connected systems** ❌
- **Done when:** SharePoint site pages and ServiceNow KB articles are ingested, searchable, citable in chat, and show the correct source type and a link back to the source.
- **Today:** only drive files are synced. Folders and pages are skipped.
- **Open:** page HTML-to-text extraction. Which page libraries to include.

**E32: Integrates with M365 for single source of truth storage** 🟡
- **Done when:**
  - Every SharePoint-sourced document shows a "Open in SharePoint" deep link, and SharePoint stays the master copy (KMS keeps only what it needs to index).
  - Users sign in with their Microsoft account (S2).
- **Today:** files are downloaded and stored in S3.
- **Open:** whether to keep a cached copy for preview. Tag write-back to SharePoint (nice-to-have, links to C).

### Workstream B: Governance & Lifecycle (Sandeep & Simran)

**E19: At content ingest, generates brief description, with human-in-the-loop review** 🟡
- **Done when:** AI summaries start as "pending review". A reviewer (dept_admin/owner) can edit, approve or regenerate. The approval and editor are recorded.
- **Today:** summary generated in the worker (`worker/summarize.js`), regenerate route exists. No review state.

**E21: Minimum metadata completeness thresholds before publishing** 🟡
- **Done when:** an admin can set required fields (e.g. category, department, owner, summary approved). Publishing is blocked with a clear message listing missing fields.
- **Today:** only a classification-confidence gate (`worker/classify.js`).

**E22: Publishing workflows (submission → review → approval → publish) with configurable stages and role-based approvers** 🟡
- **Done when:**
  - An admin can define stages and which role approves each stage, per department.
  - Authors submit. Approvers are notified and approve or reject with a comment.
  - Every transition is audit-logged. An author can never approve their own document.
- **Today:** fixed state machine in `src/app/api/documents/[id]/lifecycle/route.js`.
- **Rule:** follow the existing team rule that publish gates require a reviewer, never just the author.

**E23: Decommission workflows (archive/retire, supersede, delete with audit trail)** 🟡
- **Done when:**
  - Archive, retire and delete all write `AuditLog` entries (who, what, when, before/after).
  - A document can be marked "superseded by" another, and search shows only the latest by default.
  - Replacing a file keeps the previous version (version history).
- **Today:** archive/retire states exist. `logAudit()` is only called for org and department events. Replace overwrites.
- **Do first:** audit logging, since every other B feature writes audit events.

**E24: Configurable ownership and stewardship assignment** 🟡
- **Done when:** every document has an owner and optional steward. Admins can reassign in bulk. Ownership coverage is reportable (feeds E28).
- **Today:** implicit (uploader, department admin).

**E25: Configurable review/validation workflows** ❌
- **Done when:** admins can configure periodic re-validation (e.g. every 12 months, by category). Due reviews land in the owner's queue. Outcomes (still valid / update / retire) are recorded.
- **Today:** review flows exist only for classification and decisions, fixed in code.
- **Open:** build E22 and E25 on one shared workflow engine.

**E26: Stale content detection and automated review triggers** 🟡
- **Done when:** stale detection runs on a schedule. Stale documents automatically trigger a review task for the owner (E25), with a notification.
- **Today:** manual script `scripts/task-8/flag-stale-documents.mjs`.

**E31: Governance metrics: review/validation compliance** ❌
- **Done when:** a dashboard shows the % of documents reviewed on time, overdue reviews, average approval time, and documents missing owners, filterable by department.
- **Depends on:** E22, E24, E25. Can start as a simple admin view and move into the Workstream D dashboards later.

### Workstream C: Taxonomy & Semantic Layer (owner TBD)

**E15: Supports managed metadata fields, including hierarchical terms and synonyms** ❌
- **Done when:**
  - Admins can create, edit, nest and retire terms, and add synonyms.
  - Documents are tagged with terms (auto-classification uses the term set instead of the hard-coded 7 categories).
  - Searching a synonym finds documents tagged with the main term.
- **Today:** `CATEGORY_TAXONOMY` constant in `worker/classify.js`. Flat auto-discovered topics.
- **Open:** data model (term sets, terms, parent, synonyms). Migration of existing categories into the new model. Seeding from auto-discovered topics.

**E16: Integrates with NYPA/Canals' current taxonomy/ontology tool** ❌
- **Done when:** KMS imports (and re-syncs) NYPA's controlled vocabulary into the E15 model, with a documented mapping.
- **Today:** none. ❓ Which tool NYPA uses (asked 14 Oct). Design a generic import (SKOS/CSV) first.

**E3: Semantic/hybrid search combining keyword and ontology-driven results** 🟡
- **Done when:** search ranking boosts documents tagged with the query's matching terms, their synonyms and related terms, and this is measurably better on a test query set.
- **Today:** vector + BM25 + LLM expansion + graph expansion (`src/lib/hybridSearch.js`).
- **Depends on:** E15.

**E4: Faceted navigation based on taxonomy/ontology** 🟡
- **Done when:** search results and the repository show facets from the term hierarchy (expand/collapse, with counts), combinable with existing filters.
- **Today:** flat filters (`RepositoryFilters.jsx`). No facets on search results.

### Workstream D: Analytics & Dashboards (owner TBD)

**E28: Content health dashboard (recency, ownership coverage, review status, broken links, duplicates)** 🟡
- **Done when:** admins see one dashboard with all five measures, filterable by department, and each measure links through to the affected documents.
- **Today:** health panel with confidence, conflicts and gaps (`src/app/api/org/[orgId]/health/route.js`).

**E29: Usage & adoption dashboard (searches, click-through rates, time-to-answer, top queries, bounce rate)** 🟡
- **Done when:** all five metrics are tracked and charted over time, per department.
- **Today:** `ChatAuditLog` and `DocumentInteraction` capture raw signals. Searches aren't logged.

**E30: Search quality metrics (precision/recall proxies, "no-results" queries, dwell time)** 🟡
- **Done when:** no-result queries are listed, CTR@k and dwell are tracked, and knowledge gaps link to the queries that caused them.
- **Today:** knowledge-gap detection from chat. Dwell is recorded.

**A5: Integration with Tableau or Power BI** ❌
- **Done when:** analytics data is exportable to Power BI (a read-only reporting API or scheduled dataset export), with a documented setup.

### Workstream E: Content Coverage (owner TBD)

**E11: Supports documents, PPTs, PDFs, videos, images, etc.** 🟡
- **Done when:** PPTX, images (OCR + caption) and video (transcribed) are ingested, searchable and citable, with the timestamp for video.
- **Today:** PDF (+OCR), DOCX, XLSX/XLS/CSV, TXT (`worker/index.js`).
- **Suggested order:** PPTX → images → video.

**E13: Indexing and previews of common file types, thumbnails for visual content** 🟡
- **Done when:** repository and search cards show thumbnails for PDFs, slides and images. Images and video preview in-app.

**E14: Configurable templates for common knowledge asset types** ❌
- **Done when:** admins define templates (e.g. How-To, FAQ, SOP) with sections and required fields. Users create content from a template, and it enters the E22 publishing workflow.
- **Depends on:** E22.

### Workstream F: Personalization & Experience (owner TBD)

**E1: Landing page customizable to reflect NYPA/Canals organization and context** 🟡
- **Done when:** admins configure the landing page (welcome text, featured content, quick links, widgets) without code. Pairs with A7 branding (logo, colours).

**E5: Role-based discovery, personalized homepages, topic hubs, saved searches, watchlists** 🟡
- **Done when:** users can save searches, follow topics or documents (watchlist) and get notified of changes, and have a personal home showing their watchlist, recommendations and recent items. Topic hubs exist per term/topic.
- **Today:** starred documents, department pages, expert topic pages.

**E7: Natural-language answers alongside traditional search results** ✅ (UX alignment)
- **Done when:** the search results page shows an AI answer box with citations above the result list.

**E10: Confidence scores and explainability for AI-generated answers** 🟡
- **Done when:** each answer shows a numeric confidence, plus a "why this answer" panel (which sources, how strongly they matched, any conflicts).
- **Today:** high/medium/low in `src/app/api/org/[orgId]/chat/route.js` (`computeConfidence`).

### Workstream G: Platform & Security, RFP §6 (owner TBD)

| # | Done when | Phase |
|---|---|---|
| **S2** single sign-on | Users sign in with Entra ID via SAML 2.0/OIDC. APIs accept OAuth/token auth. | 1 (part of Workstream A) |
| **S5** encryption | The org API key is encrypted with `src/lib/crypto.js`. Encryption at rest and in transit is documented. | TBD |
| **S7** no caching | All authenticated pages and APIs return `Cache-Control: no-store`. | TBD |
| **A2** test before prod | Separate Dev/Test and Production environments with a documented promotion process. | TBD |
| **A8** HA/DR | Backup/restore runbook tested. Multi-region DR design documented. | TBD |
| **S4** tenancy | Single-tenant deployment option documented and tested. NIST 800-53 control mapping drafted. | TBD |
| **S6** assurance | Third-party penetration test booked and passed ❓ | TBD |
| **S8** TLS | Production host enforces TLS 1.2+. | TBD |
| **S9** US data | AI processing runs on a US-region service (e.g. Azure OpenAI) ❓ | TBD |
| **A1** configurable | Thresholds, category/term sets and workflow rules editable in admin settings (partly delivered by B in Phase 1, the rest by C). | 1 + TBD |
| **S1** data export | Admin bulk export (documents + metadata) and data-model documentation. | TBD |

### Already met: keep them working

E6 recommendations, E8 cited and permission-aware answers, E9 follow-ups, E17 graph-enriched discovery, E18 drag-and-drop upload, E20 auto-tagging with review, E27 duplicate detection.
**Any PR touching these areas must not break them.** Run the relevant existing `npm run task*:test` suites before opening the PR.

---

## 4. Team Workflow

### 4.1 Lifecycle of every requirement

```
1. Write requirements doc  →  2. Review (1 day max)  →  3. Tracker  →  4. Build on a branch
→  5. Self-test against "Done when"  →  6. PR + review  →  7. Merge to dev  →  8. Update status
```

1. **Write the workstream document.** One document per workstream, in `docs/ekp/phase1/` for Phase 1 (`WS_A_M365_CONNECTORS.md`, `WS_B_GOVERNANCE_LIFECYCLE.md`). It links to the product requirements and implementation specifications instead of copying them, and holds: scope (E-numbers and FR numbers), working assumptions, the shared design for the workstream, one short section per package (design, edge cases, open questions, acceptance tests), cross-workstream dependencies and the tracker. Every "Done when" bullet appears in a package's acceptance tests. Package sections are detailed just before each package starts, not all up front.
2. **Review before coding.** Johurul plus one teammate review the shared design and the first package within 1 working day, then each later package section before it starts. Agree on the data model and any shared-file changes here, not in the PR.
3. **Use the tracker.** The tracker is the last section of the workstream document (Task ID, Status TODO/IN_PROGRESS/REVIEW/DONE/BLOCKED, Depends On, PR, Tests). Task IDs: `A-1`, `B-3`, …
4. **Build on a branch.** Branch off the latest `dev` as `feature/ekp-<workstream>-<short-name>` (e.g. `feature/ekp-b-audit-log`). Keep PRs small, one FR or a few related tasks each. Don't hold a whole workstream in one PR.
5. **Self-test.** Walk through every Acceptance Criteria bullet. Add or extend `node --test` tests. Verify data changes with read-only Prisma queries. Check RBAC: a member and a guest must not see or do what they shouldn't.
6. **Open a PR into `dev`.**
   - Reviewers: Johurul reviews Simran's and Sandeep's PRs. Simran or Sandeep reviews Johurul's.
   - The PR description lists the E-numbers and FRs covered, how it was tested, and any schema changes.
7. **Merge.** If two PRs touch the same files, the first to land merges first and the other rebases.
8. **Update status.**
   - Mark the tracker task DONE.
   - When every "Done when" bullet of a requirement is met, update its status in the RTM table (§5).

### 4.2 Ownership and shared files

- Work inside your workstream's files. If you need a file outside your zone, post in the team channel **before** editing it.
- These files are shared. Changes to them must be announced and agreed in the requirements review:

| Shared file | Why it's sensitive |
|---|---|
| `prisma/schema.prisma` | Everyone's data model. A and B both add fields to `Document` in Phase 1, so coordinate. One migration per PR. Announce new models and fields. |
| `worker/index.js` | Single ingestion pipeline: summaries (B, E19) and later file types (E) and classification (C) |
| `src/lib/auth.js`, `middleware.js` | Login and routing: Workstream A (single sign-on). Others ask Johurul first. |
| `src/lib/hybridSearch.js` | Search ranking: A adds per-file permission filtering. Later C and D change ranking and logging. |
| `src/app/api/documents/[id]/lifecycle/route.js` | Workstream B (Sandeep & Simran) |
| `src/lib/auditLog.js` | Workstream B defines the audit event format. Everyone uses it. |

### 4.3 Database rules (mandatory)

- **Never run `prisma migrate reset`.** Never accept a reset prompt from `migrate dev`.
- **Never pass the live `DATABASE_URL` as `--shadow-database-url`.** It wipes the database.
- Create migrations with `prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma --script` and apply them with `prisma migrate deploy`.
- Unset any stray `DATABASE_URL` in your shell before running prisma commands, so you use the one in `.env`.

### 4.4 Cross-cutting rules for every feature

- **RBAC:** every new API resolves the user's org role and department access, the same way existing routes do (`resolveOrgRole`, `canManageDepartment`). Guests are read-only.
- **Audit:** every state change (publish, approve, delete, reassign, config change) calls `logAudit()`.
- **Configurable, not hard-coded:** NYPA wants to configure the product themselves (RFP §6 A1). New thresholds, lists and rules go in admin settings, not constants.
- **Reviewer gates:** publishing or approving always requires a reviewer role, never only authorship.

### 4.5 Communication cadence

| When | What |
|---|---|
| Daily (async) | What I did, what I'm doing, blockers, any shared-file changes coming |
| Weekly (30 min) | Walk the RTM (§5). Re-plan if a phase is slipping. Demo merged work to each other. |
| End of each phase | Re-score the 32 requirements and update the gap analysis doc |
| When NYPA answers (19 Oct) | Update every ❓ item within 2 days |

---

## 5. Requirements Traceability Matrix (RTM)

The single status board. **Update it in the same PR that completes a requirement.**

| # | Requirement (short) | WS | Owner | Phase | Status |
|---|---|---|---|---|---|
| E1 | Customizable landing page | F | TBD | TBD | 🟡 |
| E2 | Unified search across SharePoint/Content Server/ServiceNow, permission-aware | A | Johurul | 1 | 🟡 |
| E3 | Hybrid + ontology search | C | TBD | TBD | 🟡 |
| E4 | Taxonomy facets | C | TBD | TBD | 🟡 |
| E5 | Personal home, saved searches, watchlists | F | TBD | TBD | 🟡 |
| E6 | Recommendations & trending | — | — | — | ✅ |
| E7 | NL answers alongside results | F | TBD | TBD | ✅ (UX polish) |
| E8 | Cited, permission-aware answers | — | — | — | ✅ |
| E9 | Follow-up questions | — | — | — | ✅ |
| E10 | Confidence & explainability | F | TBD | TBD | 🟡 |
| E11 | PPT, images, video | E | TBD | TBD | 🟡 |
| E12 | Site pages, wikis, KB articles | A | Johurul | 1 | ❌ |
| E13 | Previews & thumbnails | E | TBD | TBD | 🟡 |
| E14 | Asset templates | E | TBD | TBD | ❌ |
| E15 | Managed metadata (hierarchy, synonyms) | C | TBD | TBD | ❌ |
| E16 | NYPA taxonomy-tool integration | C | TBD | TBD | ❌ |
| E17 | Graph-enriched search/navigation/chat | — | — | — | ✅ |
| E18 | Drag-and-drop upload | — | — | — | ✅ |
| E19 | Summary with human review | B | Sandeep & Simran | 1 | 🟡 |
| E20 | Auto-tagging with human review | — | — | — | ✅ |
| E21 | Metadata completeness before publish | B | Sandeep & Simran | 1 | 🟡 |
| E22 | Configurable publishing workflow | B | Sandeep & Simran | 1 | 🟡 |
| E23 | Archive/retire/supersede/delete + audit | B | Sandeep & Simran | 1 | 🟡 |
| E24 | Ownership & stewardship | B | Sandeep & Simran | 1 | 🟡 |
| E25 | Configurable review workflows | B | Sandeep & Simran | 1 | ❌ |
| E26 | Stale detection + review triggers | B | Sandeep & Simran | 1 | 🟡 |
| E27 | Duplicate detection | — | — | — | ✅ |
| E28 | Content health dashboard | D | TBD | TBD | 🟡 |
| E29 | Usage & adoption dashboard | D | TBD | TBD | 🟡 |
| E30 | Search quality metrics | D | TBD | TBD | 🟡 |
| E31 | Governance metrics | B | Sandeep & Simran | 1 | ❌ |
| E32 | M365 single source of truth | A | Johurul | 1 | 🟡 |

---

## 6. First Week Checklist

| Who | Task |
|---|---|
| All | Kickoff meeting: confirm Phase 1 scope (A + B). Read this doc and the RFP gap analysis. |
| Johurul | Send the NYPA questions (due 14 Oct). Review `phase1/WS_A_M365_CONNECTORS.md`. Start Microsoft single sign-on (S2), since per-file SharePoint permissions depend on it. |
| Sandeep & Simran | Review `phase1/WS_B_GOVERNANCE_LIFECYCLE.md` together and **agree the split of B's 8 requirements** between you (suggested lanes in its §1.1). Define the audit event format first (everyone uses it), then start E23 audit logging. |
| All | By the end of week 1, the shared design and first package of both workstream documents are reviewed, and tracker owners are filled in. |
