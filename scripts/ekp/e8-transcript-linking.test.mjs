// EKP E11.5 (Workstream E, E-8): a transcript is linked to the recording next
// to it (same base name or Teams naming, same folder, same length, uploads
// close in time) only when exactly one fits; manual links win.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linkKey, containerKey, mayBeTranscript, refreshAutoLinks, lengthFits, uploadedTogether, matchRecordings, linkSuggestions } from "../../src/lib/transcriptLinking.js";
import { pairByName, transcriptEntry } from "../../src/lib/transcriptAttach.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const SITE = "https://contoso.sharepoint.com/sites/Ops/Shared%20Documents/Meetings";

test("base names and Teams names reduce to the same key", () => {
  assert.equal(linkKey("Weekly sync.mp4"), "weekly sync");
  assert.equal(linkKey("Weekly Sync.VTT"), "weekly sync");
  const rec = "Substation review-20261110_140000-Meeting Recording.mp4";
  assert.equal(linkKey(rec), "substation review-20261110_140000");
  assert.equal(linkKey("Substation review-20261110_140000-Meeting Transcript.docx"), linkKey(rec));
  assert.equal(linkKey("Substation review-20261110_140000 - Meeting Transcript.vtt"), linkKey(rec));
  assert.notEqual(linkKey("Substation review-20261111_090000-Meeting Transcript.vtt"), linkKey(rec), "another meeting");
  assert.equal(mayBeTranscript("a.vtt"), true);
  assert.equal(mayBeTranscript("a.DOCX"), true);
  assert.equal(mayBeTranscript("a.pdf"), false);
});

test("next to each other: the same SharePoint folder, or the same uploader, org and project", () => {
  const sp = (name, folder = SITE) => ({ sourceProvider: "sharepoint", externalUrl: `${folder}/${encodeURIComponent(name)}?web=1` });
  assert.equal(containerKey(sp("a.mp4")), containerKey(sp("a.vtt")));
  assert.equal(containerKey(sp("a.mp4")), "sp:https://contoso.sharepoint.com/sites/ops/shared documents/meetings");
  assert.notEqual(containerKey(sp("a.mp4")), containerKey(sp("a.vtt", `${SITE}/Archive`)));
  const up = (over = {}) => ({ sourceProvider: "manual", orgId: "o", projectId: null, userId: "u", ...over });
  assert.equal(containerKey(up()), containerKey(up()));
  assert.notEqual(containerKey(up()), containerKey(up({ userId: "v" })));
  assert.notEqual(containerKey(up()), containerKey(up({ projectId: "p" })));
  assert.equal(containerKey({ sourceProvider: "sharepoint", externalUrl: null }), null);
});

// A fake Prisma: findMany returns recordings or transcripts by the filter's
// extensions, count answers HAS_TIME_CHUNKS, chunk.findMany gives each
// transcript one time chunk ending at `ends[id]`, update records the writes.
const DAY = 24 * 3600 * 1000;
function fakeDb(docs, { timed = [], ends = {} } = {}) {
  const rows = new Map(docs.map((d) => [d.id, { orgId: "o", userId: "u", projectId: null, sourceProvider: "manual", deletedAt: null, transcriptOfId: null, transcriptLinkSource: null, createdAt: new Date(0), durationSeconds: null, ...d }]));
  const updates = [];
  const exts = (where) => JSON.stringify(where.OR || []).match(/\.\w+/g) || [];
  return {
    updates,
    rows,
    chunk: {
      findMany: async ({ where }) => (timed.includes(where.documentId) ? [{ metadata: { kind: "time", start: 0, end: ends[where.documentId] ?? 600 } }] : []),
    },
    document: {
      findUnique: async ({ where }) => rows.get(where.id) || null,
      findMany: async ({ where, orderBy }) => {
        const want = exts(where);
        const out = [...rows.values()].filter((r) => r.orgId === where.orgId && !r.deletedAt && want.some((e) => r.filename.toLowerCase().endsWith(e))
          && (!where.chunks || timed.includes(r.id))
          && (!("transcriptOfId" in where) || r.transcriptOfId === where.transcriptOfId)
          && (!("transcriptLinkSource" in where) || r.transcriptLinkSource === where.transcriptLinkSource));
        return orderBy ? out.sort((a, b) => (orderBy.createdAt === "asc" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)) : out;
      },
      count: async ({ where }) => (timed.includes(where.id) ? 1 : 0),
      update: async ({ where, data }) => { updates.push({ id: where.id, ...data }); Object.assign(rows.get(where.id), data); },
    },
  };
}

