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
