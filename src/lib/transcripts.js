// EKP E11.5 (Workstream E, E-7): meeting transcripts (WebVTT and Teams Word
// transcripts) as timed cues, and the time-window chunks that search and chat
// cite as "12:34". Chunk metadata (contract: WS_E_CONTENT_COVERAGE.md §3.2):
//   { kind: "time", start: 754.2, end: 812.0, speakers: ["…"] }   (seconds)
//
// Shared by the worker and the app, so relative imports only.

/** "12:34", or "1:02:03" from an hour on. */
export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "1:02:03.5", "02:03.500", "0:0:5.30" → seconds (null if it isn't one). */
export function parseTimestamp(value) {
  const m = String(value || "").trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3].replace(",", "."));
}

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lrm;": "", "&rlm;": "" };
const decode = (s) => s.replace(/&(?:amp|lt|gt|nbsp|quot|#39|apos|lrm|rlm);/g, (e) => ENTITIES[e]);
const clean = (s) => decode(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

const TIMING = /^((?:\d+:)?\d{1,2}:\d{1,2}(?:[.,]\d+)?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{1,2}(?:[.,]\d+)?)/;

/**
 * A WebVTT file → [{ start, end, speaker, text }]. Speakers come from <v>
 * tags (Teams writes `<v Jane Smith>…</v>`); NOTE, STYLE and REGION blocks
 * and cue settings are ignored.
 */
export function parseVtt(source) {
  const blocks = String(source || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const at = lines.findIndex((l) => TIMING.test(l.trim()));
    if (at < 0) continue; // WEBVTT header, NOTE, STYLE, REGION
    const [, from, to] = lines[at].trim().match(TIMING);
    const payload = lines.slice(at + 1).join("\n");
    const voice = payload.match(/<v(?:\.[^\s>]+)*\s+([^>]+)>/);
    const text = clean(payload);
    if (!text) continue;
    cues.push({ start: parseTimestamp(from), end: parseTimestamp(to), speaker: voice ? clean(voice[1]) : null, text });
  }
  return cues;
}

// Teams Word transcripts, as mammoth's raw text:
//   newer:  "Jane Smith   0:03" then the words
//   older:  "0:0:0.0 --> 0:0:5.30" then the speaker, then the words
const SPEAKER_LINE = /^(.{1,80}?)\s+((?:\d+:)?\d{1,2}:\d{2})$/;

/**
 * A Teams Word transcript's text → cues, or null when the text isn't a
 * transcript (fewer than three timed turns), so the .docx is read as a
 * normal document.
 */
export function parseWordTranscript(text) {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const cues = [];
  let current = null;
  const close = () => { if (current?.text) cues.push(current); current = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timing = line.match(TIMING);
    if (timing) {
      close();
      const speaker = lines[i + 1] && !TIMING.test(lines[i + 1]) && !SPEAKER_LINE.test(lines[i + 1]) && lines[i + 2] && !TIMING.test(lines[i + 2]) ? lines[++i] : null;
      current = { start: parseTimestamp(timing[1]), end: parseTimestamp(timing[2]), speaker, text: "" };
      continue;
    }
    const turn = line.match(SPEAKER_LINE);
    if (turn && parseTimestamp(turn[2]) != null) {
      close();
      current = { start: parseTimestamp(turn[2]), end: null, speaker: turn[1].trim(), text: "" };
      continue;
    }
    if (current) current.text = current.text ? `${current.text} ${line}` : line;
  }
  close();
  if (cues.length < 3) return null;
  // The newer format gives start times only: a turn ends where the next begins.
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].end != null) continue;
    const next = cues[i + 1]?.start;
    cues[i].end = next != null && next > cues[i].start ? next : cues[i].start + Math.max(2, cues[i].text.split(/\s+/).length / 2.5);
  }
  return cues.map((c) => ({ ...c, text: clean(c.text) }));
}

/**
 * Cues → chunks of about a minute, cut at cue boundaries: a chunk closes
 * once it spans `target` seconds, and before it would pass `max` seconds or
 * `maxChars` characters. Each line is "[m:ss] Speaker: words", with a
 * speaker's consecutive cues joined.
 */
export function chunkTranscript(cues, { target = 60, max = 90, maxChars = 2000 } = {}) {
  const chunks = [];
  let lines = [];
  let start = null;
  let end = null;
  let speakers = new Set();
  let chars = 0;
  let last = null; // the open line: { speaker, at, words }

  const lineText = (l) => `[${formatTimestamp(l.at)}] ${l.speaker ? `${l.speaker}: ` : ""}${l.words}`;
  const flush = () => {
    if (last) lines.push(lineText(last));
    if (lines.length) {
      chunks.push({
        text: lines.join("\n"),
        metadata: { kind: "time", start: round(start), end: round(end), speakers: [...speakers] },
      });
    }
    lines = []; start = null; end = null; speakers = new Set(); chars = 0; last = null;
  };

  for (const cue of cues || []) {
    if (!cue?.text || cue.start == null) continue;
    const cueEnd = Math.max(cue.end ?? cue.start, cue.start);
    if (start != null && (cueEnd - start > max || chars + cue.text.length > maxChars)) flush();
    if (start == null) start = cue.start;
    end = Math.max(end ?? cueEnd, cueEnd);
    if (cue.speaker) speakers.add(cue.speaker);
    if (last && last.speaker === cue.speaker) {
      last.words += ` ${cue.text}`;
    } else {
      if (last) lines.push(lineText(last));
      last = { speaker: cue.speaker, at: cue.start, words: cue.text };
    }
    chars += cue.text.length + 1;
    if (end - start >= target) flush();
  }
  flush();
  return chunks;
}

const round = (n) => Math.round(n * 10) / 10;

/** The full transcript as text (Document.content): one "[m:ss] Speaker: words" line per turn. */
export function transcriptText(chunks) {
  return chunks.map((c) => c.text).join("\n");
}

/** The time range a chunk covers, or null when it isn't a transcript chunk. */
export function timeOf(chunk) {
  const meta = chunk?.metadata;
  return meta?.kind === "time" && Number.isFinite(meta.start) ? { start: meta.start, end: meta.end ?? meta.start } : null;
}