test("lengths: the transcript fits inside the recording and covers at least half of it", () => {
  assert.equal(lengthFits(465, 470.5), true);
  assert.equal(lengthFits(480, 470.5), true, "a little slack for rounding");
  assert.equal(lengthFits(2710, 470.5), false, "a 45-minute transcript isn't a 7:50 recording's");
  assert.equal(lengthFits(200, 470.5), false, "covers less than half");
  assert.equal(lengthFits(465, null), false, "unknown length: wait for the probe");
  assert.equal(uploadedTogether({ createdAt: new Date(0) }, { createdAt: new Date(2 * DAY) }), true);
  assert.equal(uploadedTogether({ createdAt: new Date(0) }, { createdAt: new Date(4 * DAY) }), false);
  assert.equal(uploadedTogether({ sourceProvider: "sharepoint", createdAt: new Date(0) }, { sourceProvider: "sharepoint", createdAt: new Date(40 * DAY) }), true);
});

test("a recording links the transcripts next to it that fit, never overriding a manual choice", async () => {
  const db = fakeDb([
    { id: "rec", filename: "Weekly sync.mp4", durationSeconds: 610 },
    { id: "vtt", filename: "Weekly sync.vtt" },
    { id: "doc", filename: "weekly SYNC.docx" },
    { id: "manual", filename: "Weekly sync.vtt", transcriptLinkSource: "manual" },
    { id: "plain", filename: "Weekly sync.docx" },          // a .docx not read as a transcript
    { id: "other", filename: "Weekly sync.vtt", userId: "someone else" },
    { id: "long", filename: "Weekly sync.vtt", createdAt: new Date(1) },
  ], { timed: ["vtt", "doc", "manual", "other", "long"], ends: { long: 2700 } });
  const changes = await refreshAutoLinks(db, "rec");
  assert.deepEqual(changes.map((c) => [c.transcriptId, c.recordingId, c.reason]), [["vtt", "rec", "match"], ["doc", "rec", "match"]]);
  assert.equal(db.rows.get("long").transcriptOfId, null, "too long for this recording");
  assert.deepEqual(await refreshAutoLinks(db, "rec"), [], "nothing to change the second time");
});

test("two recordings that both fit: no guess, and an existing auto link is dropped", async () => {
  const db = fakeDb([
    { id: "mp4", filename: "Town hall-20261110_140000-Meeting Recording.mp4", durationSeconds: 600, createdAt: new Date(1) },
    { id: "t", filename: "Town hall-20261110_140000-Meeting Transcript.docx", createdAt: new Date(2) },
  ], { timed: ["t"] });
  assert.deepEqual(await refreshAutoLinks(db, "t"), [{ transcriptId: "t", recordingId: "mp4", previousRecordingId: null, reason: "match", candidates: 1 }]);

  db.rows.set("mov", { ...db.rows.get("mp4"), id: "mov", filename: "Town hall-20261110_140000-Meeting Recording.mov", createdAt: new Date(3) });
  assert.deepEqual(await refreshAutoLinks(db, "mov"), [{ transcriptId: "t", recordingId: null, previousRecordingId: "mp4", reason: "ambiguous", candidates: 2 }]);
  assert.equal(db.rows.get("t").transcriptLinkSource, null);
  assert.deepEqual((await linkSuggestions(db, "t")).map((c) => [c.id, c.reason]), [["mov", "ambiguous"], ["mp4", "ambiguous"]]);
  assert.deepEqual((await linkSuggestions(db, "mp4")).map((c) => [c.id, c.reason]), [["t", "ambiguous"]]);

  db.rows.get("mov").deletedAt = new Date();
  assert.equal((await refreshAutoLinks(db, "t"))[0].recordingId, "mp4", "one left: linked again");
});

test("uploads with a generic name are paired only when uploaded within days of each other", async () => {
  const db = fakeDb([
    { id: "week1", filename: "Weekly sync.mp4", durationSeconds: 600, createdAt: new Date(0) },
    { id: "week2", filename: "Weekly sync.mp4", durationSeconds: 600, createdAt: new Date(7 * DAY) },
    { id: "t", filename: "Weekly sync.vtt", createdAt: new Date(7 * DAY + 3600e3) },
  ], { timed: ["t"] });
  assert.equal((await refreshAutoLinks(db, "t"))[0].recordingId, "week2");
  const reasons = Object.fromEntries((await matchRecordings(db, db.rows.get("t"))).candidates.map((c) => [c.id, c.reason]));
  assert.deepEqual(reasons, { week2: "match", week1: "uploaded_apart" });
});

