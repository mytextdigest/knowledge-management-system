# KMS Enterprise Knowledge Platform: Product Requirements Specification

| | |
|---|---|
| **Product** | KMS (Knowledge Management System) |
| **Document** | Product Requirements Specification (PRS), Enterprise Knowledge Platform |
| **Version** | 1.2 (draft), 2026-10-24: answers from NYPA's updated Q&A (10/22, #213–#238) added. 1.1, 2026-10-22: NYPA's RFP Q&A answers added (§6) |
| **Source** | NYPA RFP Q26-7821RJM, Attachment 1 §2.1 *Enterprise KM Platform Capabilities* (identical to RFI Q26-7772RJM §3.1) · NYPA's answers to vendor questions: `docs/ekp/Copy of Attachment 5 - Q+A format NYPA Response_updated10.22.26.xlsx` (cited as "Q&A #n"; #1–#212 are numbered as in the first version) |
| **Related** | `docs/ekp/EKP_IMPLEMENTATION_PLAN.md` (phases, workstreams, workflow) · `docs/NYPA_RFP_Q26-7821_KMS_GAP_ANALYSIS.md` (current status) |


## 1. Introduction

### 1.1 Purpose

This document specifies what KMS must do to fully satisfy the 32 Enterprise Knowledge Platform (EKP) requirements in NYPA's RFP. It is the reference the team builds and tests against.

- The **implementation plan** says *who* builds *what* and *when*.
- **This document** says *what the product must do* and *how we know it's done*.
- Each workstream's `REQUIREMENTS_EKP_<WS>.md` expands the relevant sections of this document into designs.

### 1.2 Scope

**In scope:** the 32 requirements of RFP §2.1, numbered **E1–E32** in RFP order.

**Out of scope:**
- RFP §2.2 (Semantic & Knowledge Creation) and §2.3 (Lessons Learned Management) capabilities.
- RFP §6 architecture and security guidelines. They're handled as platform work in Workstream G of the implementation plan, and §5 of this document lists only the non-functional requirements that the 32 rely on.
- Vendor services and project deliverables (RFP §3–§4).

### 1.3 How to read a requirement

Each requirement in §4 has:

