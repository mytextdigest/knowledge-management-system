// Decision Extraction v2 — implicit detection + evidence-backed extraction.
// See docs/tier-2/REQUIREMENTS_DECISION_EXTRACTION_V2_HITL.md, FR-1.
//
// Replaces worker/summarize.js's extractDecisions() in the live pipeline
// (worker/index.js). That function is kept, unused by the pipeline, as the
// v1 baseline for the evaluation harness (scripts/research/).
//
// Key differences from v1: reads raw Chunk.text (not chunk summaries), so it
// can see the implicit-decision language ("Okay, I'll proceed with X",
// "I've created the migration tickets") that per-chunk summarization drops;
// detects a fixed vocabulary of evidence signals per candidate rather than
// asking the model for a confidence number; computes certainty
// deterministically in code from those signals; requires every stored
// evidence quote to verify as a substring of its source chunk; and caps
// candidate-tier output per document (Decision 7: 5).

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Additive scoring, adapted from the source discussion
// (temp/discusson-decision-extraction.md, section 8) — heuristic starting
// weights, meant to be tuned against the FR-7 evaluation harness, not a
// claim of calibration. Model output is restricted to exactly these labels;
// anything else returned is dropped before storage or scoring.
export const POSITIVE_SIGNAL_WEIGHTS = {
  explicit_decision: 3,
  explicit_commitment: 3,
  approval: 3,
  directive: 2,
  resolved_discussion: 2,
  implementation_action: 2,
  assumed_direction: 1,
};

export const NEGATIVE_SIGNAL_WEIGHTS = {
  described_as_proposal: -3,
  open_question_remains: -3,
  conditional_language: -2,
  experimental_language: -2,
};

export const SIGNAL_WEIGHTS = { ...POSITIVE_SIGNAL_WEIGHTS, ...NEGATIVE_SIGNAL_WEIGHTS };
export const SIGNAL_VOCABULARY = Object.keys(SIGNAL_WEIGHTS);

// Matches DecisionEvidence.type's comment in prisma/schema.prisma.
export const EVIDENCE_TYPES = [
  "explicit_statement",
  "approval",
  "commitment",
  "directive",
  "resolved_discussion",
  "follow_up_action",
  "assumed_direction",
];

// Decision 7: keep only the 5 highest-scoring candidate-tier rows per
// document; the rest are discarded, not merely hidden.
const CANDIDATE_CAP_PER_DOCUMENT = 5;

// Per-document raw-text budget across all batches. Larger than v1's 24,000
// char cap on chunk *summaries* since raw text is far less dense — this is a
// prompt-cost guardrail, not a tuning target; FR-7's harness measures actual
// per-document cost and this constant should move if that measurement says so.
const DOCUMENT_CHAR_CAP = 40000;

// Per-LLM-call budget — chunks are grouped into consecutive-in-document
// batches up to this size rather than one call per chunk (cost) or one call
// for the whole document (loses the model's ability to actually read
// everything within its context budget).
const BATCH_CHAR_SIZE = 10000;

export function computeScore(signals) {
  return (signals || []).reduce((sum, s) => sum + (SIGNAL_WEIGHTS[s] || 0), 0);
}

export function scoreToCertainty(score) {
  if (score >= 7) return "confirmed";
  if (score >= 4) return "likely";
  if (score >= 1) return "candidate";
  return null;
}

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatementKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeStatementKey(text).split(" ").filter(Boolean));
}