test("a recording not probed yet isn't linked; its probe links it", async () => {
  const db = fakeDb([
    { id: "rec", filename: "Weekly sync.mp4" },
    { id: "t", filename: "Weekly sync.vtt" },
  ], { timed: ["t"] });
  assert.deepEqual(await refreshAutoLinks(db, "t"), []);
  assert.deepEqual((await linkSuggestions(db, "t")).map((c) => c.reason), ["length_unknown"]);
  db.rows.get("rec").durationSeconds = 605;
  assert.equal((await refreshAutoLinks(db, "rec"))[0].recordingId, "rec");
});

test("a manual link or unlink is left alone; a file that isn't a transcript loses its link", async () => {
  const db = fakeDb([
    { id: "rec", filename: "Weekly sync.mp4", durationSeconds: 600 },
    { id: "t", filename: "Weekly sync.vtt", transcriptLinkSource: "manual", transcriptOfId: null },
    { id: "plain", filename: "Weekly sync.docx" },
    { id: "attached", filename: "Notes.docx", transcriptOfId: "rec", transcriptLinkSource: "manual" },
  ], { timed: ["t"] });
  assert.deepEqual(await refreshAutoLinks(db, "t"), []);
  assert.deepEqual(await refreshAutoLinks(db, "plain"), []);
  assert.equal(db.updates.length, 0);
  assert.deepEqual(await refreshAutoLinks(db, "attached"), [{ transcriptId: "attached", recordingId: null, previousRecordingId: "rec", reason: "not_a_transcript" }]);
  assert.deepEqual(await linkSuggestions(db, "rec"), [], "unlinked by hand: not suggested again");
});

test("upload dialogs: a same-name transcript picked with a recording is attached to it", () => {
  const e = (id, name, status = "pending") => ({ id, name, status, file: { name, size: 10 } });
  const paired = pairByName([e("r", "Weekly sync.mp4"), e("x", "Report.pdf"), e("t", "Weekly sync.vtt")]);
  assert.deepEqual(paired.map((p) => [p.id, p.transcript?.name ?? null]), [["r", "Weekly sync.vtt"], ["x", null]]);
  const two = [e("r1", "Weekly sync.mp4"), e("r2", "Weekly sync.mov"), e("t", "Weekly sync.vtt")];
  assert.equal(pairByName(two), two, "two recordings with that name: left for the person");
  assert.match(transcriptEntry({ name: "notes.pdf", size: 10 }).error, /\.vtt file or a Teams Word transcript/);
  assert.equal(transcriptEntry({ name: "a.vtt", size: 10 }).error, "");
});

test("ingest: a transcript is attached only to the uploader's own recording, by hand, audited", () => {
  const route = read("src/app/api/documents/ingest/route.js");
  assert.match(route, /const transcriptOf = formData\.get\("transcriptOf"\) \|\| null;/);
  assert.match(route, /recording\.orgId !== orgId \|\| recording\.userId !== dbUser\.id/);
  assert.match(route, /transcriptOf: \{ connect: \{ id: String\(transcriptOf\) \} \}, transcriptLinkSource: "manual"/);
  assert.match(route, /attachedAtUpload: true/);
  for (const dialog of ["src/components/repository/UploadToRepositoryModal.jsx", "src/components/documents/FileUpload.jsx"]) {
    assert.match(read(dialog), /<AttachTranscript/);
    assert.match(read(dialog), /pairByName\(\[\.\.\.prev, \.\.\./);
  }
});

test("the worker re-checks links after a transcript is chunked and a recording is probed", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /if \(mayBeTranscript\(filename\)\) await linkTranscripts\(docId\);/);
  assert.match(worker, /await linkTranscripts\(docId\); \/\/ E11\.5: the transcripts next to it/);
  assert.match(worker, /uses its transcript \(\$\{transcripts\}\), no transcription call/);
});

test("the manual link route: managers of the transcript only, audited, marked manual", () => {
  const route = read("src/app/api/documents/[id]/transcript-link/route.js");
  assert.match(route, /canManageDocument\(transcript, \{ userId: who\.user\.id, role: who\.role \}\)/);
  assert.match(route, /const after = \{ transcriptOfId: recordingId, transcriptLinkSource: "manual" \};/);
  assert.match(route, /AUDIT_EVENTS\.DOCUMENT_TRANSCRIPT_LINKED : AUDIT_EVENTS\.DOCUMENT_TRANSCRIPT_UNLINKED/);
  assert.match(route, /who\.canView\(recording\)/, "the recording must be visible to the user too");
});
