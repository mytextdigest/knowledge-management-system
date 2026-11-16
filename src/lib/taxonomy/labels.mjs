// One normalisation for term labels, synonyms and category names (WS-C §4.1):
// Unicode NFKC, trimmed, single spaces, lower case. Used for duplicate checks
// and lookups, so every writer must use it.
export function normalizeLabel(label) {
  return String(label ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

// A display label as typed, trimmed and with single spaces. Empty or longer
// than `max` returns null.
export function cleanLabel(label, max = 120) {
  if (typeof label !== "string") return null;
  const value = label.trim().replace(/\s+/g, " ");
  return value && value.length <= max ? value : null;
}
