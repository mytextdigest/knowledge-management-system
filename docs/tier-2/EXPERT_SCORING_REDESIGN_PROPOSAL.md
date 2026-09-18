# Expert Discovery — Scoring Redesign Proposal

**Status:** Implemented 2026-09-12, including Phase 2 (dwell time).
**Prompted by:** Demo feedback (2026-09-10): "we can't label a person as expert just because he can upload a certain file — what if someone has studied the document/topic a lot, added notes, etc."
**Scope:** `worker/knowledgeContext.js` (`refreshTopicExpertise`), `src/lib/expertiseScoringPolicy.mjs` (`computeExpertiseScore`), `prisma/schema.prisma` (`DocumentInteraction.durationSeconds`), `src/app/api/documents/[id]/interactions/route.js`, `src/app/(app)/document/page.jsx` (dwell timer).

## Implementation notes (2026-09-12)

- All weights/caps below were implemented exactly as proposed, including the two "buildable today" signals (document-chat questions, published Lessons Learned authorship) and Phase 2 dwell time.
- Verified end-to-end against the real dev database before rollout: ran the updated `refreshTopicExpertise` against a topic with an existing `self_confirmed` row and an existing `inferred` row. The confirmed row correctly only rose (genuine new activity, protected from decreasing); the unprotected inferred row correctly dropped ~47% once uploads lost its uncapped weight — concrete proof the redesign does what it was meant to.
- Ran the one-time backfill this document recommended: `refreshTopicExpertise` executed across all 26 existing topics (24 refreshed; 2 skipped safely, having no documents with a resolvable org left).
- Dwell time is live: `document/page.jsx` now tracks visibility-aware reading time and reports it via `sendBeacon` on tab hide/close; the interactions API clamps every report to 15s–20min server-side regardless of what the client sends.

---

## 1. What's wrong with the current formula

| Signal | Today's weight | Today's cap |
|---|---|---|
| Documents uploaded into the topic | 1.0 each | **none** |
| Their document cited in a chat answer | 0.35 each | 3.0 |
| Departments they belong to touching the topic | 0.25 each | 1.5 |
| Document views/downloads | 0.15 each | 2.0 |

Two structural problems, not just a weighting opinion:

1. **Uploads is the only uncapped signal.** Everything else tops out at a small ceiling; uploads doesn't. Someone who bulk-uploads 10 documents (a migration, a forwarded folder) scores a raw 10.0 — able to dwarf every other signal combined — with zero check on whether they understood any of it.
2. **No comprehension signal exists at all.** Every signal is a *count of actions* (uploaded, cited, viewed), never a *measure of understanding* (time spent, questions asked, synthesis produced). The schema also only records who uploaded a file (`Document.userId`), not who wrote it — the algorithm cannot tell "I authored this after months of work" apart from "I happened to click upload."

## 2. Design principles for the redesign

1. **No signal may be uncapped.** Every category gets a ceiling, uploads included.
2. **Signals that require real understanding outrank signals that require a click.** Writing a synthesis (a Lesson) or asking substantive questions about a document should outweigh viewing or uploading it.
3. **Weak/proxy signals stay weak.** Department membership is proximity, not expertise — it should never be able to push someone to the top on its own.
4. **Decay stays.** The 90-day half-life is correct and unaffected by this proposal — it's the *inputs* that need fixing, not the aging mechanism.
5. **Human judgment still wins.** Self-confirm / admin-confirm / dismiss already override the algorithm and are protected from being silently overwritten (`worker/knowledgeContext.js:107-113`) — nothing here changes that; the redesign only affects `inferred` rows.

## 3. Phase 1 — buildable today, no new instrumentation

Two of the requested signals ("studied it a lot," implicitly "produced something from it") already have real data sitting unused in the product:

- **Document-level Q&A** (`Conversation` / `Message`, scoped to a document) — when someone asks the document assistant real questions about a specific document, that's active engagement, not a click. This exists today and is never read by the expertise scorer.
- **Lessons Learned authorship** (`Lesson.documentId` / `authorUserId`) — writing a retrospective tied to a document is the strongest "I studied this and synthesized something from it" signal the product has. Also unused today. Only **published** lessons should count — drafts haven't been reviewed yet, matching the draft/publish gate already built for that feature.

Proposed Phase 1 weighting:

| Signal | New weight | New cap | Why |
|---|---|---|---|
| Documents uploaded | 0.5 each | **1.5** | Still counts (having the material matters) but can no longer dominate. |
| Cited in a chat answer | 0.35 each | 2.0 | Slightly de-emphasized relative to the two new signals below — being cited reflects the *document's* usefulness more than the *person's* understanding. |
| Department overlap | 0.25 each | **0.5** | Kept only as a cold-start tie-breaker for brand-new topics with no activity yet; explicitly prevented from being a real driver. |
| Views/downloads | 0.15 each | 1.5 | Slightly reduced cap — this is the weakest engagement signal and should yield ground once dwell time (Phase 2) exists. |
| **NEW — Questions asked about the document** (own document-chat messages, min. length filter to discourage junk) | **0.4 each** | **3.0** | Directly evidences trying to understand the material. |
| **NEW — Published Lessons Learned authored, tied to a document/topic in scope** | **2.0 each** | **4.0** | Strongest available signal; 2 lessons alone puts someone solidly ahead of pure activity counts. |

Everything else about the formula (per-user, per-topic, summed, then multiplied by the existing 90-day-half-life decay) stays the same.

## 4. Phase 2 — dwell time (the part that needs new instrumentation)

This is genuinely new work, not a scoring tweak — flagging the pieces required before it can ship:

1. **Schema**: additive migration adding a nullable `durationSeconds` column to `DocumentInteraction` (existing rows unaffected, no data loss — matches this project's established additive-migration pattern).
2. **Client instrumentation** (`document/page.jsx`): track active time on the page using the Page Visibility API — the timer pauses when the tab isn't focused, so leaving a tab open overnight doesn't count. Send the duration via `navigator.sendBeacon` on page unload (reliable even if the tab is closed abruptly) and/or periodic heartbeats for long sessions.
3. **Guardrails** (to keep this honest and hard to game):
   - Ignore sessions under **15 seconds** — treat as a bounce, not a read.
   - Cap credited time at **20 minutes per session** — a tab left open overnight shouldn't outscore genuine focused reading.
4. **Scoring**: sum genuine session time per person per topic (subject to the same 90-day decay), weighted at roughly **1.0 point per 10 minutes of active reading**, capped at **3.0** — comparable in magnitude to the other capped signals above.
5. **Rollout note**: only interactions recorded *after* this ships will have duration data; the raw view/download count signal (Phase 1's row 4) should stay in place as a fallback for documents/sessions where a duration ping never arrives (ad blockers, browser quirks), rather than being removed outright.

## 5. What this does not solve (flagging honestly)

- **"Added notes"** as a literal feature (personal annotations on a document) doesn't exist in the product at all. If that's wanted as a distinct capability from Lessons Learned, it needs its own product decision and schema/UI work — out of scope for a scoring change alone. Lessons Learned is the closest existing proxy and is included above.
- The system still cannot distinguish *authoring* a document from *uploading* someone else's — there's no author field separate from uploader. Not addressed here; would need a `Document.authorUserId` (or similar) product decision.

## 6. Rollout

- `admin_confirmed` / `self_confirmed` / `dismissed` rows are untouched by this change (protected by existing logic) — only `inferred` rows are affected.
- Existing `inferred` scores only recompute when a new document in that topic gets processed. To avoid stale topics sitting on old-formula scores indefinitely, run a one-time backfill (`refreshTopicExpertise` across every existing topic) right after deploying the new weights, rather than waiting for organic recomputation.
