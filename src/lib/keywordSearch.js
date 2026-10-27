const k1 = 1.5;
const b = 0.75;

/**
 * Normalizes text for matching file names / user question
 */
export function normalize(str = "") {
  return String(str || "")
    .toLowerCase()
    .normalize("NFKD") // fold accents
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9\s.-]/g, " ") // keep alphanum, dot, dash
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text) {
  return normalize(text).split(" ").filter(w => w.length > 2);
}

export function computeBM25(chunks, query) {
  const queryTokens = tokenize(query);
  const N = chunks.length;
  if (N === 0) return [];

  // Precompute avg document length
  const avgdl = chunks.reduce((s, c) => s + tokenize(c.text || "").length, 0) / N;

  // Precompute document frequencies DF(term)
  const df = {};
  for (const t of queryTokens) {
    df[t] = chunks.filter(c => tokenize(c.text || "").includes(t)).length || 0;
  }

  // IDF(term)
  const idf = {};
  for (const t of queryTokens) {
    const df_t = df[t];
    idf[t] = Math.log( (N - df_t + 0.5) / (df_t + 0.5) + 1 );
  }

  // BM25 score for each chunk
  const scores = chunks.map(chunk => {
    const tokens = tokenize(chunk.text || "");
    const dl = tokens.length;
    let score = 0;

    for (const t of queryTokens) {
      const tf = tokens.filter(x => x === t).length;
      if (tf === 0) continue;

      const denom = tf + k1 * (1 - b + b * (dl / avgdl));
      score += idf[t] * ((tf * (k1 + 1)) / denom);
    }

    return { ...chunk, score };
  });

  return scores.sort((a, b) => b.score - a.score);
}

// Words that carry no search meaning in a question ("which documents
// mention …", "can you find me …"), for exactQueryTerms below.
const QUERY_STOPWORDS = new Set(`
  a an and or but the of to in on at for with from by as is are was were be been being
  this that these those there here it its they them their what which who whom whose when
  where why how all any some each every can could would should will shall may might must
  do does did done have has had not no nor so than then too very just also about into
  me my mine we our you your he she his her i us please tell show give find list search
  look looking get know need want help explain describe summarize summary
  document documents doc docs file files page pages keyword keywords word words term terms
  mention mentions mentioned contain contains containing include includes including
  refer refers referring related relate regarding information info anything something
`.split(/\s+/).filter(Boolean));

/**
 * The distinctive words of a question for exact matching: letters/digits
 * (and inner dashes), at least 4 characters or a 3-letter acronym in
 * capitals (KMS), not a stop word, at most `max`, lowercased, in question
 * order. "KESTREL and KMS: which documents mention these?" → ["kestrel", "kms"].
 */
export function exactQueryTerms(question, { max = 8 } = {}) {
  const terms = [];
  for (const raw of String(question || "").split(/[^A-Za-z0-9-]+/)) {
    const original = raw.replace(/^-+|-+$/g, "");
    const term = original.toLowerCase();
    const acronym = original.length === 3 && /^[A-Z0-9]+$/.test(original) && /[A-Z]/.test(original);
    if ((term.length < 4 && !acronym) || QUERY_STOPWORDS.has(term) || /^\d+$/.test(term) || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length >= max) break;
  }
  return terms;
}

/** Whether a question asks which documents match words, rather than about their content. */
export function isDocumentListingQuestion(question) {
  const q = String(question || "");
  const docs = String.raw`\b(documents?|files?|pages?|docs?)\b`;
  return [
    new RegExp(String.raw`\b(which|what)\b[^?.]*${docs}[^?.]*\b(mention|mentions|contain|contains|have|has|include|includes|refer|refers|talk|talks|with)\b`, "i"),
    new RegExp(String.raw`\b(list|find|show|search|give)\b[^?.]*${docs}`, "i"),
    new RegExp(String.raw`${docs}[^?.]*\b(with|containing|mentioning|matching)\b[^?.]*\b(keywords?|words?|terms?)\b`, "i"),
  ].some((pattern) => pattern.test(q));
}