| Field | Meaning |
|---|---|
| **RFP text** | NYPA's exact wording. This is what NYPA scores. |
| **Priority** | **Must**: required for RFP compliance. **Should**: the RFP calls it a "target capability". |
| **Status today** | Met, Partial or Gap, as of 2026-10-08 |
| **Functional requirements** | What the system must do, numbered `E<n>.<m>`. Each is individually testable. |
| **Acceptance criteria** | The conditions for marking the requirement Met. All must be demonstrable. |
| **Dependencies / notes** | Other requirements it relies on, open questions ("awaiting NYPA" = waiting on NYPA's answer) |

Requirement language: **must** = mandatory, **should** = expected unless there's a documented reason not to, **may** = optional.

### 1.4 Definitions

| Term | Meaning |
|---|---|
| **Org** | A tenant in KMS (e.g. NYPA). Contains departments, projects, documents and members. |
| **Document** | Any ingested knowledge item: an uploaded file, a synced file, a page or an article. |
| **Source system** | Where a document originates: KMS upload, SharePoint, Content Server, ServiceNow. |
| **Term / term set** | An entry in the managed taxonomy (E15). Terms can be nested and have synonyms. |
| **Owner / steward** | The person accountable for a document's accuracy (owner) and the person who maintains it (steward). See E24. |
| **Workflow** | A configurable sequence of stages a document passes through (e.g. submit → review → approve → publish). See E22 and E25. |
| **Answer** | An AI-generated response in conversational search, grounded in retrieved documents. |


## 2. Users and Roles

| Role (KMS) | Who | What they need from the EKP |
|---|---|---|
| **Org admin** (`super_admin`) | EKM program team, IT admins | Configure the platform, connectors, taxonomy, workflows and landing page. Org-wide dashboards. |
| **Department admin** (`dept_admin`) | Department knowledge leads | Approve and publish content, assign owners, run reviews, see department dashboards. |
| **Owner / steward** (assignment, not a role) | Subject-matter experts | Keep their documents accurate. Act on review and stale-content tasks. |
| **Member** | All employees | Search, ask questions, browse, upload, follow topics. |
| **Guest** | Limited or external users | Read-only access to what they're permitted to see. |

**NYPA's user numbers (Q&A #8, #69, #191):** about 2,600 users in total, about 200 KM power users (creators/editors), 5 KM team members and about 20 owners/administrators. **All ~2,500 users** need to view, create and contribute content in the EKP (Q&A #237), so every member is a contributor. The ~20 owners/administrators span all of NYPA's KM products: the 5-person KM team, IT technical owners and partners, and business superusers the KM team promotes (Q&A #237). NYPA and Canals share one Entra tenant. The KM team is the product owner and decides what is retained, archived or retired (Q&A #164, #166).

**Universal rule:** every requirement must respect role and document-level permissions. A user must never see, receive in an answer, or be cited content they can't access in KMS or in the source system.


## 3. Requirements Summary

| # | Requirement | Area | Priority | Status today |
|---|---|---|---|---|
| E1 | Customizable landing page | Access & navigation | Must | Partial |
| E2 | Unified, permission-respecting search across repositories | Access & navigation | Must (SharePoint) / Should (Content Server, ServiceNow) | Partial |
| E3 | Semantic/hybrid search with ontology-driven results | Access & navigation | Must | Partial |
| E4 | Faceted navigation on taxonomy/ontology | Access & navigation | Must | Partial |
| E5 | Role-based discovery, personal homepages, topic hubs, saved searches, watchlists | Personalization | Must | Partial |
| E6 | Recommendations and trending content | Personalization | Must | Met |
| E7 | Natural-language answers alongside search results | Conversational Q&A | Must | Met |
| E8 | Retrieval-augmented, cited, permission-aware answers | Conversational Q&A | Must | Met |
| E9 | Follow-up questions and refinement | Conversational Q&A | Must | Met |
| E10 | Confidence scores and explainability | Conversational Q&A | Must | Partial |
| E11 | Multiple asset formats (documents, PPT, PDF, video, images) | Content coverage | Must | Partial |
| E12 | Site pages, wikis and knowledge articles | Content coverage | Must | Gap |
| E13 | Indexing, previews and thumbnails | Content coverage | Must | Partial |
| E14 | Configurable asset templates | Content coverage | Must | Gap |
| E15 | Managed metadata with hierarchy and synonyms | Semantic layer | Must | Gap |
| E16 | Integration with NYPA's taxonomy/ontology tool | Semantic layer | Must | Gap |
| E17 | Knowledge-graph-enriched search, navigation and Q&A | Semantic layer | Must | Met |
| E18 | Easy (drag-and-drop) upload | Ingestion | Must | Met |
| E19 | Auto-generated description with human review | Automated metadata | Must | Partial |
| E20 | Auto-classification / auto-tagging with human review | Automated metadata | Must | Met |
| E21 | Minimum metadata completeness before publishing | Automated metadata | Must | Partial |
| E22 | Configurable publishing workflows | Governance | Must | Partial |
| E23 | Decommission workflows with audit trail | Governance | Must | Partial |
| E24 | Configurable ownership and stewardship | Governance | Must | Partial |
| E25 | Configurable review/validation workflows | Governance | Must | Gap |
| E26 | Stale content detection and review triggers | Governance | Must | Partial |
| E27 | Duplicate and near-duplicate detection | Governance | Must | Met |
| E28 | Content health dashboard | Analytics | Must | Partial |
| E29 | Usage and adoption dashboard | Analytics | Must | Partial |
| E30 | Search quality metrics | Analytics | Must | Partial |
| E31 | Governance metrics | Analytics | Must | Gap |
| E32 | M365 as single source of truth | Integration | Must | Partial |

**Totals:** Met 8 · Partial 18 · Gap 6


## 4. Functional Requirements

### 4.1 Unified Access, Search and Navigation

#### E1: Customizable landing page
- **RFP text:** "Provides a single knowledge platform, providing a landing page that can be customized to reflect NYPA/Canals organization and context."
- **Priority:** Must · **Status:** Partial. An org dashboard exists. Org home redirects to the user's department page. Nothing is admin-configurable.
- **Functional requirements:**
  - **E1.1** The system must provide a single org-level landing page as every user's entry point.
  - **E1.2** Org admins must be able to configure, without code changes: a title and welcome text, featured content (documents, topics, links), quick links, and which widgets appear (e.g. search, recommendations, trending, recent updates, announcements).
  - **E1.3** Org admins must be able to set org branding (logo, primary colours) applied across the UI.
  - **E1.4** Landing-page content must respect permissions. A featured item a user can't access isn't shown to them.
  - **E1.5** The landing page should support department-specific variants (e.g. NYPA vs. Canals).
- **Acceptance criteria:**
  - An org admin changes the welcome text, featured items, quick links, widgets and logo in settings, and all users see the change without a deployment.
  - A member who lacks access to a featured document doesn't see it.
- **Dependencies / notes:** Branding pairs with RFP §6 A7 (NYPA look and feel). NYPA says Sitecore is not part of the knowledge ecosystem and a SharePoint Online or Teams-based portal with NYPA's look and feel is acceptable (Q&A #70, #130, #153). NYPA and Canals content does not need to be kept separate (Q&A #110), so E1.5 is a "should" for presentation only, not for isolation.

#### E2: Unified, permission-respecting search across repositories
- **RFP text:** "Enables unified search across key repositories: SharePoint (mandatory), Content Server (target capability), ServiceNow (target capability), which respects original permissions."
- **Priority:** **Must** for SharePoint (the RFP's only *mandatory* item) · **Should** for Content Server and ServiceNow
- **Status:** Partial. SharePoint connector exists (Microsoft Graph, delta sync, sync-run history). Access is mapped per site to a department, not per file. Sync is manual. No Content Server or ServiceNow connector.
- **Functional requirements:**
  - **E2.1** A single search must return results from all connected repositories and KMS uploads in one ranked list, each labelled with its source system.
  - **E2.2** For each synced item, the system must capture the source system's access permissions (users and groups) and enforce them in search results, chat answers, citations, recommendations, previews and graph views.
  - **E2.3** Group-based permissions must be resolved for the signed-in user (e.g. Entra ID group membership), which requires user identity to be mapped to the source system (see E32).
  - **E2.4** Permission changes in the source system must take effect in KMS within one sync interval. Revoked access must remove the item from that user's results.
  - **E2.5** Sync must run on a configurable schedule as well as on demand, incrementally (only changed items).
  - **E2.6** Admins must be able to choose which sites/libraries (or equivalents) are connected, and map them to KMS departments.
  - **E2.7** Each connector must report sync status: last run, items found, items failed, errors.
  - **E2.8** Connectors for **OpenText Content Server** and **ServiceNow** should meet E2.1–E2.7. NYPA confirms both can be **added after launch** (Q&A #66).
- **Acceptance criteria:**
  - In a test SharePoint tenant, a file shared with User A but not User B appears in A's search and chat results and never in B's, including as a citation.
  - Removing A's access in SharePoint removes the file from A's results after the next sync.
  - Scheduled sync runs without manual action, and the sync history shows each run.
  - Content Server and ServiceNow: the same tests pass in a test instance of each.
- **Dependencies / notes:** E32 (Microsoft sign-in). NYPA's answers (see §6.2):
  - **SharePoint:** SharePoint Online in a **GCC** M365 tenant (not GCC High), identity is Entra ID (Q&A #108, #179). In scope at go-live: the Enterprise Knowledge Base (EKB) site (~1,000 documents and ~300 videos) plus 7 other sites (~150 items), about 1,500 files in total and growing (Q&A #132). NYPA will choose which subsets are indexed (Q&A #94). Content stays in place; no bulk migration (Q&A #58, #160).
  - **Permissions:** whether the solution reads sources with an application identity or as the signed-in user will be decided with NYPA's architecture and cyber teams during design (Q&A #179). The EKB is open to all users and no CEII is in scope (Q&A #102, #140), but we keep **per-file permissions** because the RFP text requires "respects original permissions".
  - **Content Server:** CE 25.4 in NYPA's private cloud; a connector can be installed inside NYPA's network; **OpenText Extended ECM for M365** is in use (Q&A #114, corrected in the 10/22 update; #161). Extended ECM connects Content Server with SharePoint and Teams, so some Content Server content may already be reachable through M365. About 500K knowledge assets in scope, not the 3 million records the RFI mentioned (Q&A #17). Storage is about 5 TB, growing to about 10 TB by year 3 (Q&A #92). How permissions are managed (AD groups or Content Server groups) is unanswered (Q&A #133).
  - **ServiceNow:** "Australia" release. The main Knowledge Base is open to all users; no script-based user criteria (Q&A #126, #161).
  - **Freshness:** NYPA gave two answers: "scheduled indexing should be ok" (Q&A #46) and "near real time, under 5 minutes" (Q&A #99). See NFR-6.

#### E3: Semantic/hybrid search with ontology-driven results
- **RFP text:** "Leverage semantic/hybrid search combining keyword and ontology-driven results."
- **Priority:** Must · **Status:** Partial. Hybrid search (vector + BM25), LLM query expansion and knowledge-graph expansion exist. No ontology.
- **Functional requirements:**
  - **E3.1** Search must combine keyword matching and semantic (meaning-based) matching in one ranking. *(Exists.)*
  - **E3.2** Search must expand queries using the managed taxonomy: a query matching a term or any of its synonyms must also match documents tagged with that term.
  - **E3.3** Ranking must boost documents tagged with terms related to the query (broader, narrower or related terms in the hierarchy).
  - **E3.4** Admins should be able to tune the weight of keyword, semantic and ontology signals.
- **Acceptance criteria:**
  - Searching a synonym returns documents tagged with the preferred term even when neither word appears in their text.
  - On an agreed test query set, ontology-enhanced ranking scores higher than ranking without ontology signals.
- **Dependencies / notes:** E15 (managed taxonomy).

#### E4: Faceted navigation on taxonomy/ontology
- **RFP text:** "Enables faceted navigation based on taxonomy/ontology."
- **Priority:** Must · **Status:** Partial. Flat repository filters (department, category, lifecycle, file type, date). No facets on search results.
- **Functional requirements:**
  - **E4.1** Search results and the repository must show facets built from the managed taxonomy, displayed as an expandable hierarchy with result counts.
  - **E4.2** Facets must combine with each other and with existing filters (department, source system, file type, date, lifecycle, owner).
  - **E4.3** Facet counts must only include documents the user can access.
  - **E4.4** Admins should be able to choose which term sets appear as facets.
- **Acceptance criteria:** a user narrows search results by selecting a parent term and then a child term, and the counts update correctly and never reveal inaccessible documents.
- **Dependencies / notes:** E15.

### 4.2 Personalization & Role-Aware Experience

#### E5: Role-based discovery, personal homepages, topic hubs, saved searches and watchlists
- **RFP text:** "Role-based discovery, personalized homepages, topic hubs, saved searches, and watchlists."
- **Priority:** Must · **Status:** Partial. Role- and department-scoped discovery, department pages, expert-by-topic pages and starred documents exist. No saved searches, watchlists or personal homepage.
- **Functional requirements:**
  - **E5.1** Discovery (search, browse, recommendations) must be scoped by the user's role and departments. *(Exists.)*
  - **E5.2** Each user must have a personal homepage showing their watchlist updates, saved searches, recommendations, recently viewed items and assigned tasks (reviews, approvals).
  - **E5.3** Each topic or taxonomy term must have a **topic hub** page: top documents, recent changes, related topics, experts, and related decisions and lessons.
  - **E5.4** Users must be able to save a search (query + filters) and re-run it in one click.
  - **E5.5** Users must be able to follow (watch) documents, topics and saved searches, and be notified (in-app, and email should be supported) when something they follow changes or a new matching document appears.
  - **E5.6** Users must be able to manage notification preferences.
- **Acceptance criteria:**
  - A user saves a search and follows a topic. When a new document matching both is published, it appears on their homepage and they receive a notification.
  - A topic hub shows only content the viewer may access.
- **Dependencies / notes:** Topic hubs use E15 terms where available, and auto-discovered topics otherwise.

#### E6: Recommendations and trending content (Met)
- **RFP text:** "Recommendations and trending content in users' domains."
- **Priority:** Must · **Status:** Met. Personal recommendations from activity and feedback, "trending in your department", and an effectiveness view for admins (`src/lib/recommendations.js`).
- **Functional requirements:**
  - **E6.1** The system must recommend documents based on the user's activity, department and related content.
  - **E6.2** The system must show trending content within the user's department(s).
  - **E6.3** Recommendations must respect permissions.
- **Acceptance criteria:** met today. Keep these working through all changes (regression tests).

### 4.3 Conversational Query & Answering

#### E7: Natural-language answers alongside search results
- **RFP text:** "Allow users to ask natural language questions and receive direct answers alongside traditional search results."
- **Priority:** Must · **Status:** Met. Org-wide chat answers questions. A hybrid search API exists. The answer isn't yet shown on the search results page.
- **Functional requirements:**
  - **E7.1** Users must be able to ask a question in natural language and receive a direct answer. *(Exists.)*
  - **E7.2** The search results page must show an AI answer (with citations) **above or beside** the traditional result list, for question-like queries.
  - **E7.3** Users must be able to continue from the answer into a full conversation.
- **Acceptance criteria:** typing a question in the main search box shows a cited answer and the ranked results on the same page.

#### E8: Retrieval-augmented, cited, permission-aware answers (Met)
- **RFP text:** "Answers must be retrieval-augmented, citing authoritative sources and respecting user permissions."
- **Priority:** Must · **Status:** Met. Retrieval is permission-filtered before generation. Answers carry typed citations (document, decision, lesson). Denied access attempts are logged in `ChatAuditLog`.
- **Functional requirements:**
  - **E8.1** Answers must be generated only from retrieved content the user is permitted to access.
  - **E8.2** Every answer must cite its sources, and each citation must open the source.
  - **E8.3** If the content doesn't support an answer, the system must say so instead of inventing one.
  - **E8.4** Every question, its cited sources and denied attempts must be logged.
  - **E8.5** Admins should be able to set up **topic-scoped assistants** that answer only from a chosen subset of content (e.g. a topic, term or collection), alongside the org-wide assistant used by the KM team.
- **Acceptance criteria:** met today for E8.1–E8.4. Must remain true once per-file source permissions (E2) are added.
- **Dependencies / notes:** E8.5 comes from NYPA: "Topic based agents should focus on a subset of content related to the topic. However, an agent on all content would be valuable for KM administrative purposes" (Q&A #98).

#### E9: Follow-up questions and conversational refinement (Met)
- **RFP text:** "Support follow-up questions and conversational refinement (e.g., 'Show me the latest version')."
- **Priority:** Must · **Status:** Met. Conversation history, active document/topic context and entity-aware retrieval exist.
- **Functional requirements:**
  - **E9.1** The system must interpret follow-up questions in the context of the conversation.
  - **E9.2** Requests such as "show me the latest version" must resolve to the newest version or the superseding document.
- **Acceptance criteria:** "show me the latest version" after a question about a superseded document returns the current one. *(Needs E23 version history and supersede links.)*

#### E10: Confidence scores and explainability
- **RFP text:** "Include confidence scores and explainability for AI-generated answers."
- **Priority:** Must · **Status:** Partial. High/medium/low confidence per answer, based on retrieval strength.
- **Functional requirements:**
  - **E10.1** Each answer must show a confidence score (numeric or banded, with the method documented).
  - **E10.2** Each answer must offer a "why this answer" explanation: which sources were used, how strongly each matched, and whether sources conflict or are stale.
  - **E10.3** Low-confidence answers must be visibly flagged and suggest next steps (refine the question, contact an expert).
  - **E10.4** Users should be able to give feedback (helpful / not helpful) that feeds quality metrics (E30).
- **Acceptance criteria:** for any answer, a user can see its confidence and expand an explanation listing the sources and their match strength.

### 4.4 Knowledge Content Coverage

#### E11: Multiple knowledge asset formats
- **RFP text:** "Supports multiple knowledge assets formats, including documents, PPTs, PDFs, videos, images, etc."
- **Priority:** Must · **Status:** Partial. PDF (with OCR for scans), DOCX, XLSX/XLS/CSV and TXT are supported.
- **Functional requirements:**
  - **E11.1** The system must ingest, index and cite **PPTX** (slide text and speaker notes, cited per slide).
  - **E11.2** The system must ingest **images** (PNG, JPG) using OCR and an AI-generated description.
  - **E11.3** The system must ingest **video and audio** (MP4, MP3). Citations must link to the timestamp. When a transcript file exists for a recording, the system must use it; otherwise it transcribes the audio.
  - **E11.4** Unsupported formats must be rejected with a clear message, not fail silently.
  - **E11.5** The system must ingest **VTT transcripts** (and Word transcripts) as timestamped text and link them to their recording when both are present.
  - **E11.6** The system must handle files up to **8 GB** (large videos) without loading the whole file into memory.
  - **E11.7** Video segmentation should produce a list of topic segments with start and end times that link into the recording.
- **Acceptance criteria:** a PPTX, an image, a short video and a video with a VTT transcript are each uploaded, appear in search, and can be cited in an answer with the right slide or timestamp.
- **Dependencies / notes:** This is NYPA's main content. The in-scope SharePoint files are mostly **PPT, PDF and MP4** (Q&A #44, #132). NYPA lists the file types as "MS Office files, PDF, mp3/mp4, VTT, potentially others" (Q&A #185). There are about 300 hours of recordings today, growing by about 120 hours a year (Q&A #62). Recordings are mostly Teams, some Zoom. Transcripts usually reach SharePoint as VTT or Word files. Recordings stay in the organizer's OneDrive unless moved to SharePoint (Q&A #18, #159). NYPA accepts working from existing transcripts rather than producing our own, and accepts the segment list in E11.7 as video segmentation (Q&A #18). Videos rarely exceed 3–4 GB but can reach 8 GB (Q&A #188). **OCR:** NYPA expects OCR on images, which are mostly unprocessed today (Q&A #96, #97, #115). One earlier answer said "No" to full OCR and transcription for Content Server (Q&A #34); the later answers take precedence.

#### E12: Site pages, wikis and knowledge articles
- **RFP text:** "Supports site pages, wikis and knowledge articles within connected systems."
- **Priority:** Must · **Status:** Gap. SharePoint sync ingests drive files only.
- **Functional requirements:**
  - **E12.1** The SharePoint connector must ingest site pages (modern pages and wiki pages) from connected sites, with admin include/exclude options.
  - **E12.2** The ServiceNow connector should ingest Knowledge Base articles (see E2.8).
  - **E12.3** Pages and articles must be searchable, citable and shown with their source type and a link back to the original.
  - **E12.4** Permissions must be enforced the same way as files (E2.2).
- **Acceptance criteria:** a SharePoint site page and a ServiceNow KB article each appear in search and can be cited with a link to the original.
- **Dependencies / notes:** ServiceNow scope is the Knowledge Base only, open to all users (Q&A #126). NYPA has no other intranet repositories beyond M365, Content Server, ServiceNow and SharePoint (Q&A #190). Structured SQL data is out of scope (Q&A #184).

#### E13: Indexing, previews and thumbnails
- **RFP text:** "Allows indexing and previews of common file types, and thumbnails for visual content."
- **Priority:** Must · **Status:** Partial. Full indexing and an in-app document viewer. No thumbnails.
- **Functional requirements:**
  - **E13.1** All supported formats must be full-text indexed. *(Exists for current formats.)*
  - **E13.2** Users must be able to preview supported formats in-app without downloading, including slides, images and video playback.
  - **E13.3** Search results and repository cards must show thumbnails for visual content (images, slides, PDF first page, video frame).
- **Acceptance criteria:** search results show thumbnails for a PDF, a PPTX and an image, and each previews in-app.

#### E14: Configurable templates for common knowledge asset types
- **RFP text:** "Provides configurable templates for common knowledge asset types."
- **Priority:** Must · **Status:** Gap. Not built.
- **Functional requirements:**
  - **E14.1** Org admins must be able to create templates (e.g. How-To Guide, FAQ, SOP, Key Takeaways) with defined sections, guidance text and required metadata fields.
  - **E14.2** Users must be able to create a new knowledge asset from a template in a KMS editor.
  - **E14.3** Assets created from templates must enter the publishing workflow (E22) and be searchable like any document.
  - **E14.4** Templates must be versioned. Changing a template doesn't alter existing assets.
- **Acceptance criteria:** an admin creates a "How-To" template, and a user creates, submits and publishes a How-To from it, which then appears in search.
- **Dependencies / notes:** E21, E22.

### 4.5 Content Enrichment and Semantic Layer Integration

#### E15: Managed metadata with hierarchical terms and synonyms
- **RFP text:** "Supports managed metadata fields, including hierarchical terms and synonyms."
- **Priority:** Must · **Status:** Gap. The category list is a fixed 7-value constant (`worker/classify.js`). Topics are flat and auto-discovered.
- **Functional requirements:**
  - **E15.1** Org admins must be able to create and manage **term sets** containing **terms**, with unlimited nesting (parent/child).
  - **E15.2** Each term must support synonyms, a description, and a status (active / deprecated).
  - **E15.3** Admins must be able to define **metadata fields** (e.g. Category, Asset Type, Facility) bound to a term set, single- or multi-valued.
  - **E15.4** Auto-classification (E20) must tag documents using the managed term sets instead of the hard-coded category list.
  - **E15.5** Deprecating or merging a term must re-point tagged documents without losing tags.
  - **E15.6** Auto-discovered topics should be offered to admins as candidate terms (human approval required).
  - **E15.7** Changes to term sets must be audit-logged.
- **Acceptance criteria:** an admin builds a 3-level term set with synonyms. New documents are auto-tagged from it. Searching a synonym finds the tagged documents (with E3).
- **Dependencies / notes:** Unblocks E3, E4, E16 and E21. Migrate the existing 7 categories into a default term set. Size to NYPA's taxonomy: about **2,600 terms in 8 levels** (Q&A #17, #177). The taxonomy covers both NYPA and Canals concepts. NYPA wants us to leverage and enhance it, not design a new one (Q&A #186, #207).

#### E16: Integration with NYPA/Canals' taxonomy/ontology tool
- **RFP text:** "Integrates with NYPA/Canal's current taxonomy/ontology tool for controlled vocabularies."
- **Priority:** Must · **Status:** Gap. Not built.
- **Functional requirements:**
  - **E16.1** The system must import term sets from an external taxonomy/ontology source into the E15 model, preserving hierarchy, synonyms and IDs.
  - **E16.2** The import must support standard exchange formats (**SKOS as RDF/XML and Turtle (TTL)**, and CSV) and should support a direct connector to Progress Semaphore's API or to the SharePoint term store.
  - **E16.3** Re-sync must update changed terms and flag removed ones without breaking document tags.
  - **E16.4** Externally managed term sets must be read-only in KMS (the external tool is the master).
  - **E16.5** For SharePoint-synced documents, the connector should import the **existing managed-metadata tags** (term-store values already on the item) as document tags, instead of only re-classifying the document. If EKB content is ever moved into KMS, its existing metadata must be preserved (Q&A #234).
- **Acceptance criteria:** a SKOS export (RDF/XML or TTL) from a taxonomy tool is imported, documents are tagged with its terms, and a re-import with changes updates them correctly. A synced SharePoint item that already has managed-metadata values arrives with those terms attached.
- **Dependencies / notes:** E15. NYPA's tool is **Progress Semaphore**, including Classification Server. Its model is synced into the SharePoint term store. It can be reached by API and exported as SKOS/RDF/TTL (Q&A #59, #113, #128, #177). Semaphore already auto-classifies about **250,000 items across 60 SharePoint sites and 200 libraries** (Q&A #128), so many documents already carry terms. Semaphore's future is undecided: its contract runs to the end of 2026, and NYPA asks vendors to evaluate it alongside alternatives (Q&A #60, #113, #200). KMS must work with Semaphore and also be able to act as the taxonomy master if NYPA chooses that.

#### E17: Knowledge-graph-enriched search, navigation and conversational querying (Met)
- **RFP text:** "Integration with Knowledge Graphs to support: graph-enriched search to boost results based on relationships, graph-enriched navigation for advanced discovery, and graph-enriched conversational querying to enhance accuracy and relevance of responses."
- **Priority:** Must · **Status:** Met. Relationship discovery and an org knowledge graph are used in search (related-document expansion), navigation (graph explorer) and chat.
- **Functional requirements:**
  - **E17.1** Search ranking must use graph relationships to boost related results. *(Exists.)*
  - **E17.2** Users must be able to explore the graph from any document, topic, person or project. *(Exists.)*
  - **E17.3** Conversational answers must draw on graph relationships. *(Exists.)*
  - **E17.4** Once E15 exists, taxonomy terms should become graph nodes, linking documents through shared terms.
- **Acceptance criteria:** met today. E17.4 is an enhancement.
- **Dependencies / notes:** NYPA expects no knowledge-graph use cases beyond taxonomy-driven search, navigation and content discovery. An embedded or a standalone graph is acceptable, and no downstream system consumes the graph (Q&A #116, #193). However, NYPA **doesn't maintain any enterprise knowledge graph today** and expects the vendor to "design/implement/operationalize a new knowledge graph" (Q&A #227). KMS already does this, so it's a differentiator to show in the proposal and demo. No further graph work is needed for the RFP beyond E17.4.

### 4.6 Content Ingestion

#### E18: Easy upload interface (Met)
- **RFP text:** "Easy upload interface to allow users to upload content (drag and drop or upload)."
- **Priority:** Must · **Status:** Met. Drag-and-drop batch upload with category and department selection.
- **Functional requirements:**
  - **E18.1** Users must be able to upload files by drag-and-drop or file picker, several at once, with progress and errors shown.
  - **E18.2** Upload must accept all formats supported under E11.
- **Acceptance criteria:** met today. Extend the accepted types as E11 lands.

### 4.7 Automated Metadata Generation

#### E19: Auto-generated description with human review
- **RFP text:** "At content ingest, generates brief description of document, with human-in-the-loop review."
- **Priority:** Must · **Status:** Partial. AI summary, key points and reading guide are generated for every document. No review step.
- **Functional requirements:**
  - **E19.1** At ingest, the system must generate a brief description (2–3 sentences) and a longer summary. *(Exists.)*
  - **E19.2** Generated descriptions must start in a **pending review** state, visibly marked as AI-generated.
  - **E19.3** The owner or a reviewer must be able to approve, edit or regenerate the description. The approver, time and any edits are recorded.
  - **E19.4** Admins should be able to configure whether description approval is required before publishing (links to E21), **per department or category**, so critical content can require approval while other content doesn't.
- **Acceptance criteria:** a new document shows a "pending review" AI description, and a reviewer edits and approves it, with the change recorded in the audit log.
- **Dependencies / notes:** NYPA: "Some level of human review should be required for any/all AI-generated content, but it shouldn't need to be overly burdensome. Greater scrutiny should be required of more highly technical and critical knowledge content" (Q&A #195). This applies to E19, E20 and E22. Keep review quick (one-click approve, bulk approve) and put stricter rules on critical content.

#### E20: Auto-classification / auto-tagging with human review (Met)
- **RFP text:** "At content ingest/update, enables autoclassification/auto-tagging, with human-in-the-loop review."
- **Priority:** Must · **Status:** Met. Category and department are suggested with confidence thresholds. Low-confidence results go to the Needs Review queue. Classification re-runs when a file is replaced or a synced file updates.
- **Functional requirements:**
  - **E20.1** Documents must be auto-classified at ingest and on update. *(Exists.)*
  - **E20.2** Below a confidence threshold, suggestions must go to a human review queue. *(Exists.)*
  - **E20.3** Classification must use the managed term sets once E15 exists.
  - **E20.4** Confidence thresholds should be admin-configurable (currently environment variables).
- **Acceptance criteria:** met today for categories. E20.3–E20.4 follow E15.

#### E21: Minimum metadata completeness before publishing
- **RFP text:** "Establishes minimum metadata completeness thresholds for documents before publishing."
- **Priority:** Must · **Status:** Partial. Only a classification-confidence gate exists.
- **Functional requirements:**
  - **E21.1** Org admins must be able to define required metadata fields, globally and per content type, category or department (e.g. owner, category, at least one term, approved description).
  - **E21.2** Publishing must be blocked until all required fields are complete, with a clear list of what's missing.
  - **E21.3** Each document should show a completeness indicator (e.g. 4 of 5 required fields).
  - **E21.4** Incomplete documents must be reportable (feeds E28).
- **Acceptance criteria:** with "owner" and "category" required, a document missing an owner can't be published, and the UI says why.

### 4.8 Governance and Content Lifecycle Management

#### E22: Configurable publishing workflows
- **RFP text:** "Enables publishing workflows (submission → review → approval → publish) with configurable stages and role-based approvers."
- **Priority:** Must · **Status:** Partial. Fixed draft → published transition by a department admin or org admin.
- **Functional requirements:**
  - **E22.1** Org admins must be able to define workflows with any number of ordered stages (e.g. Submit → Technical Review → Approval → Publish).
  - **E22.2** Each stage must specify approvers by role, by owner/steward, or by named users or groups, and whether one or all approvers must approve.
  - **E22.3** Workflows must be assignable per department and/or content type or category.
  - **E22.4** Approvers must be notified, and must be able to approve, reject (with comment) or request changes.
  - **E22.5** An author must never be able to approve their own submission.
  - **E22.6** Every workflow action must be audit-logged (who, what, when, comment).
  - **E22.7** Users must see the current stage and history of each document.
- **Acceptance criteria:** an admin configures a 3-stage workflow for one department. A member submits a document, two approvers act in turn with notifications, and the document publishes only after the final approval, with the full history visible.
- **Dependencies / notes:** One workflow engine should serve E22, E25 and E14.

#### E23: Decommission workflows with audit trail
- **RFP text:** "Offers decommission workflows (archive/retire, supersede, delete with audit trail)."
- **Priority:** Must · **Status:** Partial. Archive and retire states exist, and delete is a hard delete. The audit log doesn't record document events. Replacing a file overwrites it with no version history.
- **Functional requirements:**
  - **E23.1** Documents must support **archive** (hidden from default search, still retrievable) and **retire** (removed from search and answers).
  - **E23.2** A document must be markable as **superseded by** another. Search and answers prefer the newer document and link to it from the old one.
  - **E23.3** Replacing a file must create a **new version**, keeping prior versions viewable and restorable.
  - **E23.4** Delete must be restricted to authorized roles and should be a soft delete with a configurable retention period before permanent removal.
  - **E23.5** Every lifecycle action (publish, archive, retire, supersede, restore, delete, version change) must write an audit entry: actor, action, document, timestamp, and before/after state.
  - **E23.6** Decommission actions should be able to require approval through E22-style workflows.
- **Acceptance criteria:** archiving, superseding and deleting a document each appear in the audit log with actor and timestamp, and a superseded document's page links to its replacement.
- **Dependencies / notes:** NYPA has no official retention schedule for knowledge ("life of org"). It does not need retention enforcement, legal hold or records-request handling (Q&A #181, #187). The E23.4 retention period is only the window for restoring soft-deleted items. It should allow "never purge". The KM team decides what is retained, archived, restricted or retired (Q&A #166).

#### E24: Configurable ownership and stewardship
- **RFP text:** "Enables configurable ownership and stewardship assignment."
- **Priority:** Must · **Status:** Partial. Ownership is implicit (uploader, department admin).
- **Functional requirements:**
  - **E24.1** Every document must have an **owner**, and may have one or more **stewards**.
  - **E24.2** Defaults must be configurable (e.g. owner = uploader, or the department's designated owner).
  - **E24.3** Admins must be able to reassign owners and stewards individually and in bulk (e.g. when someone leaves).
  - **E24.4** Owners and stewards must receive the review, stale-content and approval tasks for their documents.
  - **E24.5** Documents without an owner must be flagged (feeds E28).
- **Acceptance criteria:** an admin bulk-reassigns all of one user's documents to another user, and the new owner receives their open review tasks.

#### E25: Configurable review/validation workflows
- **RFP text:** "Configurable review/validation workflows."
- **Priority:** Must · **Status:** Gap. Review flows exist only for classification and decisions, fixed in code.
- **Functional requirements:**
  - **E25.1** Admins must be able to define review policies: which documents (by category, term, department or content type), how often (e.g. every 12 months), and who reviews (owner, steward, role).
  - **E25.2** When a review is due, the reviewer must receive a task and notification.
  - **E25.3** Reviewers must record an outcome: still valid, needs update, or retire. Each outcome triggers the next step (re-certify, start an update, or decommission via E23).
  - **E25.4** Overdue reviews must escalate (e.g. to the department admin) after a configurable period.
  - **E25.5** Review history must be kept per document.
- **Acceptance criteria:** with an annual policy configured, a document past its review date creates a task for its owner, and marking it "still valid" resets the due date and records the outcome.
- **Dependencies / notes:** Shares the workflow engine with E22. Uses E24 for reviewers.

#### E26: Stale content detection and automated review triggers
- **RFP text:** "Stale content detection and automated review triggers."
- **Priority:** Must · **Status:** Partial. A manual script flags documents not cited in N days and suggests archiving them.
- **Functional requirements:**
  - **E26.1** Stale detection must run automatically on a schedule.
  - **E26.2** Staleness rules must be configurable: no updates in N days, no views or citations in N days, review overdue, or source item deleted.
  - **E26.3** A stale document must automatically create a review task for its owner (E25), with a notification.
  - **E26.4** Stale documents should be visibly marked in search and answers (feeds E10 explainability).
- **Acceptance criteria:** a document meeting the staleness rule automatically generates a review task for its owner within one scheduled run, without manual action.
- **Dependencies / notes:** NYPA confirms the solution "should be able to facilitate content reviews for staleness" and allow metadata enrichment of content (Q&A #194). Content remediation itself (cleanup, taxonomy alignment) is done by NYPA, not the vendor (Q&A #104, #105).

#### E27: Duplicate and near-duplicate detection (Met)
- **RFP text:** "Detects duplicate documents; flags related/near-duplicate documents."
- **Priority:** Must · **Status:** Met. Exact (content hash) and near-duplicate (embedding similarity ≥ 0.92) detection, with a review state. Related documents and contradictions are also flagged.
- **Functional requirements:**
  - **E27.1** Exact duplicates must be detected at ingest.
  - **E27.2** Near-duplicates and related documents must be flagged for review.
  - **E27.3** Duplicate detection must work across source systems (an upload vs. a SharePoint copy).
- **Acceptance criteria:** met today for uploads. Verify E27.3 once more connectors land.
- **Dependencies / notes:** NYPA says duplicate content "is not believed to be an issue" (Q&A #194). Keep E27 working, but don't add more work here.

### 4.9 Analytics and Dashboards

All dashboards must:
- respect permissions (department admins see their departments; org admins see everything);
- be filterable by department, source system and date range;
- link from each metric to the underlying items;
- be exportable (CSV), with data available to BI tools (RFP §6 A5: Power BI / Tableau).

#### E28: Content health dashboard
- **RFP text:** "Content health dashboard: recency, ownership coverage, review status, broken links, duplicates."
- **Priority:** Must · **Status:** Partial. A health panel shows answer confidence, open conflicts and knowledge gaps.
- **Functional requirements:**
  - **E28.1** **Recency:** distribution of documents by age and time since last update. Count of stale documents (E26).
  - **E28.2** **Ownership coverage:** % of documents with an owner (E24). List of unowned documents.
  - **E28.3** **Review status:** documents current, due or overdue for review (E25).
  - **E28.4** **Broken links:** documents containing hyperlinks that fail validation, and synced items whose source was deleted. Links must be checked on a schedule.
  - **E28.5** **Duplicates:** open duplicate and near-duplicate flags (E27).
  - **E28.6** Metadata completeness (E21) should also be shown.
- **Acceptance criteria:** the dashboard shows all five measures, and clicking any measure lists the affected documents.

#### E29: Usage and adoption dashboard
- **RFP text:** "Usage & adoption dashboard: searches, click-through rates, time-to-answer, top queries, bounce rate."
- **Priority:** Must · **Status:** Partial. Questions, citations and document views (with dwell time) are logged. Searches aren't logged, and there's no dashboard.
- **Functional requirements:**
  - **E29.1** Every search and question must be logged (user, query, filters, result count, timestamp), along with the result clicks that follow.
  - **E29.2** The dashboard must show search and question volume, active users, **click-through rate**, **time-to-answer** (query to first click or answer), **top queries**, and **bounce rate** (searches with no click or follow-up), over time.
  - **E29.3** Adoption should be shown by department and role.
- **Acceptance criteria:** after test activity, all five named metrics show correct values for the selected period and department.

#### E30: Search quality metrics
- **RFP text:** "Search quality metrics: precision/recall proxies, 'no-results' queries, dwell time."
- **Priority:** Must · **Status:** Partial. Knowledge-gap detection from zero-citation or low-confidence questions. Dwell time is recorded.
- **Functional requirements:**
  - **E30.1** **No-results queries** must be listed with frequency.
  - **E30.2** **Precision/recall proxies:** click-through at top-k, reformulation rate, answer feedback (E10.4), and the share of low-confidence answers.
  - **E30.3** **Dwell time** on clicked results must be reported.
  - **E30.4** Knowledge gaps must link to the queries that produced them.
  - **E30.5** An offline evaluation set (queries with expected results) should be supported, to measure ranking changes (used by E3).
- **Acceptance criteria:** a query returning nothing appears in the no-results list, and CTR@k, reformulation rate and dwell time are reported per period.

#### E31: Governance metrics
- **RFP text:** "Governance metrics: review/validation compliance."
- **Priority:** Must · **Status:** Gap. Not built.
- **Functional requirements:**
  - **E31.1** Show the % of documents reviewed on time per review policy (E25), and overdue reviews by department and owner.
  - **E31.2** Show publishing workflow metrics (E22): items in each stage, average time to approve, rejection rate.
  - **E31.3** Show ownership coverage (E24) and metadata completeness (E21) as compliance measures.
  - **E31.4** Show decommission activity (E23) over time.
- **Acceptance criteria:** with review policies active, the dashboard shows the compliance % and overdue reviews per department, consistent with the underlying tasks.
- **Dependencies / notes:** E21–E25.

### 4.10 Integration and Authoring

#### E32: M365 as single source of truth
- **RFP text:** "Integrates with M365 for single source of truth storage."
- **Priority:** Must · **Status:** Partial. SharePoint/OneDrive files are read via Graph and copied into KMS storage. No Microsoft sign-in.
- **Functional requirements:**
  - **E32.1** Users must be able to sign in with their organization's Microsoft (Entra ID) account. SAML 2.0 must be supported, and OIDC may be.
  - **E32.2** For M365-sourced documents, M365 must remain the master copy. KMS stores only what it needs to index (text, embeddings, metadata). Storing original-file copies must be optional (off by default).
  - **E32.3** Every M365-sourced item must offer "Open in SharePoint/Office" as a deep link.
  - **E32.4** Previews of M365 items should be fetched from M365 on demand when no local copy is kept.
  - **E32.5** Edits must happen in M365. KMS picks them up on the next sync (E2.4).
  - **E32.6** Writing KMS tags back to SharePoint managed metadata may be supported.
  - **E32.7** KMS search and cited answers should be available to **Microsoft 365 Copilot Chat** through an API, an MCP server or a Copilot connector, enforcing the calling user's permissions.
- **Acceptance criteria:** a user signs in with Microsoft, finds a SharePoint document, opens it in SharePoint from KMS, edits it there, and sees the update in KMS after the next sync.
- **Dependencies / notes:** E2. Supports RFP §6 S2 (Active Directory integration) and S9 (US data residency).
  - **Tenant:** NYPA's M365 G5 tenant is **GCC** (not GCC High), so Microsoft Graph and sign-in use the standard commercial endpoints. NYPA's Azure is believed to be Commercial (Q&A #108). Moving NYPA data between GCC and Commercial environments must be explicitly approved and documented (Q&A #180).
  - **Licences:** NYPA has Copilot and SharePoint Premium under its GCC licence (Q&A #63). Pay-as-you-go SharePoint Premium (Syntex) processing is not permitted (Q&A #129), so KMS can't rely on it for extraction or tagging. Power Apps Premium is not assigned to creators or admins (Q&A #134).
  - **E32.7 (Copilot):** NYPA uses M365 Copilot Chat (with no custom Copilot Studio agents in production) and wants retrieved content available to it "through API's/MCP/connectors". NYPA's M365 Governance Review Team approves connection patterns (Q&A #47). Only a limited number of users have M365 Copilot (for Work); everyone has Copilot (for web) (Q&A #111). Copilot already reaches all M365 content a user can access (Q&A #150), so KMS's value there is its curated, governed, cited answers.
  - **Sign-in protocol:** NYPA hasn't said whether SAML 2.0 or OIDC is preferred. Keep both (Workstream A, AS-4).


## 5. Non-Functional Requirements

These apply to all 32 requirements. Targets marked *(proposed)* need team agreement.

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Security | Permissions are enforced server-side in every API, search query, answer, preview, dashboard and export. Never only in the UI. |
| NFR-2 | Security | Every state change (publish, approve, delete, reassign, configuration change) is recorded in the audit log. |
| NFR-3 | Configurability | Thresholds, term sets, workflows, review policies, required fields and landing-page content are editable in admin settings, not code or environment variables (RFP §6 A1). |
| NFR-4 | Performance | Search results p95 ≤ 2 s. First token of an answer p95 ≤ 4 s *(proposed)*. NYPA's stated limit is under 10 s for search and AI answers (Q&A #48). |
| NFR-5 | Throughput | Ingestion and classification sustain at least 500 documents in 30 minutes. NYPA confirms this is a **firm minimum**, matching what they do today (Q&A #65). |
| NFR-6 | Freshness | Source-system changes, including permission changes, reflected within one sync interval. Default ≤ 60 minutes *(proposed)*. The interval must be configurable **down to 5 minutes**, because NYPA answered both "scheduled indexing should be ok" (Q&A #46) and "near real time, under 5 minutes" (Q&A #99). |
| NFR-7 | Data residency | Content, indexes and AI processing stay in the continental US (RFP §6 S9). NYPA permits no offshore resources, including staff who can access NYPA data (Q&A #71–#73). |
| NFR-8 | Usability | All features work in current Chrome and Edge. Admin settings need no technical knowledge. |
| NFR-9 | Quality | Each requirement ships with automated tests (`node --test`), including permission tests for a member and a guest. |
| NFR-10 | Scale | Sized for about 2,600 users with **100 concurrent users at peak** (Q&A #48, #69), about 1,500 SharePoint files at go-live growing 10–20% a year, and up to about 500K Content Server assets (about 5–10 TB) once that connector is added (Q&A #17, #92, #93). |
| NFR-11 | AI data use | NYPA content must never be used to train a vendor's models without explicit authorization. This must be enforced contractually and technically (Q&A #180). Each AI provider and hosting model is approved case by case. NYPA has no mandated AI service, such as Azure OpenAI (Q&A #32, #64). |
| NFR-12 | Data portability | All data and metadata can be exported in standard, non-proprietary formats. KMS is documented with architecture diagrams, ERDs and OpenAPI specifications. Proprietary elements are identified (Q&A #155). |
| NFR-13 | Language | English only (Q&A #103). |


## 6. Assumptions and Open Questions

### 6.1 Assumptions

Updated 2026-10-22 from NYPA's answers to other vendors' RFP questions. NYPA confirmed that its RFI answers remain valid (Q&A #107, #183).

| Assumption | Status |
|---|---|
| NYPA uses **SharePoint Online** (M365), and per-file permissions are required. | SharePoint Online **confirmed** (GCC tenant). Per-file is kept by our choice (see Q1). |
| Microsoft sign-in is through **Entra ID**. NYPA registers the KMS application after award. | **Confirmed.** NYPA and Canals share one tenant (Q&A #179). |
| Test instances of Content Server and ServiceNow are provided after award. | Partly confirmed: non-production environments exist, and NYPA would consider giving vendors access for testing (Q&A #136). |
| NYPA's taxonomy tool can export SKOS or CSV. | **Confirmed:** SKOS/RDF/TTL (Q&A #113). |

### 6.2 Answers to our open questions

We didn't send these questions ourselves. Other vendors asked equivalent questions, and NYPA's answers are below.

| # | Question | NYPA's answer | Affects |
|---|---|---|---|
| Q1 | Is per-file permission inheritance required at go-live? | **Not answered directly.** Whether to read sources with an application identity or as the signed-in user will be decided with NYPA's architecture and cyber teams during design (Q&A #179). The EKB is open to all users (Q&A #102). **Decision:** keep per-file permissions. | E2 |
| Q2 | SharePoint Online only, or on-premises too? | **SharePoint Online**, GCC tenant (Q&A #108). | E2, E12, E32 |
| Q3 | Are Content Server and ServiceNow needed at go-live? | **No, they can be added later** (Q&A #66). | E2, E12 |
| Q4 | SAML 2.0 or OIDC preferred? | **Not answered.** Entra ID is the identity provider (Q&A #179). Keep both. | E32 |
| Q5 | Which taxonomy/ontology tool does NYPA use? | **Progress Semaphore**: ~2,600 terms, 8 levels, synced to the SharePoint term store, API access, SKOS/RDF/TTL export (Q&A #59, #113, #177). | E15, E16 |
| Q6 | Which ServiceNow modules should be searchable? | **Knowledge Base**, open to all users, no script-based user criteria (Q&A #126). | E2, E12 |

### 6.3 Other NYPA notes that affect the product

**Scope and approach**
- **NYPA's main pain point:** knowledge is spread across systems and isn't indexed or searchable through a single interface (Q&A #238). That is E2 (unified search), and the proposal should lead with it.
- **AI at go-live:** NYPA wants "ideally all" of conversational search, auto-tagging, metadata generation, summarization, FAQ generation, knowledge extraction and recommendations in the initial phase (Q&A #224). KMS covers most of them. **FAQ generation** is the gap; it belongs to RFP §2.2 (not E1–E32), but it should be shown if possible.
- **Copilot isn't the main interface:** NYPA doesn't see Copilot or any agent as the primary discovery interface (Q&A #225). KMS's own search and chat UI stays central, and E32.7 stays a "should".
- **Taxonomy master:** NYPA is open to alternatives to Semaphore, and its taxonomy model is portable (Q&A #222). KMS's taxonomy (E15/E16) could become the master, not just import from Semaphore.
- **Go-live content:** SharePoint content as it exists today. Content Server, ServiceNow and other sources come later (Q&A #235). No content must be migrated; Content Server and ServiceNow content stays in place (Q&A #223, #234).
- **Rollout:** NYPA is leaning toward an enterprise-wide rollout, with some phasing if it makes sense (Q&A #236).
- **Architecture and performance in the proposal:** submit a vendor-recommended search architecture; the in-scope repositories have APIs (Q&A #226). Vendors must **share their own performance statistics** (Q&A #230). Measure search and answer latency, the 5,000-document permission load test and the 500-documents-in-30-minutes classification run.
- **Lessons learned:** integration with the EKP is preferred but not required (Q&A #228).
- NYPA is seeking a **technology solution**, not a broader KM programme (Q&A #204). Both a COTS product and a custom solution are acceptable (Q&A #211). A SharePoint/M365-based or a new platform are both acceptable (Q&A #54, #199).
- The existing SharePoint setup "is functional and can be integrated with and/or enhanced" rather than rebuilt (Q&A #206).
- Out of scope: structured SQL data (Q&A #184); languages other than English (Q&A #103); vendor-led content remediation, taxonomy development, metadata mapping and migration, which NYPA does itself (Q&A #104, #105); and business-process or workflow-development services (Q&A #41).

**Deployment and operations (Workstream G)**
- **Hosting:** vendor-managed SaaS with logical separation, hosted in the US, with **SOC 2 Type II**, is acceptable (Q&A #19). Single-cloud SaaS is acceptable (Q&A #152). PaaS in NYPA's own Azure subscription is also acceptable (Q&A #109). Alternative deployment options may be priced (Q&A #29). Cloud hosting and licences must be included in the price (Q&A #68).
- **Environments:** four are required: Development, Test, QA and Production (Q&A #67).
- **Recovery:** recovery time and recovery point objectives (RTO/RPO) are 48 hours (Q&A #100, #101).
- **SOC 2 Type II** must be submitted with the proposal. A penetration test alone is not a substitute (Q&A #33, #143, #156).
- **Open source:** components are reviewed and approved case by case, so keep a software bill of materials (SBOM) (Q&A #192).
- **After launch:** NYPA's IT team runs the solution, and the vendor handles complex (level 3) issues (Q&A #81, #138, #182).
- **Training:** a train-the-trainer model for the KM team, IT owners and admins (about 3 IT support staff, 6 admins and 200 everyday users to reach) (Q&A #80, #141).

**Demo and dates**
- The proposal deadline moved to **4 Nov 2026** (Q&A #82, #147, #148).
- A **working demo** is required within two weeks of notification. NYPA data isn't needed, but the demo must not be slides or screenshots and must be consistent with NYPA's government-restricted status (Q&A #84, #173). Build the demo data to match NYPA's content: an EKB-like library of PPT, PDF and MP4 files with VTT transcripts, and an 8-level SKOS taxonomy.
- The project starts in January with "an expedited timeline". It is a fixed-price, 3-year term, and EKP is priced and evaluated separately from Semantic and LLMT (Q&A #13, #77, #78, #119).

**Related capabilities outside §2.1 (useful for reuse)**
- Recommendations should be pushed into **Teams channels or groups** (Q&A #189, Lessons Learned scope). E6 recommendations could feed this.
- About 350 lessons learned are stored in the SharePoint EKB, and all 2,600 users may contribute (Q&A #57, #142).
- Knowledge-transfer events: about 60 a year, rising to about 120, each 1–3 hours or longer (Q&A #17, #117).

**Unanswered or contradictory (don't build on these yet)**
- Go-live and final acceptance criteria, and NYPA's staffing for the project: "to be determined" (Q&A #232, #233).
- Knowledge graph: "no use cases beyond taxonomy-driven search" (Q&A #193) vs. "vendor to design and operationalize a new knowledge graph" (Q&A #227). Both are satisfied by E17 as built.
- Accessibility standard (WCAG / Section 508) (Q&A #131).
- How Content Server permissions are managed (AD vs. Content Server groups) (Q&A #133).
- Azure landing zone and networking (Q&A #137); Teams app and Power Platform DLP policies (Q&A #135).
- Whether LLM endpoints are provided by NYPA or the vendor (Q&A #106).
- Freshness: "scheduled is ok" vs. "under 5 minutes" (see NFR-6).
- OCR: "No" (Q&A #34) vs. "Yes, OCR all images and video" (Q&A #96, #115). We follow the later answers.


## 7. Traceability

| PRS requirement | RFP §2.1 heading | Workstream (implementation plan) |
|---|---|---|
| E1–E4 | Unified Access, Search and Navigation | F (E1) · A (E2) · C (E3, E4) |
| E5–E6 | Personalization & Role-Aware Experience | F (E5) · met (E6) |
| E7–E10 | Conversational Query & Answering | F (E7, E10) · met (E8, E9) |
| E11–E14 | Knowledge Content Coverage | E (E11, E13, E14) · A (E12) |
| E15–E17 | Content Enrichment and Semantic Layer Integration | C (E15, E16) · met (E17) |
| E18 | Content Ingestion | met |
| E19–E21 | Automated Metadata Generation | B (E19, E21) · met (E20) |
| E22–E27 | Governance and Content Lifecycle Management | B (E22–E26) · met (E27) |
| E28–E31 | Analytics and Dashboards | D (E28–E30) · B (E31) |
| E32 | Integration and Authoring | A |

**Change control:** changes to this document go through a PR reviewed by Johurul and at least one other team member. Any change to an "Acceptance criteria" item must also be reflected in the affected workstream's requirements doc and tracker.
