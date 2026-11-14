// EKP E11.3 / E11.7 (Workstream E, E-10, E-11): transcription when a
// recording has no transcript, and chapters.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSilences, planPieces, segmentsToCues, transcriptionCost, PIECE_SECONDS } from "../../src/lib/transcription.js";
import { parseChapters, chapterInput } from "../../src/lib/chapters.js";
import { dropGeneratedTranscript, hasLinkedTranscript, autoTranscribeDelaySeconds } from "../../src/lib/generatedTranscript.js";
import { firstMissingStage } from "../../src/lib/documentPipeline.js";
import { SETTINGS_REGISTRY } from "../../src/lib/settings/registry.mjs";
import { chunkTranscript } from "../../src/lib/transcripts.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("silences are read from ffmpeg's silencedetect log", () => {
  const log = "[silencedetect @ 0x1] silence_start: 12.5\n[silencedetect @ 0x1] silence_end: 14.1 | silence_duration: 1.6\nsize=N/A\n[silencedetect @ 0x1] silence_start: -0.01\n[silencedetect @ 0x1] silence_end: 0.4 | silence_duration: 0.41";
  assert.deepEqual(parseSilences(log), [{ start: 12.5, end: 14.1 }, { start: 0, end: 0.4 }]);
});

test("audio is cut into ~10-minute pieces at a silence, covering all of it", () => {
  assert.deepEqual(planPieces(470.5), [{ start: 0, end: 470.5 }], "short: one piece");
  const silences = [{ start: 560, end: 562 }, { start: 590, end: 594 }, { start: 1180, end: 1181 }];
  const pieces = planPieces(1900, silences);
  assert.deepEqual(pieces.map((p) => [p.start, p.end]), [[0, 592], [592, 1180.5], [1180.5, 1900]]);
  const noSilence = planPieces(3 * 3600, []);
  assert.equal(noSilence[0].end, PIECE_SECONDS, "no silence near the target: cut at the target");
  assert.equal(noSilence.at(-1).end, 3 * 3600);
  for (let i = 1; i < noSilence.length; i++) assert.equal(noSilence[i].start, noSilence[i - 1].end, "no gaps, no overlaps");
  assert.deepEqual(planPieces(0), []);
});

test("segments become cues on the recording's clock; probable non-speech is dropped", () => {
  const cues = segmentsToCues([
    { start: 0, end: 4.2, text: "  Good afternoon,   everyone. ", no_speech_prob: 0.01, avg_logprob: -0.2 },
    { start: 4.2, end: 9, text: "Thank you for watching.", no_speech_prob: 0.9, avg_logprob: -1.4 },
    { start: 9, end: 12, text: "" },
  ], 600);
  assert.deepEqual(cues, [{ start: 600, end: 604.2, speaker: null, text: "Good afternoon, everyone." }]);
  const chunks = chunkTranscript(cues);
  assert.equal(chunks[0].metadata.kind, "time");
  assert.equal(chunks[0].text, "[10:00] Good afternoon, everyone.", "no speaker name in the line");
  const two = chunkTranscript([{ start: 1, end: 3, speaker: null, text: "One." }, { start: 4, end: 6, speaker: null, text: "Two." }]);
  assert.equal(two[0].text, "[0:01] One.\n[0:04] Two.", "unnamed lines keep their own times");
});

test("cost: OpenAI Whisper at $0.006 a minute", () => {
  assert.equal(transcriptionCost(3600), 0.36);
  assert.equal(transcriptionCost(470.5), 0.0471);
});

test("chapters: times checked, sorted, merged when too close, each ending at the next", () => {
  const reply = JSON.stringify({ chapters: [
    { title: "Transformer T2 oil results", start: "2:13" },
    { title: "Welcome and agenda", start: "0:01" },
    { title: "Bay 4 breaker SF6 leak", start: "0:34" },
    { title: "Too close to the last one", start: "0:40" },
    { title: "Outage window", start: "5:03" },
    { title: "Past the end", start: "1:02:00" },
    { title: "", start: "6:00" },
  ] });
  assert.deepEqual(parseChapters(reply, { duration: 470.5, firstStart: 1 }), [
    { title: "Welcome and agenda", start: 1, end: 34 },
    { title: "Bay 4 breaker SF6 leak", start: 34, end: 133 },
    { title: "Transformer T2 oil results", start: 133, end: 303 },
    { title: "Outage window", start: 303, end: 470.5 },
  ]);
  assert.deepEqual(parseChapters("not json", { duration: 100 }), []);
  assert.deepEqual(parseChapters({ chapters: [{ title: "Only one", start: 0 }] }, { duration: 600 }), [], "one chapter isn't a chapter list");
});

test("chapter input: timed lines, shortened when the transcript is very long", () => {
  assert.equal(chapterInput([{ start: 754, speaker: "Dev Raman", text: "Hi" }, { start: 3723, speaker: null, text: "Yes" }]), "[12:34] Dev Raman: Hi\n[1:02:03] Yes");
  const long = Array.from({ length: 3000 }, (_, i) => ({ start: i * 4, speaker: null, text: "word ".repeat(100) }));
  assert.ok(chapterInput(long).length <= 160_000);
  assert.match(chapterInput(long), /^\[0:00\] word/);
});

