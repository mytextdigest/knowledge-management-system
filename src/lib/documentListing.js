// Chat: "Which documents mention X?" questions are answered from
// exact-word matches over the documents the user can access
// (orgExactTermSearch), never from documents they can't. Formats those
// matches as a context block, with the instruction for the answer.

export const LISTING_MAX_DOCS_PER_TERM = 25;

export const LISTING_INSTRUCTION = `The user is asking which documents match certain words. Answer from the "Keyword matches" section: for each word, list the documents that contain it (bold the word, then the document names); for a word with no matching documents, say that no documents were found for it; for a word found in very many documents, say so instead of listing them. Do not list documents that are not in that section. You may add one short sentence on what the matching documents are about if the context shows it.`;

export function formatKeywordMatches({ terms, rows }) {
  if (!terms.length) return "";
  const docsByTerm = new Map();
  for (const row of rows) {
    const list = docsByTerm.get(row.exactTerm) || [];
    if (!list.includes(row.filename)) list.push(row.filename);
    docsByTerm.set(row.exactTerm, list);
  }
  const lines = terms.map(({ term, documentCount }) => {
    if (!documentCount) return `- "${term}": no documents`;
    if (documentCount > LISTING_MAX_DOCS_PER_TERM) return `- "${term}": found in ${documentCount} documents (too many to list)`;
    return `- "${term}": ${(docsByTerm.get(term) || []).join("; ")}`;
  });
  return `Keyword matches (exact words, in documents this user can access):\n${lines.join("\n")}`;
}
