// EKP E11.2 (E-14): an image (PNG, JPG) becomes searchable text in two ways:
// - OCR (Tesseract, already used for scanned PDFs): the words in the image,
//   e.g. the serial number on a nameplate;
// - an AI description (the org's OpenAI key, gpt-4o-mini vision): what the
//   image shows, plus any readable text, so a photo with no clean text is
//   still found ("photo of a transformer nameplate").
// Either part may be missing (no text in the photo, no OpenAI key); the
// document fails only when both are.
import sharp from "sharp";
import Tesseract from "tesseract.js";

// Big phone photos make OCR slow without making it better.
const OCR_MAX_SIDE = 2400;
// The vision model reads a 1024 px image in full detail.
const VISION_MAX_SIDE = 1024;
const DESCRIPTION_MAX_TOKENS = 400;

export class UnreadableImage extends Error {}

function cleanText(text) {
  return String(text || "")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The image upright (EXIF orientation applied), as two smaller copies: a
 * grayscale PNG for OCR and a JPEG for the vision model. Throws
 * UnreadableImage when the bytes aren't an image sharp can read.
 */
export async function prepareImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: "none" }).metadata();
  } catch (err) {
    throw new UnreadableImage(`not a readable image (${err.message})`);
  }
  if (!meta.width || !meta.height) throw new UnreadableImage("not a readable image");
  const base = () => sharp(buffer, { failOn: "none" }).rotate();
  const [ocr, vision] = await Promise.all([
    base().resize({ width: OCR_MAX_SIDE, height: OCR_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).grayscale().png().toBuffer(),
    base().resize({ width: VISION_MAX_SIDE, height: VISION_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer(),
  ]);
  return { ocr, vision, width: meta.width, height: meta.height, format: meta.format };
}

/** The words Tesseract reads in the image ("" when none). */
export async function ocrImage(pngBuffer, { recognize = Tesseract.recognize } = {}) {
  const result = await recognize(pngBuffer, "eng", { logger: () => {} });
  const text = cleanText(result?.data?.text);
  // Tesseract turns texture into a few stray characters; that isn't text.
  return text.replace(/[^A-Za-z0-9]/g, "").length >= 4 ? text : "";
}

export const DESCRIBE_PROMPT =
  "You describe images for an enterprise knowledge base search index. In 2 to 5 sentences, say what the image shows " +
  "(the kind of image, e.g. photo, diagram, chart, screenshot, scanned form; the main objects, equipment, people's roles, " +
  "places). Then, if any text is readable, copy the important parts exactly as written (labels, serial and model numbers, " +
  "headings, values), on a line starting with \"Visible text:\". Do not guess text you can't read, and do not identify people by name.";

/** The vision model's description of the image ("" if it gave none). */
export async function describeImage(openai, jpegBuffer, { filename = "" } = {}) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: DESCRIPTION_MAX_TOKENS,
    messages: [
      { role: "system", content: DESCRIBE_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: filename ? `File name: ${filename}` : "Describe this image." },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpegBuffer.toString("base64")}`, detail: "high" } },
        ],
      },
    ],
  });
  return cleanText(res?.choices?.[0]?.message?.content);
}

/**
 * The document text for an image: its description and the OCR text, labelled
 * so the chat model and the reader know which is which.
 */
export function imageText({ filename, description, ocrText }) {
  const parts = [];
  if (description) parts.push(`Image description (AI-generated):\n${description}`);
  if (ocrText) parts.push(`Text in the image (OCR):\n${ocrText}`);
  if (!parts.length) return "";
  return [`Image: ${filename}`, ...parts].join("\n\n");
}

/**
 * E11.2: the whole read. getOpenAI() returns a client or throws (no key);
 * a missing key or a failed description call leaves the OCR text alone.
 * Returns { text, description, ocrText, width, height }.
 */
export async function extractImage(buffer, { filename, getOpenAI, recognize, describe = describeImage } = {}) {
  const prepared = await prepareImage(buffer);
  const [ocrText, description] = await Promise.all([
    ocrImage(prepared.ocr, recognize ? { recognize } : undefined).catch((err) => {
      console.warn(`⚠️ OCR failed for ${filename}: ${err.message}`);
      return "";
    }),
    (async () => {
      try {
        const openai = await getOpenAI();
        return await describe(openai, prepared.vision, { filename });
      } catch (err) {
        console.warn(`⚠️ No AI description for ${filename}: ${err.message}`);
        return "";
      }
    })(),
  ]);
  return {
    text: imageText({ filename, description, ocrText }),
    description,
    ocrText,
    width: prepared.width,
    height: prepared.height,
  };
}
