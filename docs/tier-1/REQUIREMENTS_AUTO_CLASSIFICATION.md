# Requirements: Automatic Knowledge Classification

**Capability:** Automatic Knowledge Classification
**PRD Rank:** 4 (Tier 1)
**Owner:** Simran — full feature end-to-end, one PR.
**Purpose:** Self-organizing enterprise knowledge — every document entering the Knowledge Repository is labeled, categorized, and routed without a human filling out metadata fields.

---

## Problem Statement

Today, `Document.category`, `Document.departmentId`, and `Document.lifecycle` (see `ENTERPRISE_KNOWLEDGE_REPO_PLAN.md`, Schema Changes) are set manually at upload time via the `UploadToRepositoryModal`. This doesn't scale:
- Uploaders mis-categorize or skip category entirely (`category` is nullable).
- There's no department suggestion — a user has to know where a document "belongs."
- Stale or duplicate documents accumulate because nothing flags them for lifecycle review.
- The repository filter bar (Task 2-C) is only as useful as the metadata humans bothered to enter.

This capability removes the human from that loop: the system classifies a document as part of ingestion, the same way it already chunks and embeds it.

---

## Scope

In scope:
- Automatic assignment of `category` on ingestion (reusing the existing category taxonomy: Policies, SOPs, Reports, Meeting Knowledge, Product Knowledge, Historical Documents, Other).
- Confidence-scored department suggestion (`departmentId` candidate, not auto-applied without a threshold).
- Duplicate / near-duplicate detection against existing repository documents.
- Lifecycle suggestions (e.g., flagging a document as a stale `draft` candidate for `archived`) — suggestion only, not automatic transition.
- Re-classification when a document's content changes (re-upload of the same logical document).

Out of scope (handled elsewhere):
- **The Needs-Review queue UI and its accept/reassign/create-project actions** — that's [[REQUIREMENTS_INGESTION_PIPELINE]] (Johurul's feature). This doc produces the classification *signals* (category, confidence, duplicate flags, staleness flags) that queue reads and acts on; it doesn't build the queue itself.
- **How connector-sourced (SharePoint) documents enter this pipeline** — that's [[REQUIREMENTS_INGESTION_PIPELINE]]. This doc's classification logic runs identically regardless of whether a document arrived via manual upload or sync; it doesn't distinguish source.
- Cross-document relationship mapping, topic graphs, expertise discovery — that's [[REQUIREMENTS_KNOWLEDGE_CONTEXT_ENGINE]].
- Manual override UI changes beyond what's needed to show/accept/reject a suggestion (Repository UI already has category/dept selects from Task 2-C; this just needs to pre-fill them).
- Org-wide search/chat — already shipped (Tasks 3-A, 3-B).

---

## Interface Contract with Rank 3 (Ingestion Pipeline)

This feature and [[REQUIREMENTS_INGESTION_PIPELINE]] are two independent features, two independent PRs. The one shared touchpoint is the `Document` status value contract (`pending_classification` → `needs_review` → `published`), agreed once with Johurul before either migration lands. This feature's own migration (`Document.categoryConfidence`/`classificationStatus`, `DocumentDuplicate`) is additive and independent of the connector's `sourceProvider`/`OrgIntegration` migration — both land on `Document` but touch different columns, so either can merge first.

---

## Functional Requirements

### FR-1 — Category Classification
- On document ingestion (worker `chunk`/`summarize` stage), classify the document into exactly one category from the existing taxonomy.
- Classification must run for both `scope=repository` and `scope=project` documents promoted later to org scope (re-classify on promotion if `category` is null).
- Store a `categoryConfidence` score alongside the result.
- If confidence is below a configurable threshold, leave `category = null` and surface "Uncategorized" in the Repository UI rather than guessing.

### FR-2 — Department Suggestion
- Suggest a `departmentId` based on document content and (if available) the uploader's own department memberships (`DepartmentMember`).
- Suggestion is advisory: shown to the uploader/admin at upload time or in the Needs-Review queue ([[REQUIREMENTS_INGESTION_PIPELINE]]), never silently applied when a `departmentId` was already explicitly chosen by the uploader.
- If the org has zero departments, skip this step entirely (no suggestion to make).

### FR-3 — Duplicate / Near-Duplicate Detection
- Before or shortly after embedding, compare the new document's chunk-level or document-level embedding against existing `scope=repository` documents in the same org.
- Flag matches above a similarity threshold as "possible duplicate of [existing doc]" rather than blocking upload.
- Surfaced to admins via the Needs-Review queue ([[REQUIREMENTS_INGESTION_PIPELINE]]), not a hard rejection (avoid false-positive lockouts).

### FR-4 — Lifecycle Staleness Suggestion
- Periodically (batch job, not per-request) flag `published` documents that haven't been accessed/cited in chat or search results for N days as `archived`-candidates.
- Suggestion appears in the Repository UI lifecycle filter as a distinct, dismissible signal — does not change `lifecycle` automatically.

### FR-5 — Re-classification on Update
- If a document's content is replaced (re-upload with same filename/document id), re-run FR-1–FR-3 against the new content.

---

## Non-Functional Requirements

- Classification must not block the existing upload → chunk → embed → summarize pipeline (worker/index.js). It should be an additional async stage, not a synchronous gate on upload response.
- Must work with the org's own OpenAI API key (`Organization.openaiApiKey`), consistent with the existing API Key Resolution rule in `ENTERPRISE_KNOWLEDGE_REPO_PLAN.md`.
- False positives (wrong category, wrong duplicate flag) must be cheap to dismiss/correct in one click via the Needs-Review queue — this is a suggestion system, not an authority.
- Classification of a single document should add no more than one additional LLM call to the existing pipeline (cost control — orgs are paying per-token).

---

## Data Model Impact (proposed, not final)

```
Document + categoryConfidence  Float?
         + classificationStatus String? // "pending" | "classified" | "needs_review"

DocumentDuplicate {
  id              String
  documentId      String → Document
  duplicateOfId   String → Document
  similarity      Float
  status          String  // "pending" | "confirmed" | "dismissed"
  createdAt       DateTime
}
```
Owned entirely by this feature. `Topic`/`TopicDocument` already exist for project-scoped clustering (`prisma/schema.prisma`) — evaluate whether category classification can reuse/extend that model instead of introducing a parallel concept before implementation. `Document.sourceProvider`/`externalId` ([[REQUIREMENTS_INGESTION_PIPELINE]]) land in a separate, independent migration on the same table.

---

## Open Questions

1. Does category classification run per-document or per-chunk-then-aggregate? (Spreadsheet documents with multiple sheets may need per-sheet category in metadata, per Task 0-A's chunk `metadata`.)
2. Who reviews the Needs-Review queue — `super_admin` only, or also `dept_admin` for their own department's documents? (Owned by [[REQUIREMENTS_INGESTION_PIPELINE]]'s RBAC decision; this doc just needs the answer to know who a suggestion should be visible to.)
3. Should duplicate detection compare against `scope=project` org-promoted documents too, or only `scope=repository`?
4. What's the staleness window (N days) — configurable per org, or a fixed default?

---

## Acceptance Criteria (draft)

- A newly uploaded repository document receives a `category` (or is explicitly left "Uncategorized") without any user input.
- A department suggestion is computed and stored, ready for the Needs-Review queue to display (queue display/action itself verified in [[REQUIREMENTS_INGESTION_PIPELINE]]'s acceptance criteria).
- Uploading a document near-identical to an existing one creates a `DocumentDuplicate` row flagging it, not a silent rejection.
- No existing upload/chat/search flow regresses in latency or correctness.
