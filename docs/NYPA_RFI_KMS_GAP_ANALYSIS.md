# KMS vs. NYPA RFI: Enterprise Knowledge Platform Gap Analysis

**RFI:** NYPA Q26-7772RJM, *Knowledge Management Tools* (Attachment 1)
**Our proposal:** Next Generation Innovation L.L.C. response (May 2026)
**Product assessed:** KMS through PRD Tier 2 (Ranks 1–16), `dev` branch, 2026-10-02. Rank 15 (Project Intelligence) is counted at its requirements doc.
**Method:** Each requirement was checked against the code (API routes, Prisma schema, ingestion worker, UI) and against the proposal's own commitments.

**Legend:** ✅ **Met**: built and working · 🟡 **Partial**: real foundation, but less than the RFI or proposal describes · ❌ **Gap**: not built

---

## 0. Scope: Why This Analysis Covers One Product, Not Three

The RFI asks vendors about **three separate products**:

| # | RFI product | Our position |
|---|---|---|
| 1 | **Enterprise Knowledge Platform (EKP)**: unified search, navigation, access, conversational answers | **The target of KMS.** |
| 2 | Semantic & Knowledge Asset Creation Tools | Not KMS's target. |
| 3 | Lessons Learned Management Tool | Not KMS's target, though KMS has a lessons capability (see §5). |

This analysis scores **RFI §3.1 (EKP requirements)** and **§4.8 (EKP deliverables)**, plus the proposal commitments that apply to the EKP (security, governance, user experience, pilot readiness). Products 2 and 3 appear only in **Appendix A**, as bonus coverage.

---

## 1. Executive Summary

KMS today covers the **core AI and retrieval spine** of the EKP:
- multi-tenant orgs with department RBAC;
- permission-aware hybrid search and org-wide RAG chat with citations and confidence;
- auto-classification with a human review queue;
- duplicate and conflict detection;
- a document lifecycle;
- a SharePoint connector;
- a knowledge graph used inside search and chat;
- recommendations and trending content.

### EKP scorecard (RFI §3.1, 32 requirement lines)

| ✅ Met | 🟡 Partial | ❌ Gap |
|---|---|---|
| **8** (25%) | **18** (56%) | **6** (19%) |

**Meaning:** most requirements are *partial*. In nearly every case KMS has the working mechanism. What's missing is **enterprise depth**: configurable governance, analytics dashboards, managed taxonomy, more file formats, and fuller M365 integration. Closing those gaps is mostly productizing what exists, not inventing new AI.

### Scorecard by EKP area

