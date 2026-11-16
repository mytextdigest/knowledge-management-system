// EKP E11.1 (Workstream E, E-5): PowerPoint slides in citations and the viewer.
// Chunk metadata { kind: "slide", slide, of, title, hasNotes, hidden?, part? }
// is written by worker/extractPptx.js (contract: WS_E_CONTENT_COVERAGE.md §3.2).

const NOTES_MARKER = "Speaker notes:\n";

/** The slide a chunk came from, or null when it isn't a slide. */
export function slideOf(chunk) {
  const meta = chunk?.metadata;
  return meta?.kind === "slide" && Number.isInteger(meta.slide) ? meta.slide : null;
}

/** documentId + slide numbers → { slides, locator: "slide 7", viewerUrl } (or {} without slides). */
export function slideCitation(documentId, slideNumbers) {
  const slides = [...new Set(slideNumbers)].filter(Number.isInteger).sort((a, b) => a - b);
  if (!slides.length) return {};
  return {
    slides,
    locator: `${slides.length === 1 ? "slide" : "slides"} ${slides.slice(0, 4).join(", ")}${slides.length > 4 ? "…" : ""}`,
    viewerUrl: `/document?id=${encodeURIComponent(documentId)}&slide=${slides[0]}`,
  };
}

/** Chunk rows → { slides: [{ slide, title, hidden, body, notes }], total }. */
export function slidesFromChunks(chunks = []) {
  const bySlide = new Map();
  let total = 0;
  for (const chunk of chunks || []) {
    const slide = slideOf(chunk);
    if (!slide) continue;
    const meta = chunk.metadata;
    total = Math.max(total, Number.isInteger(meta.of) ? meta.of : 0, slide);
    const entry = bySlide.get(slide) || { slide, title: meta.title || "", hidden: Boolean(meta.hidden), parts: [] };
    entry.parts.push({ part: meta.part || 1, text: String(chunk.text || "") });
    bySlide.set(slide, entry);
  }
  const slides = [...bySlide.values()]
    .sort((a, b) => a.slide - b.slide)
    .map(({ parts, ...s }) => {
      const text = parts.sort((a, b) => a.part - b.part).map((p) => p.text).join("\n");
      const content = text.replace(/^Slide \d+[^\n]*\n*/, "");
      const at = content.startsWith(NOTES_MARKER) ? 0 : content.indexOf(`\n\n${NOTES_MARKER}`);
      if (at < 0) return { ...s, body: content.trim(), notes: "" };
      const notesStart = content.indexOf(NOTES_MARKER, at) + NOTES_MARKER.length;
      return { ...s, body: content.slice(0, at).trim(), notes: content.slice(notesStart).trim() };
    });
  return { slides, total };
}
