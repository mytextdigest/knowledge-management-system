# KMS vs. NYPA RFP Q26-7821RJM: Gap Analysis

**RFP:** NYPA Q26-7821RJM, *Knowledge Management RFP*
**Product:** KMS (as of 2026-10-08)
**Scope:** Enterprise Knowledge Platform (EKP), RFP §2.1, plus the new architecture and security guidelines (RFP §6)

**Status key:** ✅ **Met** (built and working) · 🟡 **Partial** (started, not complete) · ❌ **Gap** (not built) · ⚪ **Not verified**

---

## 1. The RFP Uses the Same 32 Requirements as the RFI

- **The EKP requirements in the RFP (§2.1) match the 32 RFI requirements (§3.1) directly.** Same requirements, same wording, same order. We confirmed this with a word-for-word comparison of the two documents.
- **To satisfy the RFP, KMS must deliver all 32 of these requirements.**
- The EKP deliverables list (7 items) is also unchanged from the RFI.
- KMS's score against the 32 requirements is therefore the same as in our RFI analysis: **8 met, 18 partial, 6 gaps**.

## 2. What Is New in the RFP

| New item | What it means for us |
|---|---|
| **Architecture and security guidelines (§6)** | 17 new guidelines: login through NYPA's Active Directory, single tenancy, security certification, US-only data, backup sites, Power BI. KMS doesn't fully meet any of them yet. |
| **Partial bids allowed** | We can bid on the EKP alone. |
| **Live demo** | If shortlisted, we must demo KMS within 2 weeks of being notified. |
| **Deadlines** | Questions due **14 Oct 2026** · Proposal due **28 Oct 2026** · Award Dec 2026 · Project start Q1 2027 |

---

## 3. Summary

| Area | Total | ✅ Met | 🟡 Partial | ❌ Gap | ⚪ Not verified |
|---|---|---|---|---|---|
| **EKP requirements (same 32 as RFI)** | 32 | 8 | 18 | 6 | 0 |
| Architecture guidelines (new) | 8 | 0 | 4 | 4 | 0 |
| Security guidelines (new) | 9 | 0 | 5 | 3 | 1 |

**In short:** the AI core of KMS works: search, AI answers with sources, the knowledge graph, auto-tagging, duplicate detection and recommendations. What's missing is enterprise features: configurable workflows, dashboards, a managed taxonomy, more file types, and deeper Microsoft 365 integration. The new security guidelines are the biggest risk.

---

## 4. The 32 EKP Requirements

### Search and navigation

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 1 | Customizable landing page | 🟡 | Admins can't customize the home page |
| 2 | Search across SharePoint (**mandatory**), Content Server, ServiceNow, respecting permissions | 🟡 | SharePoint permissions are applied per site, not per file. No Content Server or ServiceNow connector. |
| 3 | Hybrid keyword + ontology search | 🟡 | Hybrid search works. No ontology yet. |
| 4 | Filters (facets) based on taxonomy | 🟡 | Basic filters only. No taxonomy-based filters. |

### Personalization

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 5 | Role-based discovery, personal homepage, saved searches, watchlists | 🟡 | No saved searches, watchlists or personal homepage |
| 6 | Recommendations and trending content | ✅ | — |

### AI questions and answers

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 7 | Ask questions in plain language and get direct answers | ✅ | Answer box on the search page still to add |
| 8 | Answers cite sources and respect permissions | ✅ | — |
| 9 | Follow-up questions | ✅ | — |
| 10 | Confidence scores and explanations | 🟡 | Only high/medium/low. No score or explanation. |

### Content types

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 11 | Documents, PowerPoint, PDF, video, images | 🟡 | Supports PDF, Word, Excel, CSV, TXT. No PowerPoint, images or video. |
| 12 | Site pages, wikis, knowledge articles | ❌ | Only SharePoint files are synced |
| 13 | Previews and thumbnails | 🟡 | Preview works. No thumbnails. |
| 14 | Templates for knowledge content | ❌ | Not built |

### Metadata and knowledge graph

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 15 | Managed metadata with hierarchy and synonyms | ❌ | Categories are a fixed list of 7 |
| 16 | Connect to NYPA's taxonomy tool | ❌ | Not built |
| 17 | Knowledge graph used in search, navigation and AI answers | ✅ | — |

