// EKP E11.3 (Workstream E, E-10): transcribing a recording that has no
// transcript (WS_E_CONTENT_COVERAGE.md §3.3). The worker extracts the audio
// (mono, 16 kHz, 32 kbit/s MP3: about 14 MB an hour), cuts it into pieces of
// about PIECE_SECONDS at a silence, sends each piece to the provider, and
// shifts each piece's segment times by where the piece starts. The result is
// cues like a .vtt's (without speakers: the provider doesn't tell speakers
// apart), chunked by time the same way, and stored on the recording itself.
//
// Shared by the worker and the app, so relative imports only.

/** Seconds of audio per piece: well under the provider's 25 MB limit, and progress moves often. */
export const PIECE_SECONDS = 600;
/** A cut moves back to a silence up to this many seconds before the target. */
const SILENCE_WINDOW = 90;

/** The audio sent to the provider: mono, 16 kHz, 32 kbit/s MP3. */
export const AUDIO_ARGS = ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k"];

/** Providers KMS can transcribe with (EQ-1). OpenAI's `whisper-1` returns segment times. */
export const TRANSCRIPTION_PROVIDERS = {
  "openai-whisper": { label: "OpenAI Whisper", model: "whisper-1", usdPerMinute: 0.006 },
};
export const DEFAULT_PROVIDER = "openai-whisper";

/** Price of transcribing `seconds` of audio, in US dollars (4 decimals, like MediaJob.costUsd). */
export function transcriptionCost(seconds, provider = DEFAULT_PROVIDER) {
  const rate = TRANSCRIPTION_PROVIDERS[provider]?.usdPerMinute ?? 0;
  return Math.round((Math.max(0, seconds) / 60) * rate * 10000) / 10000;
}

/**
 * Silences from ffmpeg's `silencedetect` log ("silence_start: 12.3" …
 * "silence_end: 14.1"), as [{ start, end }].
 */
export function parseSilences(log) {
  const out = [];
  let start = null;
  for (const line of String(log || "").split(/\r?\n/)) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) { start = Math.max(0, Number(s[1])); continue; }
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start != null) { out.push({ start, end: Number(e[1]) }); start = null; }
  }
  return out;
}

/**
 * Where to cut `duration` seconds of audio: pieces of about PIECE_SECONDS,
 * each cut moved back to the middle of the latest silence in the
 * SILENCE_WINDOW before it (so no word is split), or made at the target when
 * there's no silence there. Returns [{ start, end }] covering the whole audio.
 */
export function planPieces(duration, silences = [], { piece = PIECE_SECONDS, window = SILENCE_WINDOW } = {}) {
  if (!(duration > 0)) return [];
  const mids = silences.map((s) => (s.start + s.end) / 2).sort((a, b) => a - b);
  const pieces = [];
  let start = 0;
  while (duration - start > piece * 1.2) {
    const target = start + piece;
    const quiet = mids.filter((m) => m > target - window && m <= target).pop();
    const cut = Math.round((quiet ?? target) * 1000) / 1000;
    pieces.push({ start, end: cut });
    start = cut;
  }
  pieces.push({ start, end: duration });
  return pieces;
}

/**
 * A piece's segments (OpenAI verbose_json: { start, end, text, no_speech_prob,
 * avg_logprob }) as cues on the recording's clock. Segments the model itself
 * marks as probably not speech are dropped (Whisper can invent words in
 * silence or music).
 */
export function segmentsToCues(segments, offset = 0) {
  const cues = [];
  for (const s of segments || []) {
    const text = String(s.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (s.no_speech_prob > 0.6 && s.avg_logprob < -1) continue;
    const start = Math.round((offset + Number(s.start || 0)) * 100) / 100;
    const end = Math.round((offset + Number(s.end ?? s.start ?? 0)) * 100) / 100;
    cues.push({ start, end: Math.max(start, end), speaker: null, text });
  }
  return cues;
}
