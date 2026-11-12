// EKP E11.5 (Workstream E, E-9): "12:34" citations in chat and search that
// open the recording there; the media player; transcript lines.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timeCitation, transcriptLines, chunkTranscript, parseVtt } from "../../src/lib/transcripts.js";
import { chunkLocation } from "../../src/lib/chunkLocation.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("a time citation: sorted whole seconds, '12:34' locator, opens the document at ?t=", () => {
  assert.deepEqual(timeCitation("t1", [812.9, 754.2, 754.7]), {
    times: [754, 812],
    locator: "12:34, 13:32",
    viewerUrl: "/document?id=t1&t=754",
  });
  assert.deepEqual(timeCitation("t1", []), {});
  assert.equal(timeCitation("t1", [1, 2, 3, 4, 5]).locator, "0:01, 0:02, 0:03, 0:04…");
});

test("a linked transcript's citation opens the recording", () => {
  const recording = { documentId: "rec 1", filename: "Weekly sync.mp4" };
  const c = timeCitation("t1", [3723], recording);
  assert.equal(c.viewerUrl, "/document?id=rec%201&t=3723");
  assert.equal(c.locator, "1:02:03");
  assert.deepEqual(c.recording, recording);
});

test("search hits: slide or time location, nothing for other chunks", () => {
  assert.equal(chunkLocation({ document_id: "d", metadata: { kind: "slide", slide: 7 } }).locator, "slide 7");
  assert.equal(chunkLocation({ document_id: "d", metadata: { kind: "time", start: 754.2, end: 800 } }).viewerUrl, "/document?id=d&t=754");
  assert.equal(chunkLocation({ document_id: "d", metadata: { kind: "time", start: 5 } }, { documentId: "r", filename: "r.mp4" }).viewerUrl, "/document?id=r&t=5");
  assert.deepEqual(chunkLocation({ document_id: "d", metadata: null }), {});
});

test("transcript lines round-trip from chunks, speakers split off only when known", () => {
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Jane Smith>Hello: welcome.</v>\n\n00:01:05.000 --> 00:01:07.000\nNote: no speaker here.\n";
  const chunks = chunkTranscript(parseVtt(vtt)).map((c) => ({ start: c.metadata.start, speakers: c.metadata.speakers, text: c.text }));
  assert.deepEqual(transcriptLines(chunks), [
    { start: 1, speaker: "Jane Smith", text: "Hello: welcome." },
    { start: 65, speaker: null, text: "Note: no speaker here." },
  ]);
});

test("org chat: transcript lines are tagged with times, cited as the recording", () => {
  const route = read("src/app/api/org/[orgId]/chat/route.js");
  assert.match(route, /Lines of a meeting transcript start with the time they were said/);
  assert.match(route, /const time = timeOf\(c\);\s*if \(time\) acc\[key\]\.times\.push\(time\.start\);/);
  assert.match(route, /await linkedRecordings\(/);
  assert.match(route, /\.\.\.timeCitation\(g\.documentId, g\.times, g\.recording\)/);
  assert.match(route, /\(transcript of the recording \$\{g\.recording\.filename\}\)/);
  const page = read("src/app/(app)/org/[orgId]/chat/page.jsx");
  assert.match(page, /Play from \$\{selectedSource\.locator\.split\(","\)\[0\]\}/);
});

test("document chat on a recording answers from its linked transcripts, with times", () => {
  const route = read("src/app/api/documents/[id]/ask/route.js");
  assert.match(route, /\? \{ document: \{ transcriptOfId: documentId, deletedAt: null \} \}/);
  assert.match(route, /The document is a recording; the context is its transcript\./);
  assert.match(route, /This recording has no transcript yet/);
});

test("answers' times become play buttons on a recording's page", () => {
  const md = read("src/components/chat/MarkdownMessage.jsx");
  assert.match(md, /return `\[\$\{match\}\]\(#seek-\$\{seconds\}\)`;/);
  assert.match(md, /if \(Number\.isFinite\(maxSeconds\) && seconds > maxSeconds \+ 1\) return match;/);
  const pattern = /(?<![\d:.A-Za-z])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])/g;
  assert.deepEqual("at 12:34 and 1:02:03, not 10.30:00 or 2026-11-10T14:00:00".match(pattern), ["12:34", "1:02:03"]);
});

test("the document page plays recordings, honours ?t=, and links transcripts", () => {
  const page = read("src/app/(app)/document/page.jsx");
  assert.match(page, /searchParams\.get\('t'\)/);
  assert.match(page, /<MediaPlayer[\s\S]{0,200}startAt=\{inModal \? null : startTime\}/);
  assert.match(page, /\{ id: 'transcript', label: 'Transcript', icon: Captions \}/);
  assert.match(page, /<TranscriptLinkPanel doc=\{doc\} onChanged=\{refreshDoc\} \/>/);
  assert.match(page, /onTimestampClick=\{onTimestampClick\}/);
  const player = read("src/components/documents/MediaPlayer.jsx");
  assert.match(player, /el\.currentTime = pendingStart\.current;/);
  assert.match(player, /const fresh = await getFreshSrc\(\)/, "an expired link is replaced mid-playback");
});

test("no-copy recordings stream with Range so the player can seek", () => {
  const preview = read("src/app/api/documents/[id]/preview/route.js");
  assert.match(preview, /const range = asPdf \? null : req\.headers\.get\("range"\);/);
  assert.match(preview, /status: partial \? 206 : 200/);
  assert.match(read("src/lib/msGraph.js"), /\.\.\.\(range \? \{ Range: range \} : \{\}\)/);
});

test("repository search cards say where they matched", () => {
  const route = read("src/app/api/org/[orgId]/repository/route.js");
  assert.match(route, /bestChunks\.set\(row\.document_id, row\);/);
  assert.match(route, /match: matchOf\(d\),/);
  assert.match(read("src/components/repository/RepositoryDocumentCard.jsx"), /Matched at \{document\.match\.locator\}/);
});
