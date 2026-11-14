// EKP E11.5 (Workstream E, E-7): VTT and Teams Word transcripts become
// time-window chunks { kind: "time", start, end, speakers }.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import mammoth from "mammoth";
import {
  formatTimestamp, parseTimestamp, parseVtt, parseWordTranscript, chunkTranscript, transcriptText, timeOf,
} from "../../src/lib/transcripts.js";
import { checkFileFormat } from "../../src/lib/fileFormats.js";

const VTT = `WEBVTT

NOTE Teams writes one cue per phrase

STYLE
::cue { color: lime }

3f2a1c/12-0
00:00:01.000 --> 00:00:04.500
<v Jane Smith>Good afternoon, everyone.</v>

3f2a1c/12-1
00:00:04.500 --> 00:00:09.000 align:start
<v Jane Smith>Let's start with the transformer outage.</v>

00:12:34.200 --> 00:12:40.000
<v.loud Raj Patel>The breaker &amp; relay were replaced on <i>Tuesday</i>.</v>

00:12:40.000 --> 00:12:41.000

01:02:03.000 --> 01:02:05.000
No speaker on this one.
`;

test("timestamps format as m:ss, or h:mm:ss from an hour, and parse back", () => {
  assert.equal(formatTimestamp(754.2), "12:34");
  assert.equal(formatTimestamp(5), "0:05");
  assert.equal(formatTimestamp(3723), "1:02:03");
  assert.equal(parseTimestamp("00:12:34.200"), 754.2);
  assert.equal(parseTimestamp("12:34"), 754);
  assert.equal(parseTimestamp("0:0:5.30"), 5.3);
  assert.equal(parseTimestamp("1:02:03"), 3723);
  assert.equal(parseTimestamp("speaker"), null);
});

test("VTT: cues with speakers from <v> tags; notes, styles, settings, tags and empty cues dropped", () => {
  const cues = parseVtt(`﻿${VTT.replace(/\n/g, "\r\n")}`);
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.speaker, c.text]), [
    [1, 4.5, "Jane Smith", "Good afternoon, everyone."],
    [4.5, 9, "Jane Smith", "Let's start with the transformer outage."],
    [754.2, 760, "Raj Patel", "The breaker & relay were replaced on Tuesday."],
    [3723, 3725, null, "No speaker on this one."],
  ]);
});

test("chunks: about a minute each, cut at cues, a speaker's turns joined, time metadata", () => {
  const chunks = chunkTranscript(parseVtt(VTT));
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0].metadata, { kind: "time", start: 1, end: 9, speakers: ["Jane Smith"] });
  assert.equal(chunks[0].text, "[0:01] Jane Smith: Good afternoon, everyone. Let's start with the transformer outage.");
  assert.deepEqual(chunks[1].metadata, { kind: "time", start: 754.2, end: 760, speakers: ["Raj Patel"] });
  assert.equal(chunks[1].text, "[12:34] Raj Patel: The breaker & relay were replaced on Tuesday.");
  assert.equal(chunks[2].text, "[1:02:03] No speaker on this one.");
  assert.deepEqual(timeOf(chunks[1]), { start: 754.2, end: 760 });
  assert.equal(timeOf({ metadata: { kind: "slide", slide: 2 } }), null);
  assert.match(transcriptText(chunks), /^\[0:01\] Jane Smith:.*\n\[12:34\] Raj Patel:/);
});

test("chunks close after the target, never pass the maximum span or size", () => {
  const cues = Array.from({ length: 200 }, (_, i) => ({ start: i * 7, end: i * 7 + 7, speaker: i % 2 ? "A" : "B", text: `sentence ${i} `.repeat(4).trim() }));
  const chunks = chunkTranscript(cues);
  for (const c of chunks) {
    assert.ok(c.metadata.end - c.metadata.start <= 90, JSON.stringify(c.metadata));
    assert.ok(c.text.length <= 2200);
  }
  assert.ok(chunks.slice(0, -1).every((c) => c.metadata.end - c.metadata.start >= 60));
  assert.equal(chunks.flatMap((c) => c.text.split("\n")).length, 200, "every cue kept");
  const long = chunkTranscript([{ start: 0, end: 5, speaker: "A", text: "x".repeat(1500) }, { start: 5, end: 9, speaker: "A", text: "y".repeat(1500) }]);
  assert.equal(long.length, 2, "split by size");
});

test("Teams Word transcript, newer format: 'Speaker   m:ss' turns end where the next begins", () => {
  const text = [
    "Substation review-20261110_140000-Meeting Recording", "November 10, 2026, 2:00PM", "45m 12s",
    "Jane Smith started transcription",
    "Jane Smith   0:03", "Good afternoon, everyone.",
    "Raj Patel   0:15", "Thanks Jane.", "The relay was replaced.",
    "Jane Smith   1:02:03", "Great, let's wrap up.",
  ].join("\n\n");
  const cues = parseWordTranscript(text);
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.speaker, c.text]), [
    [3, 15, "Jane Smith", "Good afternoon, everyone."],
    [15, 3723, "Raj Patel", "Thanks Jane. The relay was replaced."],
    [3723, 3725, "Jane Smith", "Great, let's wrap up."],
  ]);
});

test("Teams Word transcript, older format: timing line, speaker, words", () => {
  const text = "0:0:0.0 --> 0:0:5.30\nJane Smith\nGood afternoon.\n\n0:0:5.30 --> 0:0:9.0\nRaj Patel\nHello.\n\n0:0:9.0 --> 0:0:12.0\nJane Smith\nLet's begin.";
  assert.deepEqual(parseWordTranscript(text).map((c) => [c.start, c.end, c.speaker, c.text]), [
    [0, 5.3, "Jane Smith", "Good afternoon."],
    [5.3, 9, "Raj Patel", "Hello."],
    [9, 12, "Jane Smith", "Let's begin."],
  ]);
});

test("an ordinary Word document isn't taken for a transcript", () => {
  assert.equal(parseWordTranscript("Quarterly report\n\nRevenue rose 4%.\n\nMeeting at 10:30"), null);
  assert.equal(parseWordTranscript("Agenda   9:00\nIntro\nBreak   10:30\nCoffee"), null, "two timed lines aren't enough");
});

test("a real .docx in Teams format is read through mammoth", async () => {
  const para = (t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
    "Jane Smith   0:03", "Good afternoon.", "Raj Patel   0:15", "Hello.", "Jane Smith   0:30", "Let's begin.",
  ].map(para).join("")}</w:body></w:document>`);
  const { value } = await mammoth.extractRawText({ buffer: await zip.generateAsync({ type: "nodebuffer" }) });
  const chunks = chunkTranscript(parseWordTranscript(value));
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, "[0:03] Jane Smith: Good afternoon.\n[0:15] Raj Patel: Hello.\n[0:30] Jane Smith: Let's begin.");
});

test("VTT is accepted, and the worker chunks VTT and Teams Word transcripts by time", () => {
  assert.equal(checkFileFormat("Weekly sync.vtt").ok, true);
  const worker = readFileSync(new URL("../../worker/index.js", import.meta.url), "utf8");
  assert.match(worker, /ext === "\.vtt"[\s\S]{0,200}chunkTranscript\(parseVtt\(buffer\.toString\("utf8"\)\)\)/);
  assert.match(worker, /const cues = parseWordTranscript\(rawText\);\s*if \(cues\) \{\s*sheetChunks = chunkTranscript\(cues\);/);
});
