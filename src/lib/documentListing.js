// Chat: "Which documents mention X?", "Which SharePoint pages do we have?",
// "Are there any pages with "KMS Test Page"?" are answered from lookups over
// the documents the user can access (orgExactTermSearch, orgListDocuments),
// never from documents they can't. Builds that context block, with the
// instruction for the answer, and labels each document with its source.

import { orgExactTermSearch, orgListDocuments } from "@/lib/vectorSearch";
import { parseListingQuestion } from "@/lib/keywordSearch";

export const LISTING_MAX_DOCS_PER_TERM = 25;

// Shown under an answer whenever something asked for wasn't found. Fixed
// text, decided from the answer and the user's own lookups only, so it never
// hints at documents the user can't access.
export const ACCESS_NOTE = "I only search documents you have access to.";
const NOT_FOUND = [
  /\b(could not|couldn't|cannot|can't|unable to|did not|didn't)\b[^.\n]{0,40}\b(find|answer|locate|identify)\b/i,
  /\bno (documents?|pages?|files?|information|details?|mention|records?)\b/i,
  /\bnot (found|mentioned|provided|available|included|specified)\b/i,
  /\b(does|do) not (provide|contain|mention|include|specify|say)\b/i,
];

export function needsAccessNote(answer, { listingMissed = false } = {}) {
  if (String(answer || "").includes(ACCESS_NOTE)) return false;
  return listingMissed || NOT_FOUND.some((pattern) => pattern.test(String(answer || "")));
}
const LISTING_MAX_DOCS = 25;

export const LISTING_INSTRUCTION = `The user is asking which documents exist or match certain words. Answer from the "Listing results" section: for each word or phrase, list the documents that contain it (bold the word, then the document names with their kind, e.g. "SharePoint page"); for a word with no matching documents, say that no documents were found for it; for a word found in very many documents, say so instead of listing them. When the section lists documents of a kind (e.g. all SharePoint pages), list them. Do not list documents that are not in that section. You may add one short sentence on what the matching documents are about if the context shows it.`;

const SOURCE_NAMES = { sharepoint: "SharePoint", servicenow: "ServiceNow" };

/** "SharePoint page", "SharePoint file", "uploaded file" — or null if unknown. */
export function sourceLabel({ sourceProvider, contentType } = {}) {
  if (!sourceProvider && !contentType) return null;
  const kind = contentType === "page" ? "page" : contentType === "article" ? "article" : "file";
  if (!sourceProvider || sourceProvider === "manual") return `uploaded ${kind}`;
  return `${SOURCE_NAMES[sourceProvider] || sourceProvider} ${kind}`;
}

const named = (row) => {
  const label = sourceLabel(row);
  return label ? `${row.filename} (${label})` : row.filename;
};

function filterName({ sourceProvider, contentType }) {
  const source = sourceProvider ? `${SOURCE_NAMES[sourceProvider] || sourceProvider} ` : "";
  const kind = contentType === "page" ? "pages" : contentType === "file" ? "files" : "documents";
  return `${source}${kind}`;
}

export function formatKeywordMatches({ terms, rows }) {
  if (!terms.length) return "";
  const docsByTerm = new Map();
  for (const row of rows) {
    const list = docsByTerm.get(row.exactTerm) || [];
    if (!list.includes(named(row))) list.push(named(row));
    docsByTerm.set(row.exactTerm, list);
  }
  return terms
    .map(({ term, documentCount }) => {
      if (!documentCount) return `- "${term}": no documents`;
      if (documentCount > LISTING_MAX_DOCS_PER_TERM) return `- "${term}": found in ${documentCount} documents (too many to list)`;
      return `- "${term}": ${(docsByTerm.get(term) || []).join("; ")}`;
    })
    .join("\n");
}

/**
 * Run the lookups a listing question needs. Returns { block, rows, missed }:
 * the "Listing results" context block ("" if nothing to look up), the rows
 * of the documents found (for citations), and whether a word or phrase had
 * no matches.
 */
export async function buildListing(question, { userId, orgId, isSuperAdmin = false, scope, departmentId, db }) {
  const { sourceProvider, contentType, phrases, terms } = parseListingQuestion(question);
  const filters = { sourceProvider, contentType };
  const common = { userId, orgId, isSuperAdmin, scope, departmentId, ...(db ? { db } : {}), ...filters };
  const lines = [];
  const rows = [];
  let missed = false;

  for (const phrase of phrases) {
    const found = await orgListDocuments({ ...common, phrase, limit: LISTING_MAX_DOCS });
    rows.push(...found.rows);
    lines.push(
      found.total
        ? `- phrase "${phrase}": ${found.rows.map(named).join("; ")}${found.total > found.rows.length ? ` (and ${found.total - found.rows.length} more)` : ""}`
        : `- phrase "${phrase}": no documents`
    );
    if (!found.total) missed = true;
  }

  if (terms.length) {
    const matches = await orgExactTermSearch(question, { ...common, terms, maxDocsPerTerm: LISTING_MAX_DOCS_PER_TERM });
    rows.push(...matches.rows);
    lines.push(formatKeywordMatches(matches));
    if (matches.terms.some((t) => !t.documentCount)) missed = true;
  }

  // Only a kind asked for ("Which SharePoint pages do we have?"): list them.
  if (!phrases.length && !terms.length && (sourceProvider || contentType)) {
    const found = await orgListDocuments({ ...common, limit: LISTING_MAX_DOCS });
    rows.push(...found.rows);
    lines.push(
      found.total
        ? `- all ${filterName(filters)} (${found.total}): ${found.rows.map(named).join("; ")}${found.total > found.rows.length ? ` (and ${found.total - found.rows.length} more)` : ""}`
        : `- all ${filterName(filters)}: none`
    );
    if (!found.total) missed = true;
  }

  if (!lines.length) return { block: "", rows: [], missed: false };
  const scopeNote = sourceProvider || contentType ? ` (only ${filterName(filters)})` : "";
  return {
    block: `Listing results${scopeNote}, from documents this user can access:\n${lines.filter(Boolean).join("\n")}`,
    rows,
    missed,
  };
}
