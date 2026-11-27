// EKP E11.1/E11.5 (Workstream E, E-9): where in a document a search hit is,
// as a citation: "slide 7" (opens the deck there) or "12:34" (plays the
// recording from there; a linked transcript's hit opens its recording).
import { slideOf, slideCitation } from "./slideCitations.js";
import { timeOf, timeCitation } from "./transcripts.js";

/** A chunk row (document_id, metadata) → { locator, viewerUrl, … } or {}. */
export function chunkLocation(row, recording = null) {
  const slide = slideOf(row);
  if (slide) return slideCitation(row.document_id, [slide]);
  const time = timeOf(row);
  if (time) return timeCitation(row.document_id, [time.start], recording);
  return {};
}
