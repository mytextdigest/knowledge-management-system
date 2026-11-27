// EKP E-14 (E11.2): images are read with OCR plus an AI description.
// No network: Tesseract and the vision model are stubbed; sharp is real.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { checkFileFormat, isImageFile, isSupportedFile, playableContentType, ACCEPT_ATTRIBUTE } from "../../src/lib/fileFormats.js";
import { extractImage, imageText, ocrImage, prepareImage, UnreadableImage } from "../../worker/extractImage.js";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

// A 3000×2000 photo, as a phone would send it.
const photo = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#7a8a99" } }).jpeg().toBuffer();
const recognizeAs = (text) => async () => ({ data: { text } });

test("PNG and JPG are accepted formats; other images are not", () => {
  for (const name of ["nameplate.png", "Site Photo.JPG", "scan.jpeg"]) {
    assert.ok(isSupportedFile(name), name);
    assert.ok(isImageFile(name), name);
  }
  assert.equal(isImageFile("deck.pptx"), false);
  assert.equal(checkFileFormat("drawing.tiff").ok, false);
  assert.equal(checkFileFormat("photo.heic").ok, false);
  assert.match(ACCEPT_ATTRIBUTE, /\.png/);
  assert.equal(playableContentType("a.jpg"), "image/jpeg");
  assert.equal(playableContentType("a.png"), "image/png");
});

test("an image is scaled down for OCR (grayscale PNG) and for the vision model (JPEG ≤ 1024 px)", async () => {
  const prepared = await prepareImage(await photo());
  assert.equal(prepared.width, 3000);
  const ocr = await sharp(prepared.ocr).metadata();
  const vision = await sharp(prepared.vision).metadata();
  assert.equal(ocr.format, "png");
  assert.ok(Math.max(ocr.width, ocr.height) <= 2400);
  assert.equal(vision.format, "jpeg");
  assert.ok(Math.max(vision.width, vision.height) <= 1024);
});

test("bytes that aren't an image are refused as unreadable", async () => {
  await assert.rejects(prepareImage(Buffer.from("not an image at all")), UnreadableImage);
});

test("OCR noise (a few stray characters) isn't text", async () => {
  assert.equal(await ocrImage(Buffer.alloc(1), { recognize: recognizeAs(" ~ . |\n") }), "");
  assert.equal(await ocrImage(Buffer.alloc(1), { recognize: recognizeAs("SERIAL NO. TX-4471-B\n\n\n\nRATED 13.8 kV") }), "SERIAL NO. TX-4471-B\n\nRATED 13.8 kV");
});

test("both parts: description and OCR text, labelled, in one document text", async () => {
  let sentToModel = null;
  const out = await extractImage(await photo(), {
    filename: "nameplate.jpg",
    recognize: recognizeAs("SERIAL NO. TX-4471-B"),
    getOpenAI: async () => ({}),
    describe: async (_openai, jpeg, { filename }) => { sentToModel = { bytes: jpeg.length, filename }; return "A photo of a transformer nameplate.\nVisible text: TX-4471-B"; },
  });
  assert.equal(sentToModel.filename, "nameplate.jpg");
  assert.ok(sentToModel.bytes > 0);
  assert.match(out.text, /^Image: nameplate\.jpg/);
  assert.match(out.text, /Image description \(AI-generated\):\nA photo of a transformer nameplate/);
  assert.match(out.text, /Text in the image \(OCR\):\nSERIAL NO\. TX-4471-B/);
});

test("no OpenAI key: the OCR text alone; no text either: nothing (the worker sets no_text_found)", async () => {
  const noKey = async () => { throw new Error("OPENAI_KEY_MISSING"); };
  const ocrOnly = await extractImage(await photo(), { filename: "a.png", recognize: recognizeAs("PUMP 3 ISOLATED"), getOpenAI: noKey });
  assert.equal(ocrOnly.description, "");
  assert.match(ocrOnly.text, /PUMP 3 ISOLATED/);
  const nothing = await extractImage(await photo(), { filename: "a.png", recognize: recognizeAs(""), getOpenAI: noKey });
  assert.equal(nothing.text, "");
  assert.equal(imageText({ filename: "x", description: "", ocrText: "" }), "");
});

test("a failed OCR or a failed description call doesn't fail the other", async () => {
  const out = await extractImage(await photo(), {
    filename: "a.png",
    recognize: async () => { throw new Error("tesseract crashed"); },
    getOpenAI: async () => ({}),
    describe: async () => "A wiring diagram.",
  });
  assert.equal(out.ocrText, "");
  assert.match(out.text, /A wiring diagram/);
});

test("wiring: the chunk job reads images, marks chunks kind=image, explains the two statuses", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /isImageFile\(filename\)\) \{[\s\S]*extractImage\(buffer, \{ filename, getOpenAI: \(\) => getOpenAIForDocument\(docId\) \}\)/);
  assert.match(worker, /metadata: \{ kind: "image"/);
  assert.match(worker, /status: "no_text_found"/);
  assert.match(worker, /status: "unreadable_file"/);
  assert.match(read("src/components/repository/RepositoryDocumentCard.jsx"), /no_text_found/);
  assert.match(read("src/app/(app)/document/page.jsx"), /What KMS read from this image/);
});
