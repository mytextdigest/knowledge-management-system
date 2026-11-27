# KMS Live Demo Flow (backup for the customer pitch)

Use this if someone asks for a live demo after `KMS_Customer_Presentation.pptx`. The demo follows the deck: **hook → personas → wow moments → trust**, so every click supports something they've just heard.

---

## Before the meeting (30 min before, never live)

- [ ] **Merge or pull Project Intelligence.** It isn't on local `dev` yet. If it isn't deployed, skip Step 3b and say "the project view" instead of showing it.
- [ ] Log in to the **NGI org** as a **super_admin** in one browser profile. Optional: an **employee** account in a second profile for the access-control moment (Step 6).
- [ ] Open these tabs in order: Chat → Experts → Project → Decisions → Topics trend → Knowledge Graph → Dashboard → Repository.
- [ ] **Rehearse your chat questions** against the real NGI data and keep the ones that give good, cited answers (see "Question bank"). Paste them from a note; don't type them live.
- [ ] Make sure at least one **pending decision** is waiting in the Decisions review queue (Step 5).
- [ ] Check there's at least one open conflict on the Dashboard and that topic trend data shows more than one snapshot.
- [ ] Close notifications, zoom the browser to 110–125% so the room can read it, and hide the bookmarks bar.

**Never do live:** wait for a fresh upload to process (classification and topic grouping run in the background), connect SharePoint via OAuth, open billing, or switch through four role logins.

---

## Pick a length

| Time | Steps |
|---|---|
| **5 min** | 1 → 4 → 5 |
| **10 min** | 1 → 2 → 3 → 4 → 5 |
| **20 min** | All steps, 1 → 7 |

---

## The flow

### 1. Ask: "Where do I even start?" (New hire) · `/org/[orgId]/chat`
- Paste a **cross-document question**. Point out: the answer appears as it's written, **citations** link to the sources, and there's a **confidence score**.
- Click a citation to open the source document, then show its **AI summary**.
- If it appears, point to **"Suggested people to ask."**
- **Say:** "Nobody had to know which folder this was in, or what words the document used."

### 2. Who knows this? (Subject-matter expert) · `/org/[orgId]/experts`
- Search a topic and show the ranked experts.
- **Say:** "This is built from real activity, and recent work counts more, so it shows who knows this *now*. People can confirm or correct their own expertise."
- Optional: open a document and show **"People who know this."**

### 3. Has anyone done this before? (Project lead)
- **3a. `/org/[orgId]/recommendations`:** "KMS suggests reading before you search." Switch to the **Department** view to show what's trending.
- **3b. Project page (Project Intelligence):** one view of the project's documents, topics, timeline, lessons and experts, plus related work from *other* projects.
- Show the **Lessons** panel on the project, then go back to chat and ask a **lessons question**.

### 4. It builds its own filing system (Admin, wow #2) · `/org/[orgId]/repository`
- Show documents already labeled by category, grouped into topics, with a **duplicate** banner and a **suggested department**.
- Optional: open `/org/[orgId]/needs-review` and say "anything the system isn't sure about comes here instead of being guessed."
- **Say:** "Nobody tagged any of this."

### 5. The decision nobody wrote down (Department head, wow #1, the payoff) · `/org/[orgId]/decisions`
- Open the **pending review** queue. Pick a decision and show the **quoted evidence**, whether it was **explicit or implied**, and the **confidence level**.
- **Confirm** it live (or edit, then confirm). Show its status lifecycle: active / reversed / superseded.
- Go to chat and ask the matching **"Why did we…?"** question. The answer cites the decision.
- **Say:** "This is the story from the opening slide. That decision is no longer lost."

### 6. Trust and the big picture (20-min version)
- **`/org/[orgId]/knowledge-graph`:** search a document or project, expand nodes by clicking. Point out that links are labeled as **explicit**, **inferred**, or **conflict**.
- **`/org/[orgId]/topics/trend`** (also reachable from Experts): how a topic grew over time, and how many contributors it has.
- **`/org/[orgId]/dashboard`:** the Knowledge Health panel: **open conflicts**, **top knowledge gaps**, average confidence.
- Optional access-control moment: ask the same question as an **employee** in another department and show that the restricted sources don't appear.

### 7. Close
- Go back to the closing slide: "Imagine this on your own documents. That's the pilot."

---

## Question bank (fill these in after rehearsing against NGI data)

| Purpose | Template | Your rehearsed question |
|---|---|---|
| Cross-document answer | "What is our process for …?" / "Summarize our policy on …" | |
| Decision answer | "Why did we choose …?" / "What was decided about …?" | |
| Lessons answer | "What have we learned about …?" | |
| Conflict / gap | A question where two documents disagree | |

---

## If something breaks

| Problem | What to do |
|---|---|
| Chat is slow or errors | "The model is thinking; let me show you where that answer comes from." Go to Repository → document → summary, then come back. |
| Answer is weak or has low confidence | Turn it into a point: "Notice it tells you it isn't sure, instead of making something up. That's the confidence score." |
| An empty page | Skip it and use the matching slide (8–14) as the fallback. Every demo step has a slide. |
| Asked about something on the roadmap | Answer from slide 17. Don't open unfinished screens. |

## Likely questions and where to point

- **"Can it connect to our systems?"** → SharePoint integration page (already connected; don't run OAuth live).
- **"Who can see what?"** → Department, project and role permissions, applied when content is retrieved; offer Step 6's employee view.
- **"How do we know it isn't making things up?"** → Citations, confidence scores, and human review of decisions and lessons.
- **"How much setup does it need?"** → Step 4: there's no taxonomy project; it organizes itself as documents arrive.
