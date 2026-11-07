// Finishing half-processed documents: src/lib/documentPipeline.js (what's
// missing), src/lib/documentReprocess.js (queueing a repair), the worker's
// repair job and the document page's polling rule.
// Run: node --import ./scripts/task-12/register-alias-hook.mjs --test scripts/document-page/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canReadSource, firstMissingStage, pipelineState } from "../../src/lib/documentPipeline.js";
import { queueRepair } from "../../src/lib/documentReprocess.js";
import { isProcessingStatus } from "../../src/lib/documentStatus.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const doc = { id: "d1", filename: "AWS Cost Optimization.pdf", status: "ready", summary: '{"overview":"x"}', projectId: null, filePath: "uploads/a.pdf" };
const complete = { textChunks: 3, embedded: 3, hasSummary: true, topics: null };

test("pipeline state comes from what the stages left behind", async () => {
  const db = { $queryRaw: async () => [{ textChunks: 2, embedded: 1 }], topicDocument: { count: async () => 0 } };
  assert.deepEqual(await pipelineState(db, doc), { textChunks: 2, embedded: 1, hasSummary: true, topics: null });
  assert.deepEqual(await pipelineState(db, { ...doc, projectId: "p1", summary: null }), { textChunks: 2, embedded: 1, hasSummary: false, topics: 0 });
});

test("the first missing stage, in pipeline order", () => {
  assert.equal(firstMissingStage(doc, complete), null);
  assert.equal(firstMissingStage(doc, { ...complete, textChunks: 0, embedded: 0 }), "chunk");
  assert.equal(firstMissingStage(doc, { ...complete, embedded: 2 }), "embed");
  assert.equal(firstMissingStage(doc, { ...complete, embedded: 0, hasSummary: false }), "embed"); // earliest wins
  assert.equal(firstMissingStage(doc, { ...complete, hasSummary: false }), "summarize");
  assert.equal(firstMissingStage({ ...doc, projectId: "p1" }, { ...complete, topics: 0 }), "cluster");
  assert.equal(firstMissingStage({ ...doc, projectId: "p1" }, { ...complete, topics: 1 }), null);
});

test("no text and nothing to read it from can't be repaired", () => {
  const noText = { ...complete, textChunks: 0, embedded: 0 };
  assert.equal(firstMissingStage({ ...doc, filePath: null }, noText), "unrepairable");
  assert.equal(canReadSource({ ...doc, filePath: null, sourceProvider: "sharepoint", externalUrl: "u", externalId: "i", orgId: "o" }), true);
  assert.equal(canReadSource({ filePath: null, contentType: "page", content: "text" }), true);
});

function fakeDb(claimCount = 1) {
  const calls = [];
  return { calls, document: { updateMany: async (args) => (calls.push(args), { count: args.data.status === "queued" ? claimCount : 1 }) } };
}

test("a repair is queued once, after claiming a settled document", async () => {
  const db = fakeDb(1);
  const sent = [];
  assert.equal(await queueRepair(db, doc, { regenerateSummary: true, send: async (b) => sent.push(b) }), true);
  assert.equal(db.calls[0].where.status, "ready");
  assert.ok(db.calls[0].where.NOT.status.in.includes("summarizing"));
  assert.deepEqual(db.calls[0].data, { status: "queued" });
  assert.deepEqual(sent, [{ type: "repair", docId: "d1", regenerateSummary: true }]);
});

test("a second caller queues nothing; a queue failure puts the status back", async () => {
  const sent = [];
  assert.equal(await queueRepair(fakeDb(0), doc, { send: async (b) => sent.push(b) }), false);
  assert.equal(sent.length, 0);
  const db = fakeDb(1);
  await assert.rejects(queueRepair(db, { ...doc, status: "error" }, { send: async () => { throw new Error("SQS down"); } }), /SQS down/);
  assert.deepEqual(db.calls[1], { where: { id: "d1", status: "queued" }, data: { status: "error" } });
});

test("the worker's repair job runs the first missing stage and chains on", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /if \(job\.type === "repair"\) return processRepairJob\(job\);/);
  assert.match(worker, /if \(stage === "chunk"\) return processChunkJob\(/);
  assert.match(worker, /if \(stage === "embed"\) return processEmbeddingJob\(base\);/);
  assert.match(worker, /if \(stage === "summarize"\) return processSummarizationJob\(\{ \.\.\.base, regenerate: false \}\);/);
  assert.match(worker, /if \(job\.regenerateSummary\) return processSummarizationJob\(\{ \.\.\.base, regenerate: true \}\);/);
});

test("Regenerate and chat both go through the repair", () => {
  assert.match(read("src/app/api/documents/[id]/regenerate/route.js"), /queueRepair\(prisma, doc, \{ regenerateSummary: true \}\)/);
  const ask = read("src/app/api/documents/[id]/ask/route.js");
  assert.match(ask, /missing === "embed" \|\| missing === "summarize"\) && \(await queueRepair\(prisma, doc\)\)/);
  assert.match(ask, /notice, reprocessing: true/);
});

test("the page polls only while the worker is on the document", () => {
  for (const s of ["queued", "chunked", "embedding", "summarizing", "clustering"]) assert.equal(isProcessingStatus(s), true, s);
  for (const s of ["ready", "error", "ocr_failed", "password_protected", "unreadable_file", undefined]) assert.equal(isProcessingStatus(s), false, String(s));
  const page = read("src/app/(app)/document/page.jsx");
  assert.match(page, /if \(!id \|\| !isProcessing\) return;/);
  assert.doesNotMatch(page, /Generate summary when switching to summary tab/);
});
