# KMS Enterprise Knowledge Platform: Product Requirements Specification

| | |
|---|---|
| **Product** | KMS (Knowledge Management System) |
| **Document** | Product Requirements Specification (PRS), Enterprise Knowledge Platform |
| **Version** | 1.0 (draft), 2026-10-11 |
| **Source** | NYPA RFP Q26-7821RJM, Attachment 1 §2.1 *Enterprise KM Platform Capabilities* (identical to RFI Q26-7772RJM §3.1) |
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
- **Dependencies / notes:** Branding pairs with RFP §6 A7 (NYPA look and feel).

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
  - **E2.8** Connectors for **OpenText Content Server** and **ServiceNow** should meet E2.1–E2.7 (awaiting NYPA).
- **Acceptance criteria:**
  - In a test SharePoint tenant, a file shared with User A but not User B appears in A's search and chat results and never in B's, including as a citation.
  - Removing A's access in SharePoint removes the file from A's results after the next sync.
  - Scheduled sync runs without manual action, and the sync history shows each run.
  - Content Server and ServiceNow: the same tests pass in a test instance of each.
- **Dependencies / notes:** E32 (Microsoft sign-in). Awaiting NYPA: SharePoint Online vs. on-premises, per-file vs. site-level at go-live, Content Server version and API, ServiceNow modules. **Assumption until NYPA answers:** SharePoint Online with per-file permissions.

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
- **Acceptance criteria:** met today. Must remain true once per-file source permissions (E2) are added.

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
  - **E11.3** The system must ingest **video and audio** by transcription. Citations must link to the timestamp.
  - **E11.4** Unsupported formats must be rejected with a clear message, not fail silently.
- **Acceptance criteria:** a PPTX, an image and a short video are each uploaded, appear in search, and can be cited in an answer with the right slide or timestamp.

#### E12: Site pages, wikis and knowledge articles
- **RFP text:** "Supports site pages, wikis and knowledge articles within connected systems."
- **Priority:** Must · **Status:** Gap. SharePoint sync ingests drive files only.
- **Functional requirements:**
  - **E12.1** The SharePoint connector must ingest site pages (modern pages and wiki pages) from connected sites, with admin include/exclude options.
  - **E12.2** The ServiceNow connector should ingest Knowledge Base articles (see E2.8).
  - **E12.3** Pages and articles must be searchable, citable and shown with their source type and a link back to the original.
  - **E12.4** Permissions must be enforced the same way as files (E2.2).
- **Acceptance criteria:** a SharePoint site page and a ServiceNow KB article each appear in search and can be cited with a link to the original.

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
- **Dependencies / notes:** Unblocks E3, E4, E16 and E21. Migrate the existing 7 categories into a default term set.

#### E16: Integration with NYPA/Canals' taxonomy/ontology tool
- **RFP text:** "Integrates with NYPA/Canal's current taxonomy/ontology tool for controlled vocabularies."
- **Priority:** Must · **Status:** Gap. Not built.
- **Functional requirements:**
  - **E16.1** The system must import term sets from an external taxonomy/ontology source into the E15 model, preserving hierarchy, synonyms and IDs.
  - **E16.2** The import must support a standard exchange format (SKOS RDF and CSV at minimum) and should support a direct connector to NYPA's tool (awaiting NYPA).
  - **E16.3** Re-sync must update changed terms and flag removed ones without breaking document tags.
  - **E16.4** Externally managed term sets must be read-only in KMS (the external tool is the master).
- **Acceptance criteria:** a SKOS export from a taxonomy tool is imported, documents are tagged with its terms, and a re-import with changes updates them correctly.
- **Dependencies / notes:** E15. Awaiting NYPA: which tool NYPA uses.

