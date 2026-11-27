// EKP E-15 (E13.3): card thumbnails. sharp, JSZip and (when installed)
// pdftoppm and ffmpeg run for real on generated files. No S3, no network.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import JSZip from "jszip";
import { THUMBNAIL_MAX_SIDE, thumbnailKey, thumbnailKind, thumbnailUrl } from "../../src/lib/thumbnails.js";
import { embeddedPptxThumbnail, imageThumbnail, pdfThumbnail, videoThumbnail } from "../../worker/thumbnails.js";
import { createPurgePlan } from "../../src/lib/lifecycle/purgePolicy.mjs";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const has = (cmd) => { try { execFileSync("which", [cmd], { stdio: "ignore" }); return true; } catch { return false; } };

async function assertThumbnail(buffer) {
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok(Math.max(meta.width, meta.height) <= THUMBNAIL_MAX_SIDE, `${meta.width}×${meta.height}`);
  return meta;
}

// The smallest valid one-page PDF (a filled rectangle), with a correct xref.
function tinyPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
  ];
  const stream = "0.2 0.4 0.8 rg 72 600 468 120 re f";
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("which files get a thumbnail, and where it is kept", () => {
  assert.equal(thumbnailKey("doc1"), "thumbnails/doc1.jpg");
  assert.equal(thumbnailKind("Report.PDF"), "pdf");
  assert.equal(thumbnailKind("deck.pptx"), "slides");
  assert.equal(thumbnailKind("photo.jpeg"), "image");
  assert.equal(thumbnailKind("meeting.mp4"), "video");
  assert.equal(thumbnailKind("meeting.mp3"), null);
  assert.equal(thumbnailKind("notes.docx"), null);
});

test("a card's thumbnail URL: stored → KMS's JPEG (cache-busted); no-copy SharePoint → SharePoint's; else none", () => {
  const at = new Date("2026-11-26T10:00:00Z");
  assert.equal(
    thumbnailUrl({ id: "d1", filename: "a.pdf", thumbnailPath: "thumbnails/d1.jpg", filePath: "uploads/a.pdf", contentUpdatedAt: at }),
    `/api/documents/d1/thumbnail?v=${at.getTime()}`
  );
  const noCopy = { id: "d2", filename: "b.pptx", filePath: null, sourceProvider: "sharepoint", contentType: "file", externalId: "item", externalUrl: "https://x" };
  assert.equal(thumbnailUrl(noCopy), "/api/documents/d2/thumbnail");
  assert.equal(thumbnailUrl({ ...noCopy, filename: "b.docx" }), null);
  assert.equal(thumbnailUrl({ ...noCopy, contentType: "page" }), null);
  assert.equal(thumbnailUrl({ id: "d3", filename: "c.pdf", filePath: "uploads/c.pdf", thumbnailPath: null }), null, "stored but not drawn yet");
});

test("image: upright, at most 480 px, JPEG, transparent areas on white", async () => {
  const png = await sharp({ create: { width: 2000, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const meta = await assertThumbnail(await imageThumbnail(png));
  assert.equal(meta.width, 480);
  const { data } = await sharp(await imageThumbnail(png)).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240, "transparent becomes white, not black");
  const small = await sharp({ create: { width: 100, height: 50, channels: 3, background: "#f00" } }).png().toBuffer();
  assert.equal((await assertThumbnail(await imageThumbnail(small))).width, 100, "never enlarged");
});

test("PowerPoint: the preview saved in the deck when slides aren't rendered; none → null", async () => {
  const zip = new JSZip();
  zip.file("docProps/thumbnail.jpeg", await sharp({ create: { width: 256, height: 192, channels: 3, background: "#036" } }).jpeg().toBuffer());
  zip.file("ppt/presentation.xml", "<p:presentation/>");
  await assertThumbnail(await embeddedPptxThumbnail(await zip.generateAsync({ type: "nodebuffer" })));
  const bare = new JSZip();
  bare.file("ppt/presentation.xml", "<p:presentation/>");
  assert.equal(await embeddedPptxThumbnail(await bare.generateAsync({ type: "nodebuffer" })), null);
  assert.equal(await embeddedPptxThumbnail(Buffer.from("not a zip")), null);
});

test("PDF: the first page (pdftoppm)", { skip: !has("pdftoppm") && "pdftoppm isn't installed (apt-get install poppler-utils)" }, async () => {
  const meta = await assertThumbnail(await pdfThumbnail(tinyPdf()));
  assert.ok(meta.height > meta.width, "portrait page");
});

test("video: a frame at 1 s, or the first frame of a shorter clip (ffmpeg)", { skip: !has("ffmpeg") && "ffmpeg isn't installed" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kms-e15-"));
  try {
    for (const [name, seconds] of [["long.mp4", 2], ["short.mp4", 0.4]]) {
      const file = path.join(dir, name);
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=10:duration=${seconds}`, "-pix_fmt", "yuv420p", file]);
      const meta = await assertThumbnail(await videoThumbnail(file));
      assert.equal(meta.width, 480);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a purged document's thumbnail is deleted with its files", () => {
  const now = new Date("2026-11-26T00:00:00Z");
  const plan = createPurgePlan({
    id: "d1", orgId: "o1", filename: "a.pdf", filePath: "uploads/a.pdf", thumbnailPath: "thumbnails/d1.jpg",
    deletedAt: new Date("2026-10-01"), purgeAfter: new Date("2026-11-01"), versions: [],
  }, now);
  assert.deepEqual(plan.objectKeys, ["uploads/a.pdf", "thumbnails/d1.jpg"]);
});

test("wiring: the worker queues, makes and removes thumbnails; the API and cards serve them", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /job\.type === "thumbnail"\) return processThumbnailJob/);
  assert.match(worker, /\(thumbKind === "pdf" \|\| thumbKind === "image"\) && \(s3Key \|\| existingDoc\.filePath\)\) await queueThumbnail/, "after chunking");
  assert.match(worker, /probe\.hasVideo && \(s3Key \|\| doc\.filePath\)\) await queueThumbnail/, "after a recording");
  assert.match(worker, /the card shows the first slide[\s\S]*await queueThumbnail\(doc\.id\);/, "after the slides render");
  assert.match(worker, /if \(docId\) await deleteThumbnail\(docId\); \/\/ E13\.3: made from the stored copy/, "no-copy switch / too large");
  assert.match(worker, /getSignedUrl\(s3, new GetObjectCommand/, "video frame without downloading");

  const route = read("src/app/api/documents/[id]/thumbnail/route.js");
  assert.match(route, /canViewDocument\(doc, \{ userId: user\.id, role \}\)/, "same access rule as the file");
  assert.match(route, /fetchDriveItemThumbnail/);
  assert.match(read("src/app/api/org/[orgId]/repository/route.js"), /thumbnailUrl: thumbnailUrl\(\{ \.\.\.d, filePath, thumbnailPath, externalId \}\)/);
  const card = read("src/components/repository/RepositoryDocumentCard.jsx");
  assert.match(card, /src=\{document\.thumbnailUrl\}/);
  assert.match(card, /onError=\{\(\) => setThumbFailed\(true\)\}/);
  assert.match(card, /preview\?\.kind === "image"/);
  assert.match(card, /preview\?\.kind === "video"/);
});
