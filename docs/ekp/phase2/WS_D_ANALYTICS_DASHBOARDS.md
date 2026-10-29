# Workstream D: Analytics & Dashboards (Phase 2)

|                       |                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------- |
| **Owner**             | Simran                                                                                |
| **Reviewer**          | Johurul                                                                               |
| **Requirements**      | E28, E29, E30, A5 (RFP §6, Power BI / Tableau). Hosts B's E31 governance metrics as a tab. |
| **Foundations owned** | **F7** unified search service + search events (used by C)                             |
| **Foundations used**  | F1 document access, F2 audit, F3 scheduled jobs, F5 org settings                      |
| **Phase 2 window**    | Mon 2 Nov – Thu 26 Nov 2026 (code-complete), integration to Mon 30 Nov                 |
| **Branch**            | `feature/ekp-ws-d` (one branch for the phase, one PR per milestone; see [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md) §3) |
| **Status**            | Draft for review. Shared design + D-M1 ready for review; D-M2 to D-M4 outlined, detail each before it starts. |

**Source documents (don't copy from them, link to them):**

- Requirements and acceptance criteria: [KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md](../KMS_EKP_PRODUCT_REQUIREMENTS_SPECIFICATION.md) (§4.9 E28–E30 and the rules for all dashboards; §5 NFRs)
- Architecture and design: [KMS_EKP_IMPLEMENTATION_SPECIFICATION.md](../KMS_EKP_IMPLEMENTATION_SPECIFICATION.md) (§4 F7; §5.4)
- NYPA's answers: `docs/ekp/Copy of Attachment 5 - Q+A format NYPA Response_updated10.22.26.xlsx` ("Q&A #n")
- Plan, workflow and status board: [EKP_IMPLEMENTATION_PLAN.md](../EKP_IMPLEMENTATION_PLAN.md) · Phase 2 calendar and shared files: [PHASE2_OVERVIEW.md](PHASE2_OVERVIEW.md)

## 1. Scope

| Milestone | Covers (PRS FR numbers) | Due | Demo |
| --- | --- | --- | --- |
| **D-M1** Searches are measured | F7, E29.1, E30.1, E30.3 (raw) | **Fri 6 Nov** | Run searches and chat questions; they appear in Analytics → Search activity, with a no-results list |
| **D-M2** Usage & adoption dashboard | E29.2, E29.3 | **Fri 13 Nov** | All five E29 metrics charted over time, by department and role, exported to CSV |
| **D-M3** Content health dashboard | E28.1–E28.6 | **Fri 20 Nov** | All five health measures plus completeness; a planted broken link is detected; each measure drills through to documents |
| **D-M4** Search quality + Power BI | E30.1–E30.5, A5 | **Thu 26 Nov** | CTR@k, reformulation, dwell, gaps linked to queries; Power BI Desktop loads KMS analytics from the reporting API |

**Out of scope for Phase 2:**

- Governance metrics themselves (E31). B built them (`/org/[orgId]/governance-metrics`, `api/org/[orgId]/governance/metrics`); D only moves the page under the analytics section as a tab.
- Answer confidence and "why this answer" (E10, Workstream F). D reports the answer feedback that already exists (`OrgMessage.feedback`) and the confidence already stored.
- OAuth/token auth for all KMS APIs (S2's "OAuth for APIs" half, Workstream G). The reporting API uses a per-org reporting key (§4.4) until G lands.

## 2. NYPA answers that affect D

| NYPA said | Effect | Q&A # |
| --- | --- | --- |
| Vendors must include **their own performance statistics** (search, AI answers, indexing, sync) in the proposal. | Every `SearchEvent` records `latencyMs` (and time to first answer token for chat). D-M2 adds a "Performance" card: p50/p95 search and answer latency. This produces measured numbers for the proposal and the NYPA demo. | 230 |
| Search and AI answers in **under 10 seconds**; about 2,600 users, 100 concurrent at peak. | Dashboards read pre-aggregated `AnalyticsDaily` rows, never raw events, so they stay fast at this scale. Event logging is fire-and-forget and must not slow search (NFR-4). | 48, 69 |
| M365 G5 GCC tenant. | Power BI is the BI tool to target first (A5); Tableau gets the same CSV/JSON endpoints. | 108 |
| Only SharePoint at launch; Content Server and ServiceNow later. | Every dashboard filters by **source system** from day one, so new connectors appear without dashboard changes. | 66, 209 |
| Duplicates "not believed to be an issue"; staleness reviews must be supported. | E28 duplicates stay a simple count of open flags; recency and staleness get the most space. | 194 |
| The KM team (about 5 people) is the product owner. | Org admins and the KM team see all departments; department admins see their own (PRS §4.9). | 164 |

## 3. Working assumptions

| # | Assumption | Cost if wrong |
| --- | --- | --- |
| DS-1 | A "search" is any query on the search page, the repository search box, or an org chat question. All go through F7 and log one `SearchEvent` with `kind` = `search` \| `repository` \| `chat`. | None; `kind` lets us split them. |
| DS-2 | Nightly roll-up (F3 job) is fresh enough for dashboards; "today" is computed live from raw events. | Lower the job interval. |
| DS-3 | Bounce = a search with no click and no follow-up search or question within 60 s (impl spec §5.4). | Change one constant in F5 settings. |
| DS-4 | Power BI connects through a **Web/JSON or OData-style** read-only endpoint with an org reporting key. | A scheduled CSV export to SharePoint is the fallback. |

## 4. Shared design

### 4.1 F7: one search entry point (`D-3`)

- New `src/lib/search/searchService.js`: `search({ orgId, user, query, filters, facets, kind })` wraps `hybridOrgSearch` (`src/lib/hybridSearch.js`). The search route (`api/org/[orgId]/search`), repository search, org chat retrieval (`api/org/[orgId]/chat`) and recommendations (`src/lib/recommendations.js`) all call it.
- **No ranking change in `D-3`.** A parity test runs a fixed query set through the old and new paths and asserts the same results, same as the F1 parity test in Phase 1.
- It returns `{ results, searchEventId, facets? }`. The UI sends `searchEventId` back with every click.
- C adds term expansion, boost and facets inside it from C-M3. D owns the file; changes from C go through D's review.

### 4.2 Data model (schema-only PR `D-2`)

| Model / field | Fields | Notes |
| --- | --- | --- |
| `SearchEvent` | `id`, `orgId`, `userId`, `kind`, `query`, `normalizedQuery`, `filters Json`, `resultCount`, `answerShown`, `confidence`, `latencyMs`, `firstTokenMs`, `departmentId?`, `sourceSystems[]`, `previousEventId?`, `createdAt` | `previousEventId` links a reformulation (same user, within 60 s) |
| `SearchClick` | `id`, `searchEventId`, `documentId`, `rank`, `chunkRef Json?` (slide or timestamp from E), `clickedAt`, `dwellSeconds` | Dwell reuses the `DocumentInteraction` timer (capped at 1,200 s) |
| `AnalyticsDaily` | `orgId`, `departmentId?`, `sourceSystem?`, `date`, `metric`, `value`, `dims Json?` | Unique on (`orgId`, `departmentId`, `sourceSystem`, `date`, `metric`) |
| `DocumentLink` | `id`, `documentId`, `url`, `status` (`ok` \| `broken` \| `unknown`), `httpStatus`, `checkedAt`, `firstBrokenAt` | E28.4 |
| `KnowledgeGap.queryIds` | `String[]` (new field) | E30.4: links gaps to the triggering `SearchEvent`s |

**Privacy:** queries are stored with the user id because E29.3 needs adoption by role and department. Dashboards only show aggregates and query text, never which user searched for what. The raw event table is org-admin only.

### 4.3 Analytics section

- `/org/[orgId]/analytics` with tabs **Usage**, **Content health**, **Search quality**, **Governance** (B's existing page moved in), **Search activity** (raw, org admin).
- APIs under `/api/org/[orgId]/analytics/{usage,health,search-quality,activity,export}`.
- Every API: `resolveOrgRole`; department admins are limited to their departments; guests and members get 403. Every document list and count uses the F1 predicate (NFR-1).
- Common filters on every tab: department, source system, date range. Every number links to the items behind it. CSV export on every widget (PRS §4.9).
- No chart library is installed today. Pick one in `D-1` (Recharts is the usual choice for React) and use it for every tab, with colours from the app theme in light and dark mode.

### 4.4 Reporting API for Power BI (A5)

- `GET /api/reporting/v1/{metrics,searches,documents,health}` returning flat JSON (and `?format=csv`), paginated, date-filtered.
- Auth: an org **reporting key** created in Settings → Integrations → Power BI (stored hashed, shown once, revocable, audit-logged `config.changed`). Read-only. Scoped to the org; returns aggregates and document metadata only, no document content.
- A setup guide `docs/ekp/phase2/POWER_BI_SETUP.md`: Power BI Desktop → Get data → Web, headers, refresh schedule, a starter `.pbix` layout description.

## 5. Milestones

Each milestone ends with a PR from `feature/ekp-ws-d` into `dev`, opened one working day before the due date, and a demo on `dev` at the weekly meeting.

### D-M1 Searches are measured (due Fri 6 Nov)

- **Build:** `D-2` schema-only PR (after E's and C's schema PRs; see overview §4). `D-3` F7 search service + parity test. `D-4` event logging: `SearchEvent` per search and chat question (with latency), `SearchClick` with rank and dwell, reformulation link. `D-5` analytics section shell with the Search activity tab (recent searches, no-results list with frequency, top queries) and the Governance tab (B's page moved, old URL redirects).
- **Edge cases:** logging must never fail a search (catch and log); empty or whitespace queries aren't logged; a chat follow-up is a new event linked to the previous one; a guest's searches are logged but guests can't open analytics.
- **Demo script:** (1) As a member, run three searches (one with no results) and ask one chat question, then open a result. (2) As org admin, open Analytics → Search activity: all four events, the click with its rank, the no-results query in its list, latencies shown. (3) As a member, `/analytics` is refused.
- **Acceptance:** E29.1 holds for search, repository and chat; E30.1 list correct; parity test passes.

### D-M2 Usage & adoption dashboard (due Fri 13 Nov)

- **Build:** `D-6` F3 job `analytics.rollup` (nightly, plus "run now") computing daily metrics into `AnalyticsDaily`; idempotent per day. `D-7` Usage tab: searches and questions over time, active users, CTR, time-to-answer, top queries, bounce rate, by department and role; Performance card (p50/p95 latency, Q&A #230); CSV export.
- **Demo script:** (1) Load a seeded week of synthetic events for NGI. (2) Show the five E29 metrics over the week; filter to Engineering; values change. (3) Export CSV. (4) Show the Performance card with measured latencies.
- **Acceptance:** PRS E29 acceptance; a fixture test checks each metric against hand-computed values.

### D-M3 Content health dashboard (due Fri 20 Nov)

- **Build:** `D-8` F3 job `links.check`: extract URLs from document text into `DocumentLink`, check with HEAD (GET fallback) and a 10 s timeout, rate-limited per host; synced items whose source was deleted (SharePoint 404, from the sync) count as broken. `D-9` Content health tab: recency (age buckets, stale count from B's `staleSince`), ownership coverage (B's `ownerId`), review status (current/due/overdue from B's review policies), broken links, duplicates (open `DocumentDuplicate` flags), metadata completeness (B's required fields); each measure drills through to the document list. Replaces the old health panel's role; confidence, conflicts and gaps stay as a section.
- **Demo script:** (1) Plant a document containing a dead URL and run `links.check`. (2) Open Content health: the broken link shows; click through to the document. (3) Filter to one department as its department admin; other departments are not visible.
- **Acceptance:** PRS E28 acceptance; counts match seeded data; department admin scoping verified.

### D-M4 Search quality + Power BI (due Thu 26 Nov)

- **Build:** `D-10` Search quality tab: no-results queries with frequency, CTR@1/3/10, reformulation rate, dwell on clicked results, share of low-confidence answers, answer feedback from `OrgMessage.feedback`; gap scan becomes an F3 job that fills `KnowledgeGap.queryIds`, and each gap links to its queries. `D-13` offline evaluation set + runner (`scripts/ekp/search-eval/`), built with Sandeep and **due Fri 20 Nov** because C-M3 needs it (E30.5). `D-11` reporting API + reporting key + Power BI setup guide. `D-12` permission tests for every analytics and reporting endpoint (member, guest, department admin of another department, revoked key).
- **Demo script:** (1) Search quality tab: a planted no-result query, CTR@k and reformulation rate for the seeded week. (2) Open a knowledge gap; it lists the questions that created it. (3) In Power BI Desktop, connect with the reporting key and load daily metrics.
- **Acceptance:** PRS E30 acceptance; A5 "done when" (exportable to Power BI with a documented setup).

## 6. Open questions

| # | Question | Default until decided |
| --- | --- | --- |
| DQ-1 | Should repository browsing (no query, filters only) count as a search for CTR? | No; only queries with text count |
| DQ-2 | Retention for raw `SearchEvent` rows? NYPA has no retention schedule for knowledge (Q&A #181), but this is usage data. | Keep 13 months raw, aggregates forever; setting in F5 |
| DQ-3 | Does NYPA want Power BI connected to KMS directly, or a dataset pushed into their tenant? | Pull (reporting API); push is after award |

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
| `D-1` | Finalize this document (shared design + D-M1), reviewed by Johurul | `TODO` | Simran | — | | | |
| `D-2` | D-M1 · Schema-only PR: `SearchEvent`, `SearchClick`, `AnalyticsDaily`, `DocumentLink`, `KnowledgeGap.queryIds` | `TODO` | Simran | `D-1`, `C-2` merged | | | |
| `D-3` | D-M1 · F7 `searchService` used by search, repository, chat and recommendations; parity test | `TODO` | Simran | `D-1` | | | |
| `D-4` | D-M1 · Search/question/click/dwell logging with latency and reformulation link | `TODO` | Simran | `D-2`, `D-3` | | | |
| `D-5` | D-M1 · Analytics section shell; Search activity tab (no-results, top queries); Governance tab moved in | `TODO` | Simran | `D-4` | | | |
| `D-M1` | **Milestone PR + demo: Searches are measured** (due Fri 6 Nov) | `TODO` | Simran | `D-3`–`D-5` | | | |
| `D-6` | D-M2 · F3 job `analytics.rollup` into `AnalyticsDaily` (idempotent) | `TODO` | Simran | `D-M1` | | | |
| `D-7` | D-M2 · Usage tab: five E29 metrics, by department/role, Performance card, CSV | `TODO` | Simran | `D-6` | | | |
| `D-M2` | **Milestone PR + demo: Usage & adoption dashboard** (due Fri 13 Nov) | `TODO` | Simran | `D-6`, `D-7` | | | |
| `D-8` | D-M3 · F3 job `links.check` + `DocumentLink`; deleted SharePoint sources count as broken | `TODO` | Simran | `D-M2` | | | |
| `D-9` | D-M3 · Content health tab: recency, ownership, review status, broken links, duplicates, completeness, drill-through | `TODO` | Simran | `D-8` | | | |
| `D-13` | D-M3 · Offline search evaluation set + runner (with Sandeep, needed by `C-11`) | `TODO` | Simran + Sandeep | `D-3` | | | |
| `D-M3` | **Milestone PR + demo: Content health dashboard** (due Fri 20 Nov) | `TODO` | Simran | `D-8`, `D-9`, `D-13` | | | |
| `D-10` | D-M4 · Search quality tab: CTR@k, reformulation, dwell, low-confidence share, feedback; gaps linked to queries | `TODO` | Simran | `D-M3` | | | |
| `D-11` | D-M4 · Reporting API + org reporting key + `POWER_BI_SETUP.md` (A5) | `TODO` | Simran | `D-6` | | | |
| `D-12` | D-M4 · Permission tests for all analytics and reporting endpoints | `TODO` | Simran | `D-10`, `D-11` | | | |
| `D-M4` | **Milestone PR + demo: Search quality + Power BI** (due Thu 26 Nov) | `TODO` | Simran | `D-10`–`D-12` | | | |
| `D-14` | Update RTM for E28, E29, E30, A5; join `P2-INT` cross-testing (27–30 Nov) | `TODO` | Simran | `D-M4` | | | |

## 8. Implementation notes

Add a dated note when a task changes the design (e.g. `2026-11-04 · D-3: chat retrieval now goes through searchService`).
