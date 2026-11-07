// Decision Extraction v2, FR-7: read-only evaluation harness comparing v1
// (worker/summarize.js's extractDecisions, over chunk summaries) against v2
// (worker/decisions.js's extractDecisionsV2, over raw chunk text) on real
// documents and on synthetic fixtures. Never writes to the DB, never
// enqueues an SQS job — safe to run against the live dev DB.
//
// Usage:
//   node scripts/research/decision_extraction_eval.mjs                  # fixtures only
//   node scripts/research/decision_extraction_eval.mjs --doc <docId>    # + one real document (repeatable)
//   node scripts/research/decision_extraction_eval.mjs --org <email>    # + every document for that user's org
//   node scripts/research/decision_extraction_eval.mjs --file <path>    # + a local .pdf/.docx/.txt file, not ingested into the DB (repeatable)
//   node scripts/research/decision_extraction_eval.mjs --no-fixtures --doc <docId>
//
// --file uses the same extractPdfText()/mammoth extraction the real worker
// uses, so results reflect what an actual upload would produce, without
// needing to run the ingestion pipeline first.
//
// Unset any stale DATABASE_URL env var before running (see project memory:
// this repo has had a Claude Code session-start .env snapshot shadow the
// real value) — `unset DATABASE_URL` then `set -a && source .env && set +a`
// in the shell before invoking this script, same as any other prisma-backed
// script in this repo.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { summarizeChunks, extractDecisions } from "../../worker/summarize.js";
import { extractDecisionsV2 } from "../../worker/decisions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = { docs: [], org: null, files: [], fixtures: true };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--doc") args.docs.push(argv[++i]);
    else if (argv[i] === "--org") args.org = argv[++i];
    else if (argv[i] === "--file") args.files.push(argv[++i]);
    else if (argv[i] === "--no-fixtures") args.fixtures = false;
  }
  return args;
}

function chunkFixtureText(text, size = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

// Mirrors worker/index.js's chunkText() (2000 chars, 15% overlap for
// private-visibility docs) — that function isn't exported, so this is a
// small intentional duplication rather than reaching into worker/index.js's
// internals for a research script.
function chunkTextLikeWorker(text, size = 2000, overlapRatio = 0.15) {
  const overlap = Math.round(size * overlapRatio);
  const step = Math.max(1, size - overlap);
  const chunks = [];
  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return chunks;
}

async function extractLocalFileText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { extractPdfText } = await import("../../worker/extractPdf.js");
    return extractPdfText(buffer);
  }
  if (lower.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString("utf8");
}

async function getOpenAIClient(docId) {
  if (docId) {
    const { getOpenAIForDocument } = await import("../../worker/openai.js");
    return getOpenAIForDocument(docId);
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key && !key.startsWith("REPLACE_")) return new OpenAI({ apiKey: key });

  // Dev convenience for fixture-only runs: this repo's .env OPENAI_API_KEY
  // is a placeholder (org/user keys live in the DB instead — see
  // worker/openai.js), so fall back to any org's own configured key.
  const org = await prisma.organization.findFirst({
    where: { openaiApiKey: { not: null } },
    select: { openaiApiKey: true },
  });
  if (org?.openaiApiKey) return new OpenAI({ apiKey: org.openaiApiKey });

  throw new Error("No usable OpenAI key found (env OPENAI_API_KEY is a placeholder and no org has one configured)");
}

function printDivider(label) {
  console.log(`\n${"=".repeat(10)} ${label} ${"=".repeat(Math.max(0, 60 - label.length))}`);
}

function printV1(decisions) {
  console.log(`  v1 (${decisions.length}):`);
  for (const d of decisions) {
    console.log(`   - "${d.statement}"${d.rationale ? ` — rationale: ${d.rationale}` : " — no rationale"}`);
  }
}

function printV2(decisions) {
  console.log(`  v2 (${decisions.length}):`);
  for (const d of decisions) {
    console.log(
      `   - [${d.certainty}/${d.explicitness}, score ${d.score}] "${d.statement}"` +
        (d.rationale ? ` — rationale: ${d.rationale}` : "")
    );
    console.log(`     signals: ${d.signals.join(", ") || "(none)"}`);
    for (const e of d.evidence) {
      console.log(`     evidence [${e.type}]: "${e.quote.slice(0, 140)}${e.quote.length > 140 ? "…" : ""}"`);
    }
  }
}