// Within-document dedup: two candidates naming the same choice in different
// words (found in different batches, or via different evidence) are merged
// rather than stored twice. Deliberately simple (Jaccard over word tokens)
// since this only needs to catch near-duplicate restatements within one
// document's own extraction pass, not fuzzy matching across documents.
function jaccardSimilarity(a, b) {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

const MERGE_SIMILARITY_THRESHOLD = 0.6;

// Reused by worker/reconcileDecisions.js (FR-3) to match a new extraction
// against a preserved row by its original wording — same similarity notion
// as within-document dedup above, just applied across a regenerate run
// instead of within one extraction pass.
export function statementsMatch(a, b, threshold = MERGE_SIMILARITY_THRESHOLD) {
  return jaccardSimilarity(a, b) >= threshold;
}

function parseDecidedAt(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const date = new Date(match[0]);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Cheap keyword pre-filter, only used when a document's total raw chunk text
// exceeds DOCUMENT_CHAR_CAP — same "cheap filter before spending LLM budget"
// shape as summarize.js's isRetrospectiveShaped, applied here to rank which
// chunks are most worth spending that budget on rather than truncating from
// the start of the document.
const DECISION_KEYWORD_PATTERN =
  /\b(decided|decision|approved|approval|commit(?:ted|ting)?|going forward|from now on|let'?s go with|we'?ll (?:use|proceed|move forward)|directive|agreed|resolved|finaliz(?:ed|ing))\b/gi;

function keywordScore(text) {
  const matches = String(text || "").match(DECISION_KEYWORD_PATTERN);
  return matches ? matches.length : 0;
}

function selectChunksForExtraction(chunks) {
  const totalChars = chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0);
  if (totalChars <= DOCUMENT_CHAR_CAP) return chunks;

  const ranked = [...chunks].sort((a, b) => keywordScore(b.text) - keywordScore(a.text));
  const selected = [];
  let used = 0;
  for (const chunk of ranked) {
    const len = chunk.text?.length || 0;
    if (selected.length > 0 && used + len > DOCUMENT_CHAR_CAP) continue;
    selected.push(chunk);
    used += len;
    if (used >= DOCUMENT_CHAR_CAP) break;
  }
  return selected.sort((a, b) => a.chunkIndex - b.chunkIndex);
}

function buildBatches(chunks) {
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const batches = [];
  let current = [];
  let currentLen = 0;
  for (const chunk of sorted) {
    const len = chunk.text?.length || 0;
    if (current.length && currentLen + len > BATCH_CHAR_SIZE) {
      batches.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(chunk);
    currentLen += len;
  }
  if (current.length) batches.push(current);
  return batches;
}

function buildPrompt(filename, batchChunks, { isPolicyDoc }) {
  const text = batchChunks.map((c) => c.text).join("\n\n");

  // Decision 3: standing policies/SOP steps are not decisions unless the
  // text records the act of choosing or changing something. Directive
  // phrasing ("must", "is required", "engineers must...") is common in SOP
  // text for describing an ongoing rule, not for announcing a change — a
  // rule stated in the imperative is still not a decision by itself, so the
  // exclusion needs to say that explicitly, not just define what counts.
  const policyNote = isPolicyDoc
    ? `\n\nThis document is a standing policy/SOP. A sentence written as an ongoing rule or required procedure step — even when phrased as a directive ("engineers must acknowledge alerts within 5 minutes", "a written postmortem is required for every SEV-1 incident", "expense reports must be submitted within 30 days") — is NOT a decision by itself, no matter how firm, mandatory, or confident its wording sounds. This applies even if the sentence itself uses the word "must", "required", or "is mandatory" — those words describe an ongoing rule's strength, not a decision being made right now.

Before extracting anything from this document, ask: does the text show a *change* — a specific prior value/rule and a new one, or an effective date the rule started/changed on? If you cannot point to that, do not extract the sentence, and do not assign it any signal (not explicit_decision, not directive, not approval), regardless of how declarative it reads.

Only extract text that shows that change (e.g. "effective Q3, the approval threshold was raised from $500 to $1,000", "starting this sprint, postmortems are now due in 2 business days instead of 5", "we used to require director sign-off; as of this policy, VP sign-off is required instead"). A plain restatement of a rule — even one written elsewhere in this same document as a rule you might expect to instead extract — is not that, and must be excluded entirely.`
    : "";

  return `
Identify decisions — explicit and implicit — made or recorded in the document "${filename}" from the text below.

A decision is a choice, commitment, approval, directive that records a choice or change, or settled course of action that determines what an individual, team, or organization will do or use. It does not require the words "decided" or "approved" — it may be expressed through commitments, directives, resolved discussions, or actions that clearly follow from a choice (e.g. a question raised earlier, then later "I've created the migration tickets" or "staging is now running on it").

Do NOT treat any of the following as a decision by itself: a proposal or suggestion, an option being considered, a recommendation without acceptance, an open question, a conditional/uncommitted intention, an experiment or investigation, a hypothetical statement, a plan that has not been committed to, or an action that doesn't establish a choice was actually made.

Pay attention to the document's own framing, not just individual sentences. A title, heading, or section like "Proposed Optimization", "Estimated Cost After Optimization", "Draft", "Plan", or "Version 1 (not yet approved)" signals that the items listed under it are options being proposed or estimated, not decisions that were made — even when each bullet is phrased as an imperative action ("Migrate the database to X", "Reduce the instance size"). Imperative phrasing describes *what the option would involve*, not that it was chosen. Only extract from that kind of document if it also states, separately from the proposal itself, that the proposed action was actually approved, chosen, or carried out (e.g. a later "Completed Changes" section, a follow-up document, or an explicit approval sentence). When you can't tell whether a section is proposing something or reporting that it already happened, treat it as a proposal and do not extract it.${policyNote}

For every decision found, choose zero or more signals from this exact list that apply — do not invent other labels:
${SIGNAL_VOCABULARY.map((s) => `- ${s}`).join("\n")}

For every decision found, cite one or more pieces of evidence. Each quote must be copied verbatim (exact substring) from the text below, not paraphrased or summarized — evidence that isn't an exact quote will be discarded. Each evidence type must be from this exact list: ${EVIDENCE_TYPES.join(", ")}.

Return JSON with exactly:
{
  "decisions": [{
    "statement": "the choice, stated concisely in your own words",
    "subject": "the issue/topic being decided, or null",
    "rationale": "why it was decided, or null if not stated",
    "decidedAt": "YYYY-MM-DD date the decision was made, or null if no date is given",
    "explicitness": "explicit" | "implicit",
    "actors": ["person/team names involved, or an empty array"],
    "alternatives": ["alternatives explicitly considered, or an empty array"],
    "signals": ["zero or more labels from the fixed list above"],
    "evidence": [{ "quote": "exact verbatim quote from the text below", "type": "one of the fixed evidence types" }]
  }]
}

Text:
${text.slice(0, BATCH_CHAR_SIZE + 2000)}
`;
}

function mergeDecisions(candidates) {
  const merged = [];
  for (const candidate of candidates) {
    const existing = merged.find((m) => jaccardSimilarity(m.statement, candidate.statement) >= MERGE_SIMILARITY_THRESHOLD);
    if (!existing) {
      merged.push({
        ...candidate,
        evidence: [...candidate.evidence],
        signals: [...candidate.signals],
        actors: [...candidate.actors],
        alternatives: [...candidate.alternatives],
      });
      continue;
    }
    const seenQuotes = new Set(existing.evidence.map((e) => normalizeForMatch(e.quote)));
    for (const e of candidate.evidence) {
      const key = normalizeForMatch(e.quote);
      if (!seenQuotes.has(key)) {
        existing.evidence.push(e);
        seenQuotes.add(key);
      }
    }
    existing.signals = [...new Set([...existing.signals, ...candidate.signals])];
    existing.actors = [...new Set([...existing.actors, ...candidate.actors])];
    existing.alternatives = [...new Set([...existing.alternatives, ...candidate.alternatives])];
    if (candidate.statement.length > existing.statement.length) existing.statement = candidate.statement;
    if (!existing.rationale && candidate.rationale) existing.rationale = candidate.rationale;
    if (!existing.decidedAt && candidate.decidedAt) existing.decidedAt = candidate.decidedAt;
    if (existing.explicitness !== "explicit" && candidate.explicitness === "explicit") existing.explicitness = "explicit";
    if (candidate.subject && !existing.subject) existing.subject = candidate.subject;
  }
  return merged;
}

function capCandidates(decisions) {
  const nonCandidates = decisions.filter((d) => d.certainty !== "candidate");
  const cappedCandidates = decisions
    .filter((d) => d.certainty === "candidate")
    .sort((a, b) => b.score - a.score || b.evidence.length - a.evidence.length)
    .slice(0, CANDIDATE_CAP_PER_DOCUMENT);
  return [...nonCandidates, ...cappedCandidates];
}

/**
 * chunks: [{ id, chunkIndex, text }] — raw Chunk rows for one document, any order.
 * category: the document's classified category (Document.category), used to
 * decide whether Policy/SOP mode applies.
 * Returns decisions ready to persist, each already merged/scored/capped:
 * { statement, subject, rationale, decidedAt, explicitness, actors,
 *   alternatives, signals, score, certainty,
 *   evidence: [{ quote, type, chunkIndex, chunkId }] }
 */
export async function extractDecisionsV2(openai, { chunks, filename, category }) {
  const validChunks = (chunks || []).filter((c) => c.text && c.text.trim());
  if (!validChunks.length) return [];

  const selected = selectChunksForExtraction(validChunks);
  const batches = buildBatches(selected);
  const isPolicyDoc = category === "Policies" || category === "SOPs";

  const rawCandidates = [];

  for (const batch of batches) {
    const prompt = buildPrompt(filename, batch, { isPolicyDoc });

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract decisions — explicit and implicit — and their supporting evidence from organizational documents. You must output only valid JSON. Do not include markdown or commentary.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      });
    } catch (err) {
      // Non-fatal per-batch: one bad batch (rate limit, transient API error)
      // shouldn't sink every decision found in the rest of the document.
      console.error("⚠️ Decision extraction v2 batch failed (non-fatal, skipping batch):", err.message);
      continue;
    }

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    const parsed = safeJsonParse(raw, { decisions: [] });
    const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];

    for (const d of decisions) {
      const statement = String(d?.statement || "").trim();
      if (!statement) continue;

      const rawEvidence = Array.isArray(d?.evidence) ? d.evidence : [];
      const verifiedEvidence = [];
      for (const e of rawEvidence) {
        const quote = String(e?.quote || "").trim();
        const type = EVIDENCE_TYPES.includes(e?.type) ? e.type : null;
        if (!quote || !type) continue;
        const normalizedQuote = normalizeForMatch(quote);
        if (normalizedQuote.length < 8) continue; // too short to be meaningful, verifiable evidence
        const match = batch.find((c) => normalizeForMatch(c.text).includes(normalizedQuote));
        if (!match) continue; // fabricated/paraphrased quote — discard, don't store unverifiable evidence
        verifiedEvidence.push({ quote, type, chunkIndex: match.chunkIndex, chunkId: match.id });
      }
      if (!verifiedEvidence.length) continue; // no verified support → discard the whole candidate

      const signals = Array.isArray(d?.signals)
        ? [...new Set(d.signals.filter((s) => SIGNAL_VOCABULARY.includes(s)))]
        : [];

      rawCandidates.push({
        statement,
        subject: d?.subject ? String(d.subject).trim() || null : null,
        rationale: d?.rationale ? String(d.rationale).trim() || null : null,
        decidedAt: parseDecidedAt(d?.decidedAt),
        explicitness: d?.explicitness === "implicit" ? "implicit" : "explicit",
        actors: Array.isArray(d?.actors) ? d.actors.map((a) => String(a).trim()).filter(Boolean) : [],
        alternatives: Array.isArray(d?.alternatives) ? d.alternatives.map((a) => String(a).trim()).filter(Boolean) : [],
        signals,
        evidence: verifiedEvidence,
      });
    }
  }

  const merged = mergeDecisions(rawCandidates);

  const scored = merged
    .map((d) => {
      const score = computeScore(d.signals);
      return { ...d, score, certainty: scoreToCertainty(score) };
    })
    .filter((d) => d.certainty !== null); // score <= 0 → not stored

  return capCandidates(scored);
}
