# Requirements: Lessons Learned Intelligence

**Capability:** Lessons Learned Intelligence
**PRD Rank:** 11 (Tier 2 — Organizational Intelligence)
**Owner:** Johurul — full feature end-to-end, one PR.
**Purpose:** Institutional memory — capture what an organization learned from doing something (a project, an incident, a decision that played out) so the next person doesn't have to relearn it the hard way.

---

## Problem Statement

Unlike Rank 9 and Rank 10, this capability is **genuinely greenfield**. There is no existing "lessons learned," "retrospective," or "post-mortem" concept anywhere in the codebase (confirmed: zero matches for those terms across `src/`, `worker/`, `scripts/`, `docs/`). The PRD itself reflects this — Rank 11's status in `docs/KMS PRD-June 3rd 2026.md` is `NA`, the only row in the whole document with that status, versus `TBD` for everything else not yet built.

That said, three existing pieces are adjacent and this feature must build *on* or *alongside* them, not duplicate them:

- **`Decision`** (`prisma/schema.prisma`) captures a single point-in-time statement + rationale, extracted automatically from document text by `extractDecisions()` (`worker/summarize.js`) during ingestion. This is "what was decided and why it was decided at the time" — not "what we learned once we saw how it played out."
- **`TimelineEvent`** gives a chronological view of decisions per project/department (`GET /api/projects/[id]/timeline`). A lessons-learned feature should plug into this timeline rather than invent a second one.
- **`DocumentConflict`** and `KnowledgeGap` establish the project's existing pattern for "flag something for human judgment, never auto-resolve" and "aggregate into a dashboard admins already check" (`GET /api/org/[orgId]/health`) — both patterns this feature should reuse rather than reinvent.

The concrete gap: nothing in the product lets a project lead write down, after the fact, "here's what actually happened, what worked, what didn't, and what we'd do differently" — which in practice is how most real lessons-learned content gets created (a deliberate retrospective), not something an LLM can reliably mine out of ordinary project documents after the fact. There's also no lifecycle hook to prompt for it: `Project` (`prisma/schema.prisma`) has no `status` or `completedAt` field at all today, so there's no natural "the project just ended, capture a retro" moment to build on.

---

## Scope

In scope:
- A first-class `Lesson` entity: manually authored, optionally seeded by LLM extraction from retrospective-shaped documents, always human-confirmed before being treated as authoritative.
- Linking a lesson to the project, department, and/or source document(s) it came from.
- A lessons-specific answer path in chat ("what have we learned about vendor onboarding") distinct from the existing generic-citation answer and from `isDecisionQuestion()`'s decision-specific path.
- A browsable lessons feed, scoped by project/department/topic.
- RBAC consistent with everything else a project/department already gates.

Out of scope (handled elsewhere or explicitly deferred):
- **Decision Intelligence Repository** (Rank 14) — a broader "preserve why decisions were made" capability; this feature's `Lesson` may reference a `Decision` but does not replace or extend the `Decision` model's own scope.
- **Project Intelligence** (Rank 15, "link projects, documents, lessons, experts") — the cross-cutting linkage layer that will eventually connect this feature's lessons to Rank 9's experts and other projects. This feature produces the `Lesson` data Rank 15 will later consume; it does not build that cross-linking itself.
- Automatic, unreviewed lesson generation — every LLM-suggested lesson is a draft pending human confirmation, never auto-published, consistent with `DocumentDuplicate`/`DocumentProjectLink`'s existing "suggestion, not authority" pattern.
- Redesigning `Project` into a full project-management entity (milestones, status workflows) — FR-2 below adds the minimum needed to hook a capture prompt, not a project-management feature.

---

## Interface Contract with Existing Decision/Timeline Models

A `Lesson` may optionally reference the `Decision` it followed from and/or contribute a `TimelineEvent` entry, but `Decision`/`TimelineEvent` extraction logic in `worker/summarize.js` is unchanged by this feature — this doc only adds new, additive relations pointing at those existing rows. No existing extraction behavior, chat grounding (`src/lib/decisionIntelligence.js`), or timeline API response shape should change as a side effect of this feature.

---

## Functional Requirements

### FR-1 — Lesson Data Model
- A `Lesson` capturing: what happened, what worked, what didn't work, a recommended change/action for next time, an optional topic/tag, and links to the originating project, department, and/or document(s).
- Status field distinguishing `draft` (captured, not yet reviewed) from `published` (confirmed, discoverable by others) — nothing becomes visible org-wide without this step.
- Authored by (`userId`), with `source` distinguishing `manual` entry from `extracted` (LLM-suggested from a document, per FR-3).

### FR-2 — Manual Capture Flow
- A form, reachable from a project page and a department page, to write a new lesson at any time — not gated on a project "ending," since `Project` has no status/closure concept today (see Open Questions on whether to add one).
- Editable while in `draft` status; once `published`, edits should be tracked the same lightweight way `DocumentDuplicate`/`DocumentConflict` track state transitions (updatedAt is enough — no need for a full revision history for v1).