### Upload and automatic tagging

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 18 | Drag-and-drop upload | ✅ | — |
| 19 | Auto-generated summary with human review | 🟡 | Summaries are generated, but there's no review step |
| 20 | Auto-tagging with human review | ✅ | — |
| 21 | Required metadata before publishing | 🟡 | No rule for required fields |

### Governance and lifecycle

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 22 | Configurable publishing workflow and approvers | 🟡 | Workflow exists but is fixed |
| 23 | Archive, retire, supersede, delete with audit trail | 🟡 | No supersede or version history. Changes aren't audit-logged. |
| 24 | Ownership and stewardship | 🟡 | No owner or steward fields |
| 25 | Configurable review workflows | ❌ | Not built |
| 26 | Stale-content detection and review reminders | 🟡 | Detection runs manually. No schedule or alerts. |
| 27 | Duplicate detection | ✅ | — |

### Analytics and dashboards

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 28 | Content health dashboard | 🟡 | Only a basic health panel |
| 29 | Usage and adoption dashboard | 🟡 | Data is collected, but there's no dashboard |
| 30 | Search quality metrics | 🟡 | "No results" searches aren't tracked |
| 31 | Governance metrics | ❌ | Not built |

### Microsoft 365

| # | Requirement | Status | What's missing |
|---|---|---|---|
| 32 | Microsoft 365 as the single source of truth | 🟡 | Files are copied into KMS. No Microsoft sign-in. |

---

## 5. New Architecture and Security Guidelines (RFP §6)

### Architecture

| # | Guideline | Status | What's missing |
|---|---|---|---|
| A1 | NYPA can configure the application itself | 🟡 | Many settings are only in code |
| A2 | Test changes before production | ❌ | Only one (development) environment |
| A3 | Ready-made connectors to other systems | 🟡 | SharePoint only |
| A4 | Cloud hosting (prefers 2+ cloud providers) | 🟡 | AWS only |
| A5 | Power BI / Tableau integration | ❌ | Not built |
| A6 | Web, Windows and iOS apps | 🟡 | Web only |
| A7 | NYPA look and feel (or Sitecore) | ❌ | No branding options |
| A8 | High availability and disaster recovery | ❌ | No plan or setup |

### Security

| # | Guideline | Status | What's missing |
|---|---|---|---|
| S1 | Data export and data-model documentation | 🟡 | No export feature |
| S2 | Login with NYPA Active Directory (SAML); OAuth for APIs | ❌ | Email/password only |
| S3 | Login for external users through another identity provider | ❌ | Not built |
| S4 | Single tenancy preferred (or NIST 800-53 controls) | 🟡 | KMS is multi-tenant. No NIST mapping. |
| S5 | Encryption at rest and in transit | 🟡 | Stored OpenAI key isn't encrypted |
| S6 | SOC 2 report or penetration test | ❌ | Neither done |
| S7 | Sensitive pages not cached | 🟡 | Only applied on a few pages |
| S8 | TLS 1.2 or higher only | ⚪ | Production hosting not set up yet |
| S9 | NYPA data stays in the US | 🟡 | Storage is in the US, but content is sent to OpenAI for AI processing |

---

## 6. Next Steps

**Send these questions to NYPA by 14 Oct:**
1. Which taxonomy tool does NYPA use?
2. Are per-file SharePoint permissions needed from day one?
3. Is a US-hosted AI service (e.g. Azure OpenAI) acceptable?
4. Is single tenancy a hard requirement?
5. Will a penetration test be accepted in place of SOC 2?

**Fix before a demo (visible gaps):**
- Microsoft / Active Directory login
- PowerPoint support
- Answer box on the search page
- Audit log for document changes and deletes
- A basic usage and content-health dashboard

**Plan the rest as a roadmap in the proposal:**
- SharePoint permissions, Content Server and ServiceNow
- Configurable workflows and ownership
- Managed taxonomy
- Dashboards and Power BI
- More file types
- Personalization
- Test and production environments, backup sites, security certification

---

*Notes:*
- *Attachments 2–4 (response form, cost proposal, SaaS questionnaire) are only in Ariba and weren't reviewed.*
- *"Met" means the feature is built and working. It hasn't been tested at NYPA scale.*
- *Requirement-by-requirement evidence and code references are in `docs/NYPA_RFI_KMS_GAP_ANALYSIS.md`.*
