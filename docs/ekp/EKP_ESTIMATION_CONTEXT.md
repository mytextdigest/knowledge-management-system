# Context for Estimating the KMS EKP Implementation Timeline

> **How to use this document:** paste it together with `EKP_IMPLEMENTATION_PLAN.md` into the conversation, then send the request in §1. This document gives the facts that aren't in the plan: the team, how we work, our measured delivery pace, the state of the codebase, and the constraints.

## 1. The Request

Please estimate how long it will take our team to complete the **24 remaining Enterprise Knowledge Platform (EKP) requirements** described in the attached implementation plan. Specifically:

1. An effort estimate (in person-weeks) for each workstream (A–G) and for the shared foundations listed in §6 below.
2. A calendar timeline for the three phases, given 3 developers working in parallel, starting **Monday 13 October 2026**.
3. A best case, most likely and worst case completion date for all 24 requirements.
4. What can realistically be completed by **30 November 2026** and by **31 December 2026**.
5. The main assumptions and risks behind your estimate, and what would most speed it up.

Base the estimate on our **measured past velocity (§4)** and **normal workflow (§3)**, not on generic industry averages.

## 2. Product and Team

**Product:** KMS, an AI-based enterprise knowledge management platform. We're preparing a bid for the New York Power Authority (NYPA) RFP Q26-7821RJM, which lists **32 requirements** for an Enterprise Knowledge Platform. Today KMS fully meets **8**, partly meets **18**, and doesn't meet **6**. The plan defines all 32 (IDs E1–E32), each with "Done when" acceptance criteria.

**Tech stack:**
- Next.js 16 (App Router, React 19) web app and API, Tailwind.
- PostgreSQL with pgvector (Neon, hosted on AWS us-east-2) via Prisma.
- AWS S3 for files and AWS SQS for the ingestion queue.
- A long-running Node.js worker for extraction, OCR, embeddings, summaries, classification and relationships.
- OpenAI API for embeddings and generation.
- NextAuth (credentials + email OTP; no SSO yet).
- Microsoft Graph for the existing SharePoint connector.
- Automated tests with `node --test`.

**Team:** 3 full-stack developers, all working with AI coding assistants (e.g. Claude Code) for design, implementation and tests.
- **Johurul:** tech lead and reviewer. Built the core RAG chat, ingestion worker, SharePoint connector, auth and lifecycle code.
- **Sandeep:** built the knowledge graph and context engine.
- **Simran:** built classification, recommendations and expert discovery.

**Current assignment:** Phase 1 = Workstream A (Johurul) + Workstream B (Sandeep & Simran, together). Owners for later workstreams (C–G) aren't assigned yet.

## 3. Our Normal Workflow

Every feature follows the same cycle (detailed in the plan, §4):

1. The owner writes a requirements document (problem, scope, functional and non-functional requirements, data model, open questions, acceptance criteria).
2. The tech lead and one teammate review it (about 1 working day).
3. The owner creates a task tracker.
4. Code on a feature branch off `dev`, in small PRs.
5. Self-test against the acceptance criteria, plus automated tests and permission checks for each role.
6. PR review: Johurul reviews the others. Sandeep or Simran review Johurul.
7. Merge to `dev` and update the trackers.

**Other working patterns that affect time:**
- **One owner per feature, end to end.** Features are usually delivered as one PR per feature (sometimes split).
- **Shared files need coordination:** the database schema, the ingestion worker, auth, the search engine and the audit log. Schema changes are one migration per PR, merged one at a time.
- **After a large batch of features, we've needed a dedicated bug-fix/QA period** (see §4).
- **Proposals, demos and client documents** sometimes take developer time away from building.

## 4. Measured Velocity (from git history)

| Period | What shipped | Elapsed |
|---|---|---|
| 20 Jun 2026 | Org/department/project hierarchy, navigation redesign, org search | — |
| 3 → 8 Jul 2026 | Org chat upgrade: memory, citations, confidence, streaming, hybrid retrieval and scoping (4 tasks, 2 PRs) | ~1 week |
| 22 → 28 Jul 2026 | Phase 2–3 intelligence tasks: entity extraction, org memory, decision tracking, timelines, knowledge synthesis, gap and conflict detection, recommendations, learning workflow (~8 tasks) | ~1 week |
| ~Jul → 10 Aug 2026 | SharePoint ingestion pipeline (connector, delta sync, sync history), automatic classification, knowledge context engine (3 features, merged together) | ~2 weeks |
| **10 → 29 Aug 2026** | **Bug-fix sprint after Tier 1 alpha QA** (82-case test plan, 4 testers) | **~2.5 weeks** |
| 6 Sep → 1 Oct 2026 | Tier 2: expert discovery, recommendation engine, lessons learned, relationship discovery, organizational knowledge graph, decision intelligence + decision extraction v2 with human review, topic evolution (8 features) | ~3.5 weeks |

