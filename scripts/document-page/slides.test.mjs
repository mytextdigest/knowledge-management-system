// Slide previews: PowerPoint decks shown as designed (worker/renderSlides.js,
// src/lib/slidePreview.js, GET/POST /api/documents/[id]/slides).
// Run: node --import ./scripts/task-12/register-alias-hook.mjs --test scripts/document-page/*.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { renderPptxToPdf, unhideSlides } from "../../worker/renderSlides.js";
import { isSlideDeck, slidePreviewKey } from "../../src/lib/slidePreview.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const DECK = new URL("../../docs/KMS_NYPA_EKP_Readiness_Review.pptx", import.meta.url);

async function deckWithHiddenSlide(n) {
  const zip = await JSZip.loadAsync(readFileSync(DECK));
  const name = `ppt/slides/slide${n}.xml`;
  zip.file(name, (await zip.file(name).async("string")).replace(/<p:sld\b/, '<p:sld show="0"'));
  return zip.generateAsync({ type: "nodebuffer" });
}

test("key and deck detection", () => {
  assert.equal(slidePreviewKey("doc1"), "previews/doc1/slides.pdf");
  assert.equal(isSlideDeck("Q3 Review.PPTX"), true);
  assert.equal(isSlideDeck("old.ppt"), false);
});

test("hidden slides are un-hidden in the copy that's rendered (page N = slide N)", async () => {
  const hidden = await deckWithHiddenSlide(2);
  const zip = await JSZip.loadAsync(await unhideSlides(hidden));
  assert.doesNotMatch(await zip.file("ppt/slides/slide2.xml").async("string"), /<p:sld\b[^>]*show="0"/);
  const plain = readFileSync(DECK);
  assert.equal(await unhideSlides(plain), plain); // nothing hidden: untouched
});

let hasSoffice = true;
try { execFileSync("soffice", ["--version"], { stdio: "ignore" }); } catch { hasSoffice = false; }

test("LibreOffice renders one PDF page per slide, hidden ones included", { skip: !hasSoffice && "soffice not installed" }, async () => {
  const pdf = await renderPptxToPdf(await deckWithHiddenSlide(2));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length, 20);
});

test("worker renders stored decks, never retries, and repair covers older decks", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /if \(job\.type === "slide_preview"\) return processSlidePreviewJob\(job\);/);
  assert.match(worker, /if \(isSlideDeck\(filename\) && \(s3Key \|\| existingDoc\.filePath\)\) await queueSlidePreview\(docId\);/);
  assert.match(worker, /if \(isSlideDeck\(doc\.filename\) && doc\.filePath\) await queueSlidePreview\(doc\.id\);/);
});

test("no-copy decks are converted by SharePoint, not stored", () => {
  assert.match(read("src/app/api/documents/[id]/slides/route.js"), /sourcePreviewUrl\(doc\.id\)\}\?format=pdf/);
  assert.match(read("src/app/api/documents/[id]/preview/route.js"), /format: asPdf \? "pdf" : null/);
});
