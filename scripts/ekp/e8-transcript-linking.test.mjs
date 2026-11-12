// EKP E11.5 (Workstream E, E-8): a transcript is linked to the recording next
// to it (same base name or Teams naming, same folder); manual links win.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { linkKey, containerKey, mayBeTranscript, refreshAutoLinks } from "../../src/lib/transcriptLinking.js";

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
// extensions, count answers HAS_TIME_CHUNKS, update records the writes.
function fakeDb(docs, { timed = [] } = {}) {
  const rows = new Map(docs.map((d) => [d.id, { orgId: "o", userId: "u", projectId: null, sourceProvider: "manual", deletedAt: null, transcriptOfId: null, transcriptLinkSource: null, createdAt: new Date(0), ...d }]));
  const updates = [];
  const exts = (where) => JSON.stringify(where.OR || []).match(/\.\w+/g) || [];
  return {
    updates,
    rows,
    document: {
      findUnique: async ({ where }) => rows.get(where.id) || null,
      findMany: async ({ where, orderBy }) => {
        const want = exts(where);
        const out = [...rows.values()].filter((r) => r.orgId === where.orgId && !r.deletedAt && want.some((e) => r.filename.toLowerCase().endsWith(e))
          && (!where.chunks || timed.includes(r.id)));
        return orderBy ? out.sort((a, b) => b.createdAt - a.createdAt) : out;
      },
      count: async ({ where }) => (timed.includes(where.id) ? 1 : 0),
      update: async ({ where, data }) => { updates.push({ id: where.id, ...data }); Object.assign(rows.get(where.id), data); },
    },
  };
}

test("a recording links the transcripts next to it, but never overrides a manual choice", async () => {
  const db = fakeDb([
    { id: "rec", filename: "Weekly sync.mp4" },
    { id: "vtt", filename: "Weekly sync.vtt" },
    { id: "doc", filename: "weekly SYNC.docx" },
    { id: "manual", filename: "Weekly sync.vtt", transcriptLinkSource: "manual" },
    { id: "plain", filename: "Weekly sync.docx" },          // a .docx not read as a transcript
    { id: "other", filename: "Weekly sync.vtt", userId: "someone else" },
  ], { timed: ["vtt", "doc", "manual", "other"] });
  const changes = await refreshAutoLinks(db, "rec");
  assert.deepEqual(changes, [{ transcriptId: "vtt", recordingId: "rec" }, { transcriptId: "doc", recordingId: "rec" }]);
  assert.deepEqual(db.updates.map((u) => [u.id, u.transcriptOfId, u.transcriptLinkSource]), [["vtt", "rec", "auto"], ["doc", "rec", "auto"]]);
  assert.deepEqual(await refreshAutoLinks(db, "rec"), [], "nothing to change the second time");
});

test("a transcript links to the newest matching recording, and drops an auto link that no longer matches", async () => {
  const db = fakeDb([
    { id: "old", filename: "Town hall-20261110_140000-Meeting Recording.mp4", createdAt: new Date(1) },
    { id: "new", filename: "Town hall-20261110_140000-Meeting Recording.mov", createdAt: new Date(2) },
    { id: "t", filename: "Town hall-20261110_140000-Meeting Transcript.docx" },
  ], { timed: ["t"] });
  assert.deepEqual(await refreshAutoLinks(db, "t"), [{ transcriptId: "t", recordingId: "new" }]);

  db.rows.get("new").deletedAt = new Date();
  db.rows.get("old").deletedAt = new Date();
  assert.deepEqual(await refreshAutoLinks(db, "t"), [{ transcriptId: "t", recordingId: null }]);
  assert.equal(db.rows.get("t").transcriptLinkSource, null);
});

test("a manual link or unlink is left alone, and a non-transcript .docx is never linked", async () => {
  const db = fakeDb([
    { id: "rec", filename: "Weekly sync.mp4" },
    { id: "t", filename: "Weekly sync.vtt", transcriptLinkSource: "manual", transcriptOfId: null },
    { id: "plain", filename: "Weekly sync.docx" },
  ], { timed: ["t"] });
  assert.deepEqual(await refreshAutoLinks(db, "t"), []);
  assert.deepEqual(await refreshAutoLinks(db, "plain"), []);
  assert.equal(db.updates.length, 0);
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