// Rough char-based token estimate (~4 chars/token) — this harness's job is
// order-of-magnitude cost comparison against v1, not a precise accounting;
// OpenAI's own usage field would need decisions.js to return it, which isn't
// worth the API surface change for a one-off measurement script.
function estimateTokens(...texts) {
  return Math.round(texts.reduce((sum, t) => sum + (t?.length || 0), 0) / 4);
}

async function runOnChunks(openai, { chunks, filename, category, label }) {
  const rawTextChars = chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0);

  const chunkTexts = chunks.map((c) => c.text || "");
  const t0 = Date.now();
  const chunkSummaries = await summarizeChunks(openai, chunkTexts, filename);
  const v1Decisions = await extractDecisions(openai, chunkSummaries, filename);
  const v1Ms = Date.now() - t0;

  const t1 = Date.now();
  const v2Decisions = await extractDecisionsV2(openai, { chunks, filename, category });
  const v2Ms = Date.now() - t1;

  printDivider(label);
  console.log(`  filename: ${filename} | category: ${category || "(none)"} | raw text: ${rawTextChars} chars, ${chunks.length} chunk(s)`);
  console.log(`  v1: ${v1Ms}ms (chunk-summarize + extract), ~${estimateTokens(chunkSummaries.join(""), JSON.stringify(v1Decisions))} tokens (rough)`);
  console.log(`  v2: ${v2Ms}ms (raw-chunk extract), ~${estimateTokens(chunks.map((c) => c.text).join(""), JSON.stringify(v2Decisions))} tokens (rough)`);
  printV1(v1Decisions);
  printV2(v2Decisions);
}

async function runFixtures() {
  const dir = path.join(__dirname, "fixtures");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  const openai = await getOpenAIClient(null);

  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const isPolicyFixture = file.includes("policy");
    const chunks = chunkFixtureText(text).map((t, i) => ({ id: null, chunkIndex: i, text: t }));
    await runOnChunks(openai, {
      chunks,
      filename: file,
      category: isPolicyFixture ? "Policies" : null,
      label: `FIXTURE: ${file}`,
    });
  }
}

async function runRealDocument(docId) {
  const doc = await prisma.document.findUnique({ where: { id: docId }, select: { filename: true, category: true } });
  if (!doc) {
    console.error(`Document ${docId} not found — skipping`);
    return;
  }
  const chunks = await prisma.chunk.findMany({
    where: { documentId: docId },
    orderBy: { chunkIndex: "asc" },
    select: { id: true, chunkIndex: true, text: true },
  });
  if (!chunks.length) {
    console.error(`Document ${docId} has no chunks — skipping`);
    return;
  }
  const openai = await getOpenAIClient(docId);
  await runOnChunks(openai, { chunks, filename: doc.filename, category: doc.category, label: `DOCUMENT: ${doc.filename} (${docId})` });
}

async function runLocalFile(filePath) {
  const filename = path.basename(filePath);
  const text = await extractLocalFileText(filePath);
  if (!text || text.trim().length < 50) {
    console.error(`${filename}: no extractable text — skipping`);
    return;
  }
  const chunks = chunkTextLikeWorker(text).map((t, i) => ({ id: null, chunkIndex: i, text: t }));
  const openai = await getOpenAIClient(null);
  await runOnChunks(openai, { chunks, filename, category: null, label: `FILE: ${filename}` });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.fixtures) await runFixtures();

  for (const filePath of args.files) {
    await runLocalFile(filePath);
  }

  const docIds = [...args.docs];
  if (args.org) {
    const user = await prisma.user.findUnique({ where: { email: args.org }, select: { id: true } });
    if (!user) throw new Error(`No user found for ${args.org}`);
    const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id }, select: { orgId: true } });
    if (!membership) throw new Error(`${args.org} has no organization membership`);
    const docs = await prisma.document.findMany({
      where: { orgId: membership.orgId },
      select: { id: true },
    });
    docIds.push(...docs.map((d) => d.id));
  }

  for (const docId of docIds) {
    await runRealDocument(docId);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
