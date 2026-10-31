# How KMS Decides Who's an Expert

KMS doesn't ask people to declare themselves an expert. Instead, it quietly watches for signs that someone really understands a topic, and adds those up into a score.

## What earns points

- **Writing a lesson learned about it** — the strongest signal. If you took the time to write up what happened, what worked, and what didn't, that's real proof you understand it. *(worth the most)*
- **Asking real questions about a document** — using the AI assistant to dig into a document counts as genuine engagement, not just skimming it.
- **Being cited** — if your document gets pulled into an AI-generated answer, that's a sign your contribution is actually useful to others.
- **Uploading related documents** — having material on the topic counts a little, but only a little.
- **Being in a department that works with the topic** — a very small nudge, mainly so brand-new topics still show *someone* before more activity builds up.

## What doesn't count much (on purpose)

Just uploading a file used to count for a lot — enough that someone who dumped a folder of documents could look like the office expert without ever reading any of them. That's being fixed: uploading still counts a little, but it's now capped, so it can never outweigh someone who's actually engaged with the material.

## It fades over time

Expertise isn't permanent. If someone hasn't touched a topic in a while, their score gradually fades — over about 3 months of no activity, it roughly halves. This keeps the list pointing at who's *currently* sharp on something, not just who happened to do something once, a year ago.

## People have the final say

The algorithm's guess is just a starting point. Anyone can confirm ("yes, that's accurate") or dismiss ("no, that's not me") their own listing, and a department admin can directly name someone a subject-matter expert. Once a person confirms or a listing is dismissed, the algorithm won't quietly overwrite that decision.

## The mechanics

Each person gets a separate score per topic, built from seven signals. Every signal has its own per-action value and its own ceiling, so no single behavior can ever dominate the total on its own:

- **Published Lesson Learned authored** — 2 points each, up to 4 points total.
- **Focused reading time** — 0.1 points per minute spent actually reading a document, up to 3 points total.
- **Questions asked about a document** — 0.4 points each, up to 3 points total.
- **Cited in an AI-generated answer** — 0.35 points each, up to 2 points total.
- **Document viewed or downloaded** — 0.15 points each, up to 1.5 points total.
- **Document uploaded** — 0.5 points each, up to 1.5 points total.
- **Department overlap with the topic** — 0.25 points each, up to 0.5 points total.

These are added up into one raw number, then reduced by how long it's been since that person last did anything on the topic — the reduction halves every 90 days, so activity from three months ago counts for about half as much, six months ago about a quarter, and so on. The number left after that reduction is the score shown.

"Focused reading time" only counts time the browser tab is actually active — it pauses the moment someone switches away, discards anything under 15 seconds as a quick bounce rather than a read, and caps a single sitting at 20 minutes, so leaving a tab open and walking away can't inflate the number.

Recalculation only ever applies to listings nobody has acted on yet. Once a person confirms their own listing, or an admin confirms it for them, new activity can still push the score up, but the algorithm will never pull it back down on its own.