### FR-3 — LLM-Assisted Extraction (advisory only)
- At ingestion (chained onto the existing summarization/decision-extraction stage in `worker/index.js`, not a new parallel job type — matching this project's established anti-pattern warning against "two parallel systems doing the same job"), detect documents that read as a retrospective/post-mortem/lessons-learned writeup (heuristic: title/heading patterns, or an LLM classification pass alongside the existing `extractDecisions()`/`extractEntities()` calls) and propose a draft `Lesson` from its content.
- Extracted lessons are always `status: draft` — a human must review and publish, never auto-published. This mirrors `classificationStatus`/`DocumentDuplicate.status`'s existing suggestion-only pattern exactly.

### FR-4 — Lessons-Aware Chat Answers
- A question shaped like "what have we learned about X" or "what went wrong with X before" should retrieve `published` `Lesson` rows as grounding, via a dedicated detection function analogous to `isDecisionQuestion()` in `src/lib/decisionIntelligence.js`, rather than relying on generic document-chunk retrieval to happen to surface a lesson.
- RBAC: a lesson tied to a project/department the asking user can't access must never be surfaced, same SQL-`WHERE`-not-post-filter rule as every other RBAC-sensitive query in this codebase.

### FR-5 — Lessons Feed
- A browsable, filterable (by project, department, topic/tag, status) list of lessons — the read surface for people who aren't going to think to ask chat about it, mirroring the existing Timeline panel's placement on project/department pages.

### FR-6 — RBAC
- A lesson's visibility follows its linked project/department's existing access rules exactly (same `DepartmentMember`/`Project.scope` checks already used everywhere else) — no separate permission model for lessons.

---

## Non-Functional Requirements

- FR-3's extraction pass must not block or meaningfully slow the existing summarization job it's chained onto — non-fatal on LLM failure, matching how conflict detection (`worker/index.js`) is already wrapped in try/catch so one failing stage doesn't sink the whole ingestion job.
- No more than one additional LLM call per document for FR-3's classification+extraction, consistent with this project's existing per-document LLM-call cost discipline (see `REQUIREMENTS_AUTO_CLASSIFICATION.md`'s equivalent constraint).
- Manual lessons (FR-2) must be cheap to write — a short form, not a heavyweight structured wizard; the goal is lowering the activation energy for people to actually record something.

---

## Data Model Impact (proposed, not final)

```
Lesson {
  id                String
  orgId             String   → Organization
  projectId         String?  → Project
  departmentId      String?  → Department
  documentId        String?  → Document        // source doc, if extracted (FR-3)
  decisionId        String?  → Decision         // optional link to a prior Decision
  topic             String?
  whatHappened      String
  whatWorked        String?
  whatDidntWork     String?
  recommendation    String?
  authorUserId      String   → User
  source            String   @default("manual") // "manual" | "extracted"
  status            String   @default("draft")  // "draft" | "published"
  createdAt         DateTime
  updatedAt         DateTime
}
```
Owned entirely by this feature. If FR-2's Open Question below resolves to "yes, add project lifecycle fields," that's an additive, independent change to `Project` (`status String?`, `completedAt DateTime?`) with no column overlap against any other in-flight feature.

---

## Open Questions

1. Should `Project` gain a `status`/`completedAt` field to enable a "this project just wrapped — capture a retro?" prompt, or is on-demand capture (FR-2, no trigger) sufficient for v1? This is the single biggest scope decision in this doc — resolve before starting FR-2.
2. Tag/topic taxonomy for `Lesson.topic` — reuse the existing `Topic` model (join to an actual topic row) or a free-text field like `Decision`/`TimelineEvent` use today? Free text is cheaper to ship; a real `Topic` join would make lessons discoverable alongside Expert Discovery's topic-scoped browsing ([[REQUIREMENTS_EXPERT_DISCOVERY]]) for a future Rank 15 (Project Intelligence) tie-in.
3. Should FR-3's extraction heuristic be a cheap keyword/heading check before spending an LLM call, or run the classification LLM call on every ingested document? Given the cost constraint above, prefer a cheap pre-filter.
4. Does a `published` lesson need any approval step beyond the author/extractor confirming it, or can any project member publish directly (consistent with how casually documents are uploaded today)?

---

## Acceptance Criteria (draft)

- A project member can manually write and publish a lesson from the project page in under a minute.
- A retrospective-shaped uploaded document produces at least one draft `Lesson` suggestion, never auto-published.
- Asking chat "what have we learned about X" returns relevant published lessons as grounding when they exist, and gracefully falls back to generic retrieval when none do.
- A lesson tied to a project/department the asking user can't access never appears in chat, search, or the lessons feed for that user.
- No regression to existing `Decision`/`TimelineEvent` extraction or the document Decisions card.
