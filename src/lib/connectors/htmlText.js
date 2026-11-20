// HTML → plain text for content that arrives as HTML (SharePoint pages,
// ServiceNow articles). Imported by the worker, so no imports.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML fragment → plain text, keeping paragraph and list breaks. */
export function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr|blockquote|pre)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