**Johurul's recent cadence:**
- Lessons Learned: 8 Sep
- Decision Intelligence: 21 Sep
- Decision Extraction v2: 26 Sep
- Topic Evolution: 1 Oct

That's about one substantial feature every 5–7 working days.

**Note on comparability:** the features above were mostly AI and data features built on top of our own data. Much of the remaining EKP work is enterprise plumbing that depends on external systems: Microsoft Entra ID sign-in, per-file SharePoint permissions via Microsoft Graph, ServiceNow and OpenText Content Server connectors, plus configurable workflow and taxonomy engines. That kind of work is typically slower to build, test and debug.

## 5. Current State of the 24 Remaining Requirements

The plan (§3) gives, for each requirement, what exists today and the "Done when" criteria. In summary:

- **Already met (8), no work except regression testing:** E6 recommendations, E7 natural-language answers, E8 cited permission-aware answers, E9 follow-up questions, E17 knowledge-graph enrichment, E18 drag-and-drop upload, E20 auto-tagging with review, E27 duplicate detection.
- **Partly built (18):** E1, E2, E3, E4, E5, E10, E11, E13, E19, E21, E22, E23, E24, E26, E28, E29, E30, E32.
  - The base exists, but the **remaining part is often the hardest part**. Examples:
    - E2: search exists, but **per-file SharePoint permission enforcement** is missing;
    - E22: a fixed draft → publish step exists, but a **configurable multi-stage workflow engine** is missing;
    - E28–E30: usage data is collected, but **no dashboards** exist.
- **Not started (6):** E12 site pages/wikis, E14 asset templates, E15 managed metadata (hierarchical terms, synonyms), E16 NYPA taxonomy-tool integration, E25 configurable review workflows, E31 governance metrics.

## 6. Codebase Facts That Affect Effort

These come from our implementation specification and must be built before or alongside the features:

| Foundation | Why it's needed | Current state |
|---|---|---|
| **F1 Central access control** | The document-visibility rule is duplicated in about 8 places (several SQL copies plus a JS version). Per-file SharePoint permissions (E2) must apply everywhere, so this needs consolidating first, with a parity test. | Duplicated |
| **F2 Audit service** | Lifecycle and governance actions must be audit-logged (E19, E22–E25). | Audit table exists, logged in only 3 places |
| **F3 Scheduled jobs** | Scheduled SharePoint sync, stale-content scans, link checks, review-due scans | None. These run as manual scripts or buttons. |
| **F4 Notifications** | Approvals, reviews, watchlists (E5, E22, E25, E26) | None, beyond auth emails |
| **F5 Admin settings** | Thresholds, rules and lists must be admin-configurable, not in code | Mostly code constants / environment variables |
| **F6 Workflow engine** | Shared by publishing (E22), review (E25), decommission (E23) and templates (E14) | Not built |
| **F7 Unified search** | Two separate search paths exist (repository page vs. chat). Taxonomy facets, ontology search and analytics need one. | Two paths |

**Existing assets that help:**
- A **Microsoft 365 test tenant** with an Entra app and SharePoint site grants is already set up.
- **pgvector hybrid search** (vector + keyword) and the **knowledge graph** already work.
- The **worker pipeline** can be extended for new file types.
- About **23 automated test files** exist.

## 7. Constraints, Dates and Dependencies

| Item | Detail |
|---|---|
| Start | Monday 13 October 2026 |
| NYPA questions deadline | 14 Oct 2026 (answers expected 19 Oct). Some designs depend on the answers. |
| NYPA proposal due | 28 Oct 2026 (takes developer time that week) |
| Possible NYPA demo | Within 2 weeks of being shortlisted (likely November). Preparation takes time. |
| NYPA award / project start | December 2026 / Q1 2027 |
| Holidays | US holidays: Thanksgiving (26–27 Nov), Christmas / New Year |
| Blocked item | The OpenText Content Server connector can't be finished until NYPA provides a test instance (after award) |
| Availability | All 3 developers work normal **8-hour days, 6 days a week (Monday–Saturday)**: 48 hours/week each, 144 team-hours/week, full-time on this project. No overtime or Sunday work. |

## 8. Scope Notes for the Estimate

- **The 24 requirements** are the core scope (Workstreams A–F).
- **Workstream G (RFP §6 architecture and security guidelines)** isn't part of the 32 requirements. Please estimate it **separately**: test and production environments, HA/DR, single-tenant option, security hardening, penetration test preparation.
- Within the 32, **Content Server and ServiceNow** are "target capability" (preferred, not mandatory) in the RFP. **SharePoint is mandatory.**
- If useful, give two variants:
  - **(a) Minimum compliant:** meet each requirement's "Done when" criteria only.
  - **(b) Full specification:** including every "should" and "may" item from the product requirements specification.
