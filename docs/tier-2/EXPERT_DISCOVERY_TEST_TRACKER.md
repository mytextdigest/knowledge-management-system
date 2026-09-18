# Expert Discovery — Test Tracker

Source: `EXPERT_DISCOVERY_TESTING_SUGGESTION.md` (12 proposed tests). This file re-groups those 12 by whether they can actually be run against the real system today, and tracks progress. Check boxes off as each one is written and passing.

## About test accounts — read this first

**None of the 8 "doable today" tests create a real, loggable-in account.** They don't touch signup, OAuth, or sessions at all. Each test script creates temporary `User` rows straight in the database via Prisma (e.g. `viewer-<random>@example.test`), calls the scoring/query functions directly in Node, checks the numbers, then deletes everything it created in a `finally` block. Nobody could sign in as these "users" even if they wanted to — they exist only for the few seconds the test runs.

This is the same pattern already used by `scripts/task-10/expert-rbac.integration.test.mjs`. Every new script below follows it: gated behind `RUN_TIER2_DB_TESTS=1` (so it never runs by accident against real data) and pointed at the real dev database via `DATABASE_URL`, but fully self-contained and self-cleaning.

---

## Part A — Doable today (8 tests, no new code needed first)

| # | Test | What it proves | Status |
|---|------|-----------------|--------|
| 1 | Individual scoring | Each signal (uploads, citations, dept overlap, views, questions, lessons, dwell time) produces the exact expected point value in isolation | [x] DONE — `expert-test1-individual-signals.logic.test.mjs` |
| 2 | Cap enforcement | Every signal stops adding points once its ceiling is hit (e.g. 3rd+ lesson still caps at 4.0 total) | [x] DONE — `expert-test2-signal-caps.logic.test.mjs` |
| 3 | Anti-gaming | A document-hoarder (20 uploads, nothing else) scores lower than a real contributor (1 lesson + questions + reading + citations) | [x] DONE — `expert-test3-anti-gaming.integration.test.mjs` |
| 6 | False-positive scenarios | Upload-spam-only, department-membership-only, and reading-only profiles don't get inflated scores; an old (stale) contributor's score is visibly reduced | [x] DONE — `expert-test6-false-positives.integration.test.mjs` (scenarios A–E) |
| 8 | Recency decay | Score at 0/30/90/180/270 days of inactivity matches the 90-day half-life math exactly | [x] DONE — `expert-test8-recency-decay.logic.test.mjs` |
| 9 | Topic isolation | Activity on Topic A never changes a person's score on Topic B | [x] DONE — `expert-test9-topic-isolation.integration.test.mjs` |
| 10 | Cross-topic contamination | Heavy activity in one department doesn't leak into an unrelated topic's expert list | [x] DONE — `expert-test10-cross-topic-contamination.integration.test.mjs` |
| 11 | Human override persistence | Self-confirm, self-dismiss, and admin-confirm all survive a later `refreshTopicExpertise` re-run; a confirmed score can rise from new activity but never gets pulled back down automatically | [x] DONE — `expert-test11-human-override.integration.test.mjs` (4 sub-tests, plus a dedicated "score never decreases" check) |

**Status (2026-09-16):** all 8 scripts written and passing — 28 assertions in the 3 pure-function scripts (`npm run task10:test`), 13 subtests in the 5 DB-integration scripts (`RUN_TIER2_DB_TESTS=1 npm run task10:test:integration`), run against the real dev database and confirmed to leave no orphaned rows behind.