test("a provided transcript replaces KMS's own; a recording's own chunks go through the stages", async () => {
  const calls = [];
  const db = {
    document: {
      findUnique: async () => ({ filename: "Weekly sync.mp4" }),
      update: async (a) => calls.push(["update", a.data]),
      count: async ({ where }) => (where.transcriptOfId === "rec" ? 1 : 0),
    },
    chunk: { deleteMany: async () => { calls.push(["deleteMany"]); return { count: 8 }; } },
  };
  assert.equal(await dropGeneratedTranscript(db, "rec"), 8);
  assert.deepEqual(calls, [["deleteMany"], ["update", { content: null, summary: null }]]);
  assert.equal(await hasLinkedTranscript(db, "rec"), true);

  const rec = { filename: "a.mp4", projectId: null };
  assert.equal(firstMissingStage(rec, { textChunks: 0, embedded: 0, hasSummary: false }), null, "no transcript of its own: nothing to do");
  assert.equal(firstMissingStage(rec, { textChunks: 8, embedded: 0, hasSummary: false }), "embed");
  assert.equal(firstMissingStage(rec, { textChunks: 8, embedded: 8, hasSummary: false }), "summarize");
});

test("automatic transcription waits 10 minutes for a SharePoint recording, 1 minute for an upload", () => {
  assert.equal(autoTranscribeDelaySeconds({ sourceProvider: "sharepoint" }), 600);
  assert.equal(autoTranscribeDelaySeconds({ sourceProvider: "manual" }), 60);
  assert.equal(autoTranscribeDelaySeconds({ sourceProvider: null }), 60);
  assert.match(read("worker/index.js"), /maybeAutoTranscribe\(\{ id: docId, orgId: doc\.orgId, filename, sourceProvider: doc\.sourceProvider \}\)/);
});

test("automatic transcription is an org setting, on by default", () => {
  const entry = SETTINGS_REGISTRY["media.transcription.auto"];
  assert.equal(entry.default, true);
  assert.equal(entry.validate(false), true);
  assert.equal(entry.validate("yes"), false);
});

test("worker: queued after the probe, waits for a transcript, one per org, never retried by SQS", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /await mediaJobs\.maybeAutoTranscribe\(\{ id: docId, orgId: doc\.orgId, filename, sourceProvider: doc\.sourceProvider \}\)/);
  assert.match(worker, /if \(job\.type === "transcribe"\) return mediaJobs\.processTranscribeJob\(job\);/);
  assert.match(worker, /if \(job\.type === "segment"\) return mediaJobs\.processSegmentJob\(job\);/);
  assert.match(worker, /await dropGeneratedTranscript\(prisma, docId\);/, "new content: the old transcript of it goes");
  assert.match(worker, /await mediaJobs\.afterLinkChange\(/);
  assert.match(worker, /ChangeMessageVisibilityCommand\(\{ QueueUrl: QUEUE_URL, ReceiptHandle: msg\.ReceiptHandle, VisibilityTimeout: 600 \}\)/);
  assert.match(worker, /clearInterval\(heartbeat\);/);

  const jobs = read("worker/transcription.js");
  assert.match(jobs, /auto \? autoTranscribeDelaySeconds\(doc\) : 0/);
  assert.match(jobs, /if \(await hasLinkedTranscript\(prisma, docId\)\) \{\s*await finish\(job\.id, \{ status: "cancelled"/);
  assert.match(jobs, /if \(auto && !\(await getSetting\(doc\.orgId, "media\.transcription\.auto"\)\)\)/);
  assert.match(jobs, /status: "running", id: \{ not: job\.id \}/, "one at a time per org");
  assert.match(jobs, /response_format: "verbose_json",\s*timestamp_granularities: \["segment"\]/);
  assert.match(jobs, /await finish\(job\.id, \{ status: "failed", error: message/);
  assert.doesNotMatch(jobs.slice(jobs.indexOf("async function processTranscribeJob"), jobs.indexOf("async function chapterLines")), /throw err/, "errors end the job, they don't go back to SQS");
});

test("app: Transcribe on the page, permissions, link changes, chat on KMS's own transcript", () => {
  const route = read("src/app/api/documents/[id]/transcribe/route.js");
  assert.match(route, /canManageDocument\(doc, \{ userId: user\.id, role \}\)/);
  assert.match(route, /This recording has a transcript; KMS uses it instead/);
  assert.match(route, /AUDIT_EVENTS\.DOCUMENT_TRANSCRIPTION_REQUESTED/);
  const link = read("src/app/api/documents/[id]/transcript-link/route.js");
  assert.match(link, /if \(recordingId\) await dropGeneratedTranscript\(prisma, recordingId\);/);
  assert.match(link, /await queueChapters\(rec\)/);
  assert.match(read("src/app/api/documents/[id]/route.js"), /canTranscribe: canManage && isMediaFile\(doc\.filename\)/);
  const page = read("src/app/(app)/document/page.jsx");
  assert.match(page, /<TranscriptionNotice doc=\{doc\}/);
  assert.match(page, /<ChapterList chapters=\{chapters\} currentTime=\{playTime\} onSeek=\{seekRecording\} \/>/);
  assert.match(page, /if \(!id \|\| !\(isProcessing \|\| transcriptionActive\)\) return;/);
  assert.match(read("src/lib/documentStatus.js"), /"transcribing"/);
});
