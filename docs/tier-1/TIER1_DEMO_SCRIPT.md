# Tier 1 Demo Script

## Prep — do this 20–30 min before the demo, not live

Several Tier 1 features run on async background workers (SQS jobs: embedding, classification, clustering, duplicate/relationship detection). Uploading a document live and waiting for these to finish on stage will kill your pacing. Seed the data ahead of time:

- Upload 4–5 varied documents to a couple of departments/projects, including **one deliberate duplicate pair** (same file twice) — let classification, embedding, and duplicate detection finish in the background.
- Upload at least one document likely to land in **Needs Review** (low-confidence category, or no clear department match).
- Create 1–2 projects with docs already clustered into Topics, so "Auto-organize" has something to show instantly instead of you waiting on a recluster job live.
- If you plan to demo SharePoint, **connect it beforehand** using the NGI test tenant — do the OAuth consent + site picker off-stage, so live you only click "Sync Now."

## Part 1 — Account & Org Setup (live, ~5 min)
1. Sign up (`/auth/signup`) → OTP verification email (this is the email you just re-styled — worth pointing out the branded look).
2. Onboarding flow: create org → API key step → plan/billing selection → celebrate screen.
3. Org Settings → invite a teammate as Employee **with a department assigned directly** (this is BUG-09, freshly fixed — a nice "before this didn't work" beat if your audience is technical).
4. Settings → Members tab → change a member's role / remove one inline (BUG-12).

## Part 2 — Departments (live, ~3 min)
5. Create a department from the sidebar, land on its page.
6. Show department-scoped document view.

## Part 3 — Knowledge Repository & Ingestion (live + pre-staged, ~7 min)
7. Upload one document live (repository or department scope) — narrate that classification/dedup happen in the background, then **switch to your pre-staged documents** to show the result instantly: category badge, confidence, duplicate-flag banner with Confirm/Dismiss, suggested-department banner.
8. **Needs Review queue** (`/org/[orgId]/needs-review`, super_admin only) — show your pre-staged flagged doc, Accept/Reassign it.

## Part 4 — Projects: Reasoning & Summarization (mostly pre-staged, ~6 min)
9. Open a pre-staged project → show Topics already auto-organized (Cross-Document Reasoning) rather than clicking "Auto-organize" and waiting.
10. Open a document → AI summary already generated (Knowledge Summarization).
11. Expand the **Timeline** panel on the project page — decision events extracted automatically.
12. Ask the **document chat** a question, show the answer with citations.

## Part 5 — The flagship moment: Enterprise/Org Chat (live, spend the most time here, ~8 min)
13. Go to `/org/[orgId]/chat` and ask a real cross-document question. This single screen demonstrates the most Tier-1 capability per minute: hybrid retrieval, streaming, confidence scoring, citations — including **"Decision Evidence" citations** (Decision Tracking, not just source-doc citations), auto-generated conversation titles.
14. Ask a second question that should surface a **conflict or gap** if you seeded one, to set up the next step.

## Part 6 — Dashboard: Knowledge Health (live, ~3 min)
15. Org Dashboard → the "Knowledge Health" panel: average confidence score, **Open Conflicts** (Conflict Detection), **Top Knowledge Gaps** (Knowledge Gap Detection) — three FRs on one screen, no waiting.

## Part 7 — Context Engine (pre-staged, ~3 min)
16. On a repository document card, show the "N related" badge and a suggested-project-link banner (Confirm/Dismiss).
17. In chat, if your seeded question surfaces one, show the "Suggested people to ask" panel (Expert Discovery).

## Optional stretch (only if time and confidence allow)
18. SharePoint integration page, already connected — click **Sync Now**, show the digest email arriving.

## Explicitly skip or just mention, don't attempt live
- **Billing/Stripe checkout** — real payment flow, not worth the risk live; screenshot or skip.
- **Live OAuth consent for SharePoint** — fragile with an audience watching; only do it if pre-tested minutes before and you have a fallback.
- **Watching classification/embedding/clustering/duplicate-detection happen in real time** — these are async worker jobs, always show the *result* on pre-staged data, never the wait.
- **Full RBAC walkthrough** (switching between super_admin/dept_admin/employee/guest sessions) — real and important, but multiplies your demo time for a mostly-invisible payoff to a general audience; mention it exists rather than clicking through four logins.
- **Rank 1 Phase 2/3's less visible FRs** (Entity Extraction, Organizational Memory, Predictive/Proactive Recommendations, Workflow Assistance) — not confirmed to each have their own dedicated screen; they likely surface as signals inside chat answers rather than standalone UI. Worth a quick click-through yourself before the demo to see exactly where each shows up, rather than promising a screen you haven't checked.

---

That's roughly 30–35 minutes of live content. If you need to cut further, **Parts 3, 5, and 6** are the highest-impact/lowest-risk trio — they show ingestion → classification → chat → health in one coherent story without touching anything fragile (OAuth, payments, multi-session RBAC).
