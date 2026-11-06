// Repair of half-processed documents (src/lib/documentReprocess.js) and the
// document page's polling rule (src/lib/documentStatus.js).
// Run: node --import ./scripts/task-12/register-alias-hook.mjs --test scripts/document-page/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { documentIndexState, hasIncompleteIndex, queueReprocessing } from "../../src/lib/documentReprocess.js";
import { isProcessingStatus } from "../../src/lib/documentStatus.js";

const doc = { id: "d1", filename: "AWS Cost Optimization.pdf", projectId: null, status: "ready" };

test("index state counts readable chunks and their vectors", async () => {
  const db = { $queryRaw: async () => [{ chunks: 3, embedded: 1 }] };
  assert.deepEqual(await documentIndexState(db, "d1"), { chunks: 3, embedded: 1 });
  assert.deepEqual(await documentIndexState({ $queryRaw: async () => [] }, "d1"), { chunks: 0, embedded: 0 });
});

test("only a ready document with readable chunks missing vectors needs reprocessing", () => {
  assert.equal(hasIncompleteIndex(doc, { chunks: 1, embedded: 0 }), true);
  assert.equal(hasIncompleteIndex(doc, { chunks: 2, embedded: 2 }), false);
  assert.equal(hasIncompleteIndex(doc, { chunks: 0, embedded: 0 }), false); // nothing to embed
  assert.equal(hasIncompleteIndex({ ...doc, status: "embedding" }, { chunks: 1, embedded: 0 }), false);
});

function fakeDb(claimCount = 1) {
  const calls = [];
  return {
    calls,
    document: { updateMany: async (args) => (calls.push(args), { count: args.data.status === "chunked" ? claimCount : 1 }) },
  };
}

test("queues the worker's embed job once, after claiming the document", async () => {
  const db = fakeDb(1);
  const sent = [];
  assert.equal(await queueReprocessing(db, doc, { send: async (b) => sent.push(b) }), true);
  assert.deepEqual(db.calls[0], { where: { id: "d1", status: "ready" }, data: { status: "chunked" } });
  assert.deepEqual(sent, [{ type: "embed", docId: "d1", filename: doc.filename, projectId: null }]);
});

test("a second caller (already claimed) queues nothing", async () => {
  const sent = [];
  assert.equal(await queueReprocessing(fakeDb(0), doc, { send: async (b) => sent.push(b) }), false);
  assert.equal(sent.length, 0);
});

test("if the queue can't be reached the document goes back to ready", async () => {
  const db = fakeDb(1);
  await assert.rejects(queueReprocessing(db, doc, { send: async () => { throw new Error("SQS down"); } }), /SQS down/);
  assert.deepEqual(db.calls[1], { where: { id: "d1", status: "chunked" }, data: { status: "ready" } });
});

test("the page polls only while the worker is on the document", () => {
  for (const s of ["queued", "chunked", "embedding", "summarizing", "clustering"]) assert.equal(isProcessingStatus(s), true, s);
  for (const s of ["ready", "error", "ocr_failed", "password_protected", "unreadable_file", undefined]) assert.equal(isProcessingStatus(s), false, String(s));
  const page = readFileSync(new URL("../../src/app/(app)/document/page.jsx", import.meta.url), "utf8");
  assert.match(page, /if \(!id \|\| !isProcessing\) return;/);
  assert.doesNotMatch(page, /Generate summary when switching to summary tab/);
});

test("the ask route queues reprocessing and tells the user", () => {
  const route = readFileSync(new URL("../../src/app/api/documents/[id]/ask/route.js", import.meta.url), "utf8");
  assert.match(route, /hasIncompleteIndex\(doc, await documentIndexState\(prisma, documentId\)\)/);
  assert.match(route, /notice, reprocessing: true/);
});
