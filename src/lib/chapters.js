// EKP E11.7 (Workstream E, E-11): a recording's chapters, the list of topic
// segments with start and end times that NYPA accepts as video segmentation
// (Q&A #18). One LLM pass over the timed transcript (provided or KMS's own)
// returns topics with the time each starts; KMS checks them and stores
// [{ title, start, end }] in Document.mediaSegments.
//
// Shared by the worker and the app, so relative imports only.

import { formatTimestamp } from "./transcripts.js";

/** Recordings shorter than this get no chapters. */
export const MIN_CHAPTER_RECORDING_SECONDS = 120;
/** Chapters closer together than this are merged into the earlier one. */
const MIN_CHAPTER_SECONDS = 30;
const MAX_CHAPTERS = 20;
/** About 40k tokens; longer transcripts are shortened (chapterInput). */
const MAX_PROMPT_CHARS = 160_000;

/**
 * The transcript as "[m:ss] Speaker: words" lines, shortened to fit: long
 * lines are cut to their first 200 characters, then, if it's still too long,
 * every k-th line is kept (the topics still show, with their times).
 */
export function chapterInput(lines) {
  const fmt = (l) => `[${formatTimestamp(l.start)}] ${l.speaker ? `${l.speaker}: ` : ""}${l.text}`;
  const full = lines.map(fmt);
  if (full.join("\n").length <= MAX_PROMPT_CHARS) return full.join("\n");
  const cut = full.map((l) => (l.length > 200 ? `${l.slice(0, 200)}…` : l));
  const size = cut.reduce((n, l) => n + l.length + 1, 0);
  const every = Math.max(1, Math.ceil(size / MAX_PROMPT_CHARS));
  return cut.filter((_, i) => i % every === 0).join("\n");
}

export const CHAPTER_INSTRUCTIONS = [
  "You split a meeting or talk transcript into chapters: the topics in the order they were discussed.",
  "Each line starts with the time it was said, as [m:ss] or [h:mm:ss].",
  'Reply with JSON only: {"chapters":[{"title":"…","start":"m:ss"}]}.',
  "- start: the time of the line where the topic begins, copied from the transcript. The first chapter starts at the first line.",
  "- title: what the topic is about, 2 to 8 words, no numbering, written in the same language as the transcript lines (English lines get English titles).",
  "- About one chapter per 3 to 10 minutes; at least 2 and at most 20. Don't make a chapter for greetings alone.",
].join("\n");

/**
 * The model's reply → [{ title, start, end }] (seconds), checked: times parse
 * and fall inside the recording, in order, at least MIN_CHAPTER_SECONDS
 * apart, each ending where the next starts and the last at `duration`.
 * Returns [] when fewer than two chapters survive.
 */
export function parseChapters(reply, { duration, firstStart = 0 }) {
  let data;
  try { data = typeof reply === "string" ? JSON.parse(reply) : reply; } catch { return []; }
  const toSeconds = (v) => {
    if (typeof v === "number") return v;
    const parts = String(v ?? "").trim().replace(/^\[|\]$/g, "").split(":").map(Number);
    if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };
  const end = duration > 0 ? duration : Infinity;
  const items = (Array.isArray(data?.chapters) ? data.chapters : [])
    .map((c) => ({ title: String(c?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80), start: toSeconds(c?.start) }))
    .filter((c) => c.title && Number.isFinite(c.start) && c.start < end)
    .sort((a, b) => a.start - b.start);
  const kept = [];
  for (const c of items) {
    const prev = kept[kept.length - 1];
    if (prev && c.start - prev.start < MIN_CHAPTER_SECONDS) continue;
    kept.push(c);
  }
  if (kept.length) kept[0].start = Math.min(kept[0].start, firstStart);
  const chapters = kept.slice(0, MAX_CHAPTERS).map((c, i, all) => ({
    title: c.title,
    start: Math.round(c.start * 10) / 10,
    end: Math.round((i + 1 < all.length ? all[i + 1].start : Number.isFinite(end) ? end : c.start) * 10) / 10,
  }));
  return chapters.length >= 2 ? chapters : [];
}