| EKP area (RFI §3.1) | ✅ | 🟡 | ❌ |
|---|---|---|---|
| Unified access, search & navigation (#1–4) | 0 | 4 | 0 |
| Personalization (#5–6) | 1 | 1 | 0 |
| Conversational Q&A (#7–10) | 3 | 1 | 0 |
| Content coverage (#11–14) | 0 | 2 | 2 |
| Enrichment & semantic layer (#15–17) | 1 | 0 | 2 |
| Ingestion & automated metadata (#18–21) | 2 | 2 | 0 |
| Governance & lifecycle (#22–27) | 1 | 4 | 1 |
| Analytics & dashboards (#28–31) | 0 | 3 | 1 |
| M365 integration (#32) | 0 | 1 | 0 |

**Strongest areas:** conversational Q&A, ingestion and classification, knowledge graph.
**Weakest areas:** content coverage, semantic layer (taxonomy), analytics.

### The five things to be clear about in the presentation

1. **SharePoint, the RFI's only mandatory requirement, is partial.** KMS syncs SharePoint drive files, but it **doesn't inherit each file's SharePoint permissions**. Access is mapped *per site → KMS department*. It also doesn't sync site pages, and sync is a manual button with no schedule. Proposal §5.3 promised source-system permission inheritance, so this is the **highest-risk gap**.
2. **There's no Entra ID / M365 single sign-on.** Login is email + password or OTP only.
3. **Governance exists but is hard-coded.** There's a draft → published → archived → retired state machine and a review queue. But stages and approvers aren't configurable, there's no version history, and **the audit log doesn't record document lifecycle changes or deletes**. Proposal §5.4 claimed "lifecycle audit history".
4. **There are no analytics dashboards.** Data is captured (chat questions, citations, views with dwell time, knowledge gaps), but there are no usage, search-quality or governance dashboards, and search queries aren't logged. Proposal §15.1 said the pilot would *measure search quality and time-to-answer*.
5. **Taxonomy is a fixed 7-value category list** plus auto-discovered topics. There are no managed metadata, hierarchy or synonyms, and no integration with NYPA's taxonomy tool.

**Mitigating point:** the proposal's pricing already treated several of these as **paid implementation work**: *Integration (SharePoint, M365, ServiceNow) $150k* and *Metadata & Taxonomy Configuration $75k*. Gaps 1, 2 and 5 fall into scope NYPA was told would be delivered during implementation, not out of the box.

---

## 2. RFI §3.1 Requirements, with Proposal Commitments

"Proposal said" quotes or paraphrases the proposal's **§17 Traceability Matrix** response for that line.

### 2.1 Unified Access, Search and Navigation

| # | RFI requirement | Proposal said | KMS today (evidence) | Status | Gap to close |
|---|---|---|---|---|---|
| 1 | Single platform; customizable landing page reflecting NYPA/Canals | "Unified discovery layer across approved enterprise content sources" | Org dashboard with stats and health panel (`org/[orgId]/dashboard`). Org home redirects to the user's department page. | 🟡 | Admin-configurable landing page (branding, featured content, widgets). |
| 2 | Unified search across **SharePoint (mandatory)**, Content Server, ServiceNow, **respecting original permissions** | "Priority integration target with **permission-aware indexing**"; Content Server and ServiceNow "through controlled API/connectors" | SharePoint via Microsoft Graph (`src/lib/msGraph.js`, `src/lib/connectors/sharepoint.js`): Sites.Selected app grant, delta sync, `SyncRun` history. Synced files are searched with uploads. | 🟡 | **Per-item SharePoint ACL inheritance** (currently site → department). Scheduled sync. **Content Server and ServiceNow connectors not started.** |
| 3 | Semantic/hybrid search: keyword + **ontology-driven** | "Keyword retrieval, semantic vector search, metadata filters, and ontology-aware relevance" | Vector + BM25 hybrid (`hybridSearch.js`, `keywordSearch.js`), LLM query expansion (`queryExpansion.js`), graph expansion (`knowledgeContext.js`). Metadata filters on the repository. | 🟡 | The ontology-driven part, since there's no ontology (see #15–16). |
| 4 | Faceted navigation on taxonomy/ontology | "Faceted filtering, topic navigation, semantic browsing" | Repository facets: department, category, lifecycle, file type, date, text. Topic views. | 🟡 | Hierarchical, taxonomy-driven facets. Facets on search results (they exist only on the repository list). |

### 2.2 Personalization & Role-Aware Experience

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 5 | Role-based discovery, personalized homepages, topic hubs, **saved searches, watchlists** | "Role-aware discovery and personalized knowledge access". §16 table also lists "saved searches". | Role and department scoped discovery, department pages, expert-by-topic pages, starred documents, per-user topic memory. | 🟡 | **Saved searches, watchlists or follow-topic, notifications, personalized home.** (PRD Rank 17, Tier 3.) |
| 6 | Recommendations and trending content in the user's domain | (§16 user experience) | Rank 10: personal recommendations, "Trending in your department", effectiveness view (`src/lib/recommendations.js`). | ✅ | — |

### 2.3 Conversational Query & Answering

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 7 | NL questions with direct answers **alongside search results** | "RAG conversational interface… source-grounded responses". §16.1: results include direct answers, related docs, relevant lessons. | Org chat (`api/org/[orgId]/chat`) answers with citations and pulls in related decisions and lessons. A separate hybrid search API exists. | ✅ | UX only: show an answer box *on* the search results page. |
| 8 | RAG answers cite sources and respect permissions | "Permission filtering occurs **before** response generation" | Yes. Retrieval is RBAC-scoped before the prompt is built. Typed citations. Denied attempts logged in `ChatAuditLog`. | ✅ | — |
| 9 | Follow-ups and refinement ("show me the latest version") | "Refinement, context continuation" | Last 6 turns, active document/topic context, entity-aware retrieval, cross-conversation topic memory. | ✅ | "Latest version" is limited because documents have no version history (#23). |
| 10 | Confidence scores and explainability | "Confidence-aware retrieval logic and source traceability" | High/medium/low confidence per answer from retrieval strength. Citations. | 🟡 | Numeric score, a "why this answer" explanation, calibration against user feedback. |

### 2.4 Knowledge Content Coverage

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 11 | Formats: documents, **PPTs**, PDFs, **videos, images** | "Designed for multi-format ingestion" (§11: "PDFs, PPTs, documents, transcripts, recordings, videos, images") | PDF (+ OCR for scans), DOCX, XLSX/XLS/CSV, TXT. | 🟡 | **PPTX, images, audio, video, transcripts.** |
| 12 | Site pages, wikis, knowledge articles in connected systems | (included in #11 response) | SharePoint sync ingests **drive files only**. | ❌ | SharePoint site pages and wikis, ServiceNow KB articles. |
| 13 | Indexing and previews; thumbnails for visual content | "Indexing, preview" | Full indexing, in-app viewer and fullscreen preview, file-type icons. | 🟡 | Thumbnails. Image and video preview. |
| 14 | Configurable templates for common knowledge asset types | (asset templates promised under product 2) | — | ❌ | Template library (FAQ, How-To, SOP…). |

### 2.5 Content Enrichment and Semantic Layer Integration

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 15 | Managed metadata incl. hierarchical terms and synonyms | "Structured fields, synonyms, controlled vocabularies, semantic tags" | Fixed **flat 7-value category list** (`CATEGORY_TAXONOMY`, `worker/classify.js`). Flat auto-discovered topics. | ❌ | Managed term model with hierarchy and synonyms. |
| 16 | Integrate with NYPA's taxonomy/ontology tool | "Alignment with enterprise taxonomy and controlled vocabulary models" | — | ❌ | Import/sync with NYPA's tool or the SharePoint Term Store. (Priced as "Metadata & Taxonomy Configuration", $75k.) |
| 17 | Knowledge-graph-enriched search, navigation and conversational querying | "Knowledge graph-**ready**" | **Beyond what was proposed:** Rank 12/13 graph is live. Search pulls in related documents through `DocumentRelationship`, the graph explorer page handles navigation, and chat uses the same graph-expanded retrieval. | ✅ | Bind the graph to an enterprise ontology once #15 exists. |

### 2.6 Content Ingestion and Automated Metadata

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 18 | Easy drag-and-drop upload | "Ingestion workflows for approved sources and user-generated assets" | Drag-and-drop batch upload (10 files) with category and department (`UploadToRepositoryModal.jsx`). | ✅ | — |
| 19 | Brief description at ingest **with human review** | "Can be routed through human validation workflows". §16.2: stewards "review generated summaries". | AI summary, key points and reading guide for every document. Regenerate. | 🟡 | Human edit/approve step for summaries. |
| 20 | Auto-classification / auto-tagging **with human review** | "Reviewed by knowledge stewards before publishing" | Category and department suggestions with confidence thresholds. Low-confidence documents go to the **Needs Review** queue. Re-run on replace or SharePoint update. | ✅ | Tag vocabulary is limited by #15. |
| 21 | Minimum metadata completeness before publishing | "Metadata completeness checks and publishing controls" | Confidence gate blocks auto-publishing an uncertain classification. | 🟡 | Admin-configurable required-fields rule. |

### 2.7 Governance and Content Lifecycle Management

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 22 | Publishing workflow (submit → review → approve → publish), **configurable stages, role-based approvers** | "Workflow orchestration supports review, approval, validation, and controlled publishing" | Role-gated state machine (`api/documents/[id]/lifecycle`): draft → published by dept_admin/super_admin. | 🟡 | Configurable stages and approvers, a submission step, notifications. (PRD Rank 27.) |
| 23 | Archive/retire, **supersede**, delete **with audit trail** | "Archival, decommissioning concepts, traceability, and **audit history**" | published → archived → retired with role rules. Hard delete. Replace re-processes in place. | 🟡 | Supersede links, **version history**, and **audit-logging of lifecycle changes and deletes**. Today `logAudit()` is called only for org creation and department rename/delete. (PRD Ranks 26, 29, 30.) |
| 24 | Configurable ownership and stewardship | §16.2 "knowledge steward" role throughout | Uploader, department and dept_admin act as implicit owners. Expert confirmation. | 🟡 | Explicit owner/steward fields and assignment. (PRD Rank 25.) |
| 25 | Configurable review/validation workflows | "Approval queues, lifecycle controls" | Fixed review flows (needs-review, decision review). | ❌ | Generic configurable review workflow. |
| 26 | Stale content detection and automated review triggers | "Identify aging content, missing ownership, and review needs" | Stale job: documents not cited in N days get an archive suggestion, shown under the "suggested review" filter (`scripts/task-8/flag-stale-documents.mjs`). | 🟡 | Run as a CLI script, so it needs scheduling, plus review-due dates and owner alerts. |
| 27 | Duplicate and near-duplicate detection | "Semantic similarity and metadata analysis" | Exact (hash) and near-duplicate (≥0.92 similarity) with pending review, related documents (Rank 12), **plus contradiction detection** between documents. | ✅ | — |

### 2.8 Analytics and Dashboards

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 28 | Content health dashboard (recency, ownership, review status, broken links, duplicates) | "Analytics model supports… content health" | Org health panel: answer-confidence mix, open conflicts, top knowledge gaps. | 🟡 | Recency, ownership, review-status and duplicate widgets. |
| 29 | Usage and adoption (searches, CTR, time-to-answer, top queries, bounce) | "Adoption, search behavior" | Raw data captured: `ChatAuditLog`, `DocumentInteraction` (views + dwell), recommendation effectiveness. | 🟡 | Dashboard, plus search-query logging. |
| 30 | Search quality (precision/recall proxies, **no-results queries**, dwell) | "No-results queries" (§11, §15.3, §16.3) | Zero-citation and low-confidence chat questions feed **knowledge-gap detection**. Dwell recorded. | 🟡 | No-results tracking for search and a quality dashboard. |
| 31 | Governance metrics (review compliance) | "Governance metrics" | — | ❌ | Depends on #22–26 being configurable. |

### 2.9 Integration and Authoring

| # | RFI requirement | Proposal said | KMS today | Status | Gap to close |
|---|---|---|---|---|---|
| 32 | M365 as single source of truth storage | "Preserves M365 as authoritative repository while adding a semantic access layer" | Reads SharePoint/OneDrive drives through Graph. | 🟡 | Files are **copied** into KMS S3 instead of referenced, with no deep link back. **No Entra ID SSO.** No tag write-back. |

**Totals:** ✅ 8 · 🟡 18 · ❌ 6

---

## 3. Proposal Cross-Cutting Commitments (§4–5, §15–16)

These aren't separate RFI lines, but NYPA will hold us to them because we wrote them.

### 3.1 Security and governance (Proposal §5)

| Proposal claim | KMS reality | Status |
|---|---|---|
| §5.2 Role-based access, department segmentation, permission-aware retrieval | Done. 4 roles, department scoping, RBAC in every retrieval query, guest role. | ✅ |
| §5.3 **Permission inheritance** from source systems during indexing, search and AI | SharePoint access is mapped per site to one department. Item-level ACLs aren't read. | 🟡 **at risk** |
| §5.4 Audit: retrieval events, AI interactions | `ChatAuditLog` records every question, cited docs and denied attempts. Org admins can view it. | ✅ |
| §5.4 Audit: governance workflows, admin activity, **lifecycle history** | `AuditLog` covers only org creation and department rename/delete. Document lifecycle, delete, classification override, lesson and decision review aren't logged. | 🟡 **at risk** |
| §5.5 Encryption in transit and at rest, secure integrations | Integration tokens use AES-256-GCM (`src/lib/crypto.js`). DB and S3 rely on provider-default encryption. **The org's OpenAI API key is stored in plaintext** (`Organization.openaiApiKey`). | 🟡 |
| §5.6 Human approval workflows | Needs-review queue, decision review, reviewer-gated lessons, role-gated lifecycle. All fixed, not configurable. | 🟡 |
| §5.7 Secure AI: RAG, permission-aware, source-grounded | Done. Answers are refused when not supported by context. Per-org model key. | ✅ |
| (implied) Enterprise identity / SSO | Email + password or OTP only. No Entra ID, SAML, SCIM or enforced MFA. | ❌ |

### 3.2 User experience vision (Proposal §16)

| User group (§16 table) | Promised | KMS today | Status |
|---|---|---|---|
| Employees | Semantic search, NL Q&A, faceted navigation, **saved searches**, source-grounded answers | All except saved searches. Facets are on the repository only. | 🟡 |
| Engineers / operations | Retrieval linking procedures, incident reviews, project knowledge and expertise | Chat links documents, decisions and lessons. Expert discovery. Project Intelligence (Rank 15) in progress. | ✅ |
| Knowledge stewards | Review summaries, validate metadata, approval queues, retire stale knowledge | Metadata validation (needs-review) ✅, approvals ✅ (fixed), stale retirement 🟡, summary review ❌ | 🟡 |
| Administrators | Integration and indexing monitoring, **classification quality, search behavior, no-results, governance compliance**, audit logs, config controls | Sync runs and per-document status ✅. Chat audit log ✅. The rest ❌. | 🟡 |
| Leadership | Dashboards for content health, usage, search quality, reuse, impact | Health panel only. | ❌ |

### 3.3 Deployment and pilot readiness (Proposal §4.4, §9, §15)

| Proposal claim | KMS reality | Status |
|---|---|---|
| Cloud, private, hybrid, desktop-contained deployment options | Cloud only: AWS S3/SQS + Neon Postgres, **dev environment only**. No packaged private or hybrid deployment. | 🟡 |
| Dev/Test/QA and Production environments | Dev only. | 🟡 |
| Pilot measures **search quality, time-to-answer, user feedback, governance workflow performance** (§15.1) | Feedback captured in chat. Time-to-answer, search quality and workflow metrics not instrumented. | 🟡 **at risk** |
| Testing: permission inheritance, traceability, retrieval relevance (§9.1) | RBAC integration tests and per-feature `node --test` suites. 82-case alpha QA plan. No retrieval-relevance benchmark, no load test, no Azure DevOps. | 🟡 |
| API-first architecture (§4.1) | Internal REST APIs, session-authenticated. No public API or API keys. | 🟡 |

---

## 4. RFI §4.8: EKP Deliverables Readiness

| §4.8 deliverable | Status | What exists / what's missing |
|---|---|---|
| Unified, permission-aware search integration framework (M365, Content Server, ServiceNow, intranet) | 🟡 | Connector abstraction (`src/lib/connectors/base.js`) with SharePoint built. Others missing. Item-level permissions missing. |
| Semantic/hybrid search pipeline (keyword + ontology relevance) | 🟡 | Hybrid, expansion and graph pipeline is built and can be documented. Ontology layer missing. |
| Knowledge-graph integration approach (search, navigation, answers) | ✅ | Built in all three places. Ready to document. |
| Metadata and taxonomy/ontology mapping specification | ❌ | Needs the managed taxonomy (#15–16) first. |
| Ingestion and enrichment workflows (auto-classify, auto-tag, completeness checks, human review) | 🟡 | Pipeline, classification and review queue exist. Completeness rules missing. |
| Platform analytics data model (content health, adoption, search quality, governance) | 🟡 | Underlying tables exist (`ChatAuditLog`, `DocumentInteraction`, `KnowledgeGap`, `DocumentDuplicate`, `DocumentConflict`). No analytics model or dashboards. |
| RAG Q&A architecture (sources, citations, permission-filtered, evaluated) | 🟡 | Architecture is built. "**Evaluated**" (answer-quality evaluation) isn't. |

---

## 5. Beyond the EKP: Strengths to Lead With

KMS Tier 2 built capabilities the EKP section doesn't ask for. Several of them **cover parts of RFI products 2 and 3**, which helps if NYPA bundles the procurement.

| Capability | PRD rank | Relevance |
|---|---|---|
| **Automatic topic discovery** (self-building taxonomy, Bhattacharyya-distance domain assignment) | 4 | The PRD's named differentiator. A natural seed for NYPA's taxonomy work (#15). |
| **Live knowledge graph** in search, navigation and chat | 12, 13 | The proposal only promised "graph-ready". KMS delivered it. |
| **Expert Discovery**: who knows what, inferred from activity and human-confirmed | 9 | Supports proposal §1.2 / §8.2 (retiring workforce, onboarding). |
| **Decision Intelligence**: extracted decisions with human review and reversal/supersede tracking | 14 | Covers part of product 2 ("extract decisions"). |
| **Lessons Learned Intelligence**: AI-extracted draft lessons, reviewer gate, used in chat | 11 | Foundation for product 3 (see Appendix A). |
| **Contradiction detection** between documents | 5 | A content-quality signal the RFI doesn't ask for. |
| **Knowledge-gap detection** from unanswered questions | Tier 5 preview | Feeds content health and covers part of product 2 ("identify knowledge gaps"). |
| **Topic Evolution Tracking** | 16 | Trend analysis of how organizational knowledge shifts over time. |

---

## 6. Roadmap to Close the EKP Gaps

Ordered by risk to the proposal's commitments first, then by RFI coverage. Most items already exist in the PRD's Tier 3–4. The ✱ marks work the proposal **priced as implementation services**.

| Priority | Work package | Closes | PRD rank | Effort |
|---|---|---|---|---|
| **P0** | ✱ **SharePoint depth:** item-level permission inheritance, scheduled delta sync, site pages, deep links back to source, **Entra ID SSO** | #2, #12, #32, §5.3 | 28 | Large |
| **P0** | **Audit trail completion:** log lifecycle changes, deletes, classification overrides, decision and lesson reviews. Encrypt the stored OpenAI key. | #23, §5.4, §5.5 | 29 | Small |
| **P1** | **Analytics:** log search queries and no-result searches. Usage, adoption, search-quality and content-health dashboards built on existing tables. | #28–30, §15.1, §16.3 | (new) | Medium |
| **P1** | **Governance configurability:** configurable workflow stages and approvers, owner/steward fields, version history, supersede links, scheduled stale-content review, summary review step | #19, #21–26, #31 | 25, 26, 27, 30 | Large |
| **P1** | ✱ **Managed taxonomy:** admin-editable hierarchical terms and synonyms replacing the hard-coded list, seeded from auto-discovered topics, plus an import connector for NYPA's taxonomy tool | #3, #4, #15, #16 | (new, extends 4) | Large |
| **P2** | **Formats:** PPTX and images first, then audio/video transcription. Thumbnails. | #11, #13 | (23 for media) | Medium → Large |
| **P2** | **Personalization:** saved searches, watchlists/follow-topic, notifications, configurable landing page | #1, #5 | 17 | Medium |
| **P2** | ✱ **Further connectors:** ServiceNow (KB articles), Content Server | #2, #12 | — | Large |
| **P3** | **Answer explainability:** numeric confidence, "why this answer", relevance benchmark set | #10, §4.8 RAG "evaluated" | — | Small–Medium |
| **P3** | **Asset templates** (FAQ, How-To, SOP) | #14 | 24 | Medium |

**Quick wins (days, not weeks):**
- Call the existing `logAudit()` from the lifecycle, delete and review routes.
- Encrypt `Organization.openaiApiKey` with the existing `src/lib/crypto.js`.
- Add PPTX text extraction to the worker.
- Log search queries and zero-result searches.
- Schedule the existing stale-content, knowledge-gap and topic-snapshot scripts, and SharePoint sync.
- Show an answer summary box above search results.

---

## 7. Suggested Presentation Storyline

1. **Scope:** the RFI has three products. KMS targets the **Enterprise Knowledge Platform**.
2. **Where KMS is today:** the §1 scorecard, **8 met / 18 partial / 6 gap** across 32 EKP requirements, and the by-area breakdown.
3. **Demo the spine:** permission-aware hybrid search → chat with citations and confidence → graph navigation → needs-review queue → duplicate/conflict flags.
4. **Beyond what we proposed:** a live knowledge graph, expert discovery, decision intelligence, lessons learned (§5).
5. **Honest gaps:** the five points in §1, especially SharePoint permission inheritance and the audit trail.
6. **Plan:** the §6 roadmap. Point out that the ✱ items were priced as implementation work in the proposal.
7. **Decision needed:** approve the P0 items before any NYPA pilot.

---

## Appendix A: Bonus Coverage of RFI Products 2 and 3

KMS isn't targeting these, but partial coverage exists. Condensed view:

| Product | Requirement area | KMS coverage |
|---|---|---|
| **2. Semantic & Asset Creation** | Taxonomy/ontology management, SharePoint term-store sync | ❌. Only auto-discovered topics (rename, move, recluster). |
| | AI-assisted model development (term and relationship suggestions) | 🟡. Topic discovery and naming, relationship discovery, topic evolution. No HITL synonym/split/merge suggestions. |
| | Auto-classification triggers, volume, job monitoring | 🟡. Upload, update and manual triggers. No scheduled batch. Throughput (500 docs / 30 min) not benchmarked. |
| | Knowledge graph built and consumable downstream | 🟡. Graph built. Internal API only, no export or public API. |
| | Video/transcript segmentation, action items, procedures | ❌ |
| | Decisions and knowledge-gap extraction | 🟡. Decisions ✅ (with HITL). Gaps from chat ✅. Not from recorded events. |
| | AI first drafts of FAQ / How-To / Topic Guide with HITL | ❌. Summaries and draft lessons only. |
| **3. Lessons Learned** | Submit, review, edit UI | ✅. `LessonsPanel` on projects and departments. |
| | Configurable templates, mandatory fields, attachments | 🟡. Fixed 4-part template, single linked document. |
| | Publish workflow / decommission | 🟡 / ❌. Reviewer-gated publish. No archive or supersede. Hard delete. |
| | AI curation (edit suggestions, duplicate flags, trends) | 🟡. AI auto-extracts draft lessons from retrospectives. No duplicate or trend features. |
| | Semantic search, facets, personalized recommendations | 🟡. Keyword retrieval through chat. Project Intelligence (Rank 15) surfaces lessons per project. |
| | Push to Microsoft Teams | ❌ |

## Appendix B: Assumptions and Caveats

- **Attachment 2** (the RFI's detailed use-case and capability response form) wasn't available. It may add requirements (security certifications, accessibility, SLAs) not scored here.
- "Met" means the code path exists and is wired to the UI or API. It isn't load-tested or UAT-certified at NYPA scale.
- Each RFI bullet is weighted equally in the scorecard. In reality, **SharePoint (#2) is the only one marked mandatory**.

## Appendix C: Key Code References

| Area | Location |
|---|---|
| Hybrid search, expansion, graph expansion | `src/lib/hybridSearch.js`, `src/lib/vectorSearch.js`, `src/lib/keywordSearch.js`, `src/lib/queryExpansion.js`, `src/lib/knowledgeContext.js` |
| Org chat (RAG, citations, confidence, history, audit) | `src/app/api/org/[orgId]/chat/route.js` |
| Ingestion worker, extraction, OCR | `worker/index.js`, `worker/extractPdf.js`, `worker/runOcr.js`, `worker/extractSpreadsheet.js` |
| Classification, duplicates, needs-review | `worker/classify.js`, `src/app/api/org/[orgId]/needs-review/` |
| SharePoint connector, token encryption | `src/lib/msGraph.js`, `src/lib/connectors/`, `src/lib/crypto.js`, `src/app/api/org/[orgId]/integrations/sharepoint/` |
| Lifecycle state machine | `src/app/api/documents/[id]/lifecycle/route.js` |
| Stale content, knowledge gaps, conflicts | `scripts/task-8/flag-stale-documents.mjs`, `scripts/task-5d/` |
| Knowledge graph | `src/lib/knowledgeGraph.js`, `src/app/api/org/[orgId]/knowledge-graph/route.js` |
| Recommendations | `src/lib/recommendations.js`, `src/app/api/org/[orgId]/recommendations/` |
| Audit | `src/lib/auditLog.js` (3 call sites), `ChatAuditLog` |
| Health panel | `src/app/api/org/[orgId]/health/route.js` |
| Auth | `src/lib/auth.js` (Credentials and OTP providers only) |