**Notes:**
- **Test 8** — `scripts/task-10/expertise-scoring.logic.test.mjs` already had one decay assertion (recent modest activity beats a year-old upload binge). The dedicated Test 8 script adds the full 0/30/90/180/270/360-day table from the suggestion doc.
- **Test 11** — the `EXPERT_SCORING_REDESIGN_PROPOSAL.md` implementation notes record one manual DB check where a `self_confirmed` row rose and an `inferred` row dropped ~47% after the rebalance — that was a one-off spot check, not an automated test. Test 11 turns that into 4 repeatable sub-tests (self-confirm, self-dismiss, admin-confirm, and a dedicated "confirmed score never decreases even if its signals shrink" check using the `Math.max` protection directly).
- **Gotcha hit while writing 1 and 2:** `computeExpertiseScore` always applies decay, and decay defaults to **0.5x** if `lastSignalAt` isn't set (not 1.0x). Every test explicitly pins `lastSignalAt: <now>` so the expected numbers match the suggestion doc's tables.
- **Gotcha hit while writing Test 6 (found by actually running it, not just reading the code):** creating a document also credits its owner with an "uploads" signal. Scenario E's synthetic user originally both uploaded *and* authored the lesson on the same document, silently adding an extra +0.5 the doc's "one lesson ≈ 2.0" expectation didn't account for. Fixed by giving that document a separate synthetic uploader.
- **Pre-existing data-hygiene issue found while verifying cleanup, not caused by this work:** the existing `scripts/task-10/expert-rbac.integration.test.mjs` deletes its test Organization before its test Users, but `Document.organization` is `onDelete: SetNull`, not `Cascade` — so its two Document rows survive org deletion, and the later `user.delete()` calls then fail on a foreign-key constraint (silently, since they're wrapped in `.catch(() => {})`). Every run of that script leaks 2 throwaway rows into the real dev `User` table. The 5 new integration scripts avoid this by deleting Documents (and Conversations/Messages) before the Organization and Users — verified 0 leftover rows after a full run. The 2 pre-existing leaked users are still sitting in the dev DB from past runs (`hidden-*@example.test`, `visible-*@example.test`); let me know if you'd like those deleted and that script's cleanup order fixed.

Test scripts live in `scripts/task-10/`, sharing one setup/teardown helper: `scripts/task-10/expertTestHarness.mjs`. Run them with:
- `npm run task10:test` — the 3 pure-function scripts (Tests 1, 2, 8), no database needed.
- `RUN_TIER2_DB_TESTS=1 npm run task10:test:integration` — the 5 DB-backed scripts (Tests 3, 6, 9, 10, 11) plus the existing RBAC test, against the real dev database.

---

## Part B — Doable, but only as a synthetic mechanism check (not what the doc originally intended)

| # | Test | Status |
|---|------|--------|
| 4 | Expertise ranking (multi-profile demo) | [ ] IN PROGRESS — redoing on a real topic, see below |
| 7 | False-negative ("hidden Sarah") | [ ] IN PROGRESS — redoing on a real topic, see below |

**Approach (revised 2026-09-17):** first built as a persistent demo on a fabricated `"Expert Discovery Demo"` topic — Johurul asked for it to attach to a **real topic** instead, generated from real documents (from this repo's `docs/`) uploaded through the actual product, under NGI's Engineering department and/or a new "KMS" project. That fabricated topic and its documents have been deleted (see below); the 4 demo profile accounts were kept since they're being reused.

**Current state:**
- Deleted: the `"Expert Discovery Demo"` topic, its 11 fake documents, and the lessons/questions/citations tied to them.
- Kept, for reuse: the 4 demo profile accounts in NGI (`alex.chen`, `priya.nair`, `sam.okafor`, `taylor.brooks` @ `ngi-expert-demo.example` — no password set on any of them, nobody signs in as them).
- Blocked on: Johurul uploading the real `docs/` files into NGI (Engineering department and/or a new "KMS" project, which doesn't exist in NGI yet — confirmed via a read-only check). Once a real topic exists from that upload, the 4 personas' activity (lesson/questions/citations/reading time/uploads) will be attached to it instead, telling the same story (real contributor ranks top, uploader ranks low, hidden expert outranks the uploader despite zero uploads, a stale historical contributor decays to the bottom) on real content.

---

## Part C — Not doable yet (needs real-world scale first)

| # | Test | What's missing |
|---|------|-----------------|
| 5 | Ground-truth precision/recall (20–50 real topics, human-surveyed experts) | Requires an organization already using KMS with 20–50 real active topics and people willing to name who they consider the experts. Tier 2 only started 2026-09-06 — there's no org at that scale yet. Revisit once there's real usage data to survey against. |

The acceptance-table precision/recall targets (≥80% / ≥70%) in the suggestion doc depend entirely on Test 5, so those stay parked too.

---

## Part D — Needs a product/feature decision before any test applies

These aren't test gaps — the suggestion doc proposes functionality that was never built. Nothing to verify until (if) it's built.

| Proposed feature | Current reality |
|---|---|
| Score-bucket classification (Familiar / Knowledgeable / Strong candidate / Expert candidate) | System stores a raw continuous score only — no buckets exist. |
| "Evidence Diversity" + "Evidence Quality" scoring, and the qualification rule (`score ≥ 9 AND diversity ≥ 2 AND high-quality ≥ 1`) | Not computed or stored anywhere. |
| UI labels "Expert Candidate / Confirmed Expert / Department-Verified Expert / Not an Expert" | The underlying `source` field (`inferred`/`self_confirmed`/`admin_confirmed`/`dismissed`) already exists and is returned by the API, but `experts/page.jsx` never renders it — currently only a raw score badge is shown. |
| Test 12 — explainability breakdown ("why is this person an expert") | Partial groundwork already exists: `TopicExpertise.signals` (JSON) is written on every score update but never selected by `expertDiscoveryQuery.mjs` or returned by the API. Small, well-scoped addition if wanted — not a full rebuild. |

---

## Suggested order of work

1. Write Part A's 8 scripts (no dependencies, no product decisions needed).
2. Decide whether Part B's two mechanism checks are worth writing now for confidence, even without real validation power.
3. Revisit Part C once there's a real org with meaningful topic/expert history.
4. Treat Part D as a separate, later product conversation — it's a UI/feature ask, not a test-writing task.