#### E17: Knowledge-graph-enriched search, navigation and conversational querying (Met)
- **RFP text:** "Integration with Knowledge Graphs to support: graph-enriched search to boost results based on relationships, graph-enriched navigation for advanced discovery, and graph-enriched conversational querying to enhance accuracy and relevance of responses."
- **Priority:** Must · **Status:** Met. Relationship discovery and an org knowledge graph are used in search (related-document expansion), navigation (graph explorer) and chat.
- **Functional requirements:**
  - **E17.1** Search ranking must use graph relationships to boost related results. *(Exists.)*
  - **E17.2** Users must be able to explore the graph from any document, topic, person or project. *(Exists.)*
  - **E17.3** Conversational answers must draw on graph relationships. *(Exists.)*
  - **E17.4** Once E15 exists, taxonomy terms should become graph nodes, linking documents through shared terms.
- **Acceptance criteria:** met today. E17.4 is an enhancement.

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
  - **E19.4** Admins should be able to configure whether description approval is required before publishing (links to E21).
- **Acceptance criteria:** a new document shows a "pending review" AI description, and a reviewer edits and approves it, with the change recorded in the audit log.

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

#### E27: Duplicate and near-duplicate detection (Met)
- **RFP text:** "Detects duplicate documents; flags related/near-duplicate documents."
- **Priority:** Must · **Status:** Met. Exact (content hash) and near-duplicate (embedding similarity ≥ 0.92) detection, with a review state. Related documents and contradictions are also flagged.
- **Functional requirements:**
  - **E27.1** Exact duplicates must be detected at ingest.
  - **E27.2** Near-duplicates and related documents must be flagged for review.
  - **E27.3** Duplicate detection must work across source systems (an upload vs. a SharePoint copy).
- **Acceptance criteria:** met today for uploads. Verify E27.3 once more connectors land.

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
- **Acceptance criteria:** a user signs in with Microsoft, finds a SharePoint document, opens it in SharePoint from KMS, edits it there, and sees the update in KMS after the next sync.
- **Dependencies / notes:** E2. Supports RFP §6 S2 (Active Directory integration) and S9 (US data residency).


## 5. Non-Functional Requirements

These apply to all 32 requirements. Targets marked *(proposed)* need team agreement.

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Security | Permissions are enforced server-side in every API, search query, answer, preview, dashboard and export. Never only in the UI. |
| NFR-2 | Security | Every state change (publish, approve, delete, reassign, configuration change) is recorded in the audit log. |
| NFR-3 | Configurability | Thresholds, term sets, workflows, review policies, required fields and landing-page content are editable in admin settings, not code or environment variables (RFP §6 A1). |
| NFR-4 | Performance | Search results p95 ≤ 2 s. First token of an answer p95 ≤ 4 s *(proposed)*. |
| NFR-5 | Throughput | Ingestion and classification sustain at least 500 documents in 30 minutes (the benchmark from RFP §2.2). |
| NFR-6 | Freshness | Source-system changes, including permission changes, reflected within one sync interval. Default ≤ 60 minutes *(proposed)*. |
| NFR-7 | Data residency | Content, indexes and AI processing stay in the continental US (RFP §6 S9). |
| NFR-8 | Usability | All features work in current Chrome and Edge. Admin settings need no technical knowledge. |
| NFR-9 | Quality | Each requirement ships with automated tests (`node --test`), including permission tests for a member and a guest. |


## 6. Assumptions and Open Questions

**Assumptions (until NYPA answers otherwise):**
- NYPA uses **SharePoint Online** (M365), and per-file permissions are required.
- Microsoft sign-in is through **Entra ID**. NYPA registers the KMS application after award.
- Test instances of Content Server and ServiceNow are provided after award.
- NYPA's taxonomy tool can export SKOS or CSV.

**Open questions (sent to NYPA, due 14 Oct):**

| # | Question | Affects |
|---|---|---|
| Q1 | Is per-file permission inheritance required at go-live? | E2 |
| Q2 | SharePoint Online only, or on-premises too? | E2, E12, E32 |
| Q3 | Are Content Server and ServiceNow needed at go-live? | E2, E12 |
| Q4 | SAML 2.0 or OIDC preferred? | E32 |
| Q5 | Which taxonomy/ontology tool does NYPA use? | E16 |
| Q6 | Which ServiceNow modules should be searchable? | E2, E12 |


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
