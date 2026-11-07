// EKP E11.1 (Workstream E, E-5): PowerPoint (.pptx) → one chunk per slide.
//
// A .pptx is a zip of XML parts. Slides are read in presentation order
// (ppt/presentation.xml sldIdLst, not the slideN.xml file numbers, which
// keep their original numbers after slides are reordered). Each slide gives
// its title, body text (text boxes, placeholders, tables, groups, SmartArt)
// and speaker notes. Slide numbers in citations are the position in the
// deck, as PowerPoint shows them.
//
// Edge cases (WS_E_CONTENT_COVERAGE.md E-M1): a slide with no text is
// skipped but keeps its number; hidden slides are indexed and marked
// hidden; a password-protected file fails with PPTX_PROTECTED (encrypted
// Office files aren't zips, they're OLE compound files).

import JSZip from "jszip";

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const REL_SLIDE = "/relationships/slide";
const REL_NOTES = "/relationships/notesSlide";
const REL_DIAGRAM_DATA = "/relationships/diagramData";

// Placeholders whose text isn't slide content (footer, date, slide number).
const CHROME_PLACEHOLDERS = new Set(["sldNum", "dt", "ftr", "hdr", "sldImg"]);
const TITLE_PLACEHOLDERS = new Set(["title", "ctrTitle"]);

// One slide's chunk is kept whole up to this size, then split (same metadata).
const MAX_SLIDE_CHUNK_CHARS = 6000;

export class PptxError extends Error {
  constructor(code, message) {
    super(message);
    this.errorCode = code;
  }
}

function decodeXml(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text of an XML fragment: one line per <a:p> paragraph, <a:br/> as a line break. */
export function paragraphsText(xml) {
  const lines = [];
  for (const [para] of xml.matchAll(/<a:p[\s>][\s\S]*?<\/a:p>/g)) {
    let line = "";
    for (const m of para.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) {
      line += m[1] !== undefined ? decodeXml(m[1]) : "\n";
    }
    for (const part of line.split("\n")) {
      const clean = part.replace(/\s+/g, " ").trim();
      if (clean) lines.push(clean);
    }
  }
  return lines.join("\n");
}

const shapesOf = (xml) => [...xml.matchAll(/<p:sp[\s>][\s\S]*?<\/p:sp>/g)].map((m) => m[0]);
const placeholderType = (shapeXml) => {
  const ph = shapeXml.match(/<p:ph\b[^>]*>/);
  if (!ph) return null;
  return ph[0].match(/\btype="([^"]+)"/)?.[1] || "body"; // a <p:ph> without type is a body placeholder
};

/** Title and body text of one slide's XML. */
export function slideText(xml) {
  let title = "";
  let rest = xml;
  for (const shape of shapesOf(xml)) {
    const type = placeholderType(shape);
    if (TITLE_PLACEHOLDERS.has(type)) {
      if (!title) title = paragraphsText(shape).replace(/\n/g, " ");
      rest = rest.replace(shape, "");
    } else if (CHROME_PLACEHOLDERS.has(type)) {
      rest = rest.replace(shape, "");
    }
  }
  return { title, body: paragraphsText(rest) };
}

/** Speaker-notes text of a notes slide's XML (its body placeholder). */
export function notesText(xml) {
  const shapes = shapesOf(xml);
  const body = shapes.filter((s) => placeholderType(s) === "body");
  const use = body.length ? body : shapes.filter((s) => !CHROME_PLACEHOLDERS.has(placeholderType(s)));
  return use.map(paragraphsText).filter(Boolean).join("\n");
}

function parseRels(xml) {
  const rels = [];
  for (const [tag] of (xml || "").matchAll(/<Relationship\b[^>]*>/g)) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    rels.push({ id: attr("Id"), type: attr("Type") || "", target: attr("Target") || "", external: attr("TargetMode") === "External" });
  }
  return rels;
}

// A relationship target relative to the folder of the part that has it.
function resolveTarget(fromPart, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = fromPart.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

const relsPathOf = (part) => {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
};

async function readPart(zip, path) {
  const file = zip.file(path);
  return file ? file.async("string") : null;
}

/**
 * The slides of a .pptx buffer in presentation order:
 * [{ slide, title, body, notes, hidden }] (slide is 1-based).
 * Throws PptxError PPTX_PROTECTED or PPTX_INVALID.
 */
export async function extractPptxSlides(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_SIGNATURE)) {
    throw new PptxError(
      "PPTX_PROTECTED",
      "This PowerPoint file is password-protected (or is an old .ppt renamed to .pptx). Remove the password, save it as .pptx and upload it again."
    );
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new PptxError("PPTX_INVALID", "This file isn't a valid PowerPoint (.pptx) file.");
  }
  const presentation = await readPart(zip, "ppt/presentation.xml");
  if (!presentation) throw new PptxError("PPTX_INVALID", "This file isn't a valid PowerPoint (.pptx) file.");

  const presRels = parseRels(await readPart(zip, relsPathOf("ppt/presentation.xml")));
  const relById = new Map(presRels.map((r) => [r.id, r]));
  const sldIdList = presentation.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/)?.[1] || "";
  const slidePaths = [...sldIdList.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)]
    .map((m) => relById.get(m[1]))
    .filter((r) => r && r.type.endsWith(REL_SLIDE) && !r.external)
    .map((r) => resolveTarget("ppt/presentation.xml", r.target));

  const slides = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const path = slidePaths[i];
    const xml = await readPart(zip, path);
    if (!xml) continue; // listed but missing: keep numbering
    const hidden = /<p:sld\b[^>]*\bshow="(0|false)"/.test(xml);
    const { title, body: slideBody } = slideText(xml);

    const rels = parseRels(await readPart(zip, relsPathOf(path)));
    const extra = [];
    for (const rel of rels.filter((r) => r.type.endsWith(REL_DIAGRAM_DATA) && !r.external)) {
      const data = await readPart(zip, resolveTarget(path, rel.target)); // SmartArt text
      if (data) extra.push(paragraphsText(data));
    }
    const notesRel = rels.find((r) => r.type.endsWith(REL_NOTES) && !r.external);
    const notesXml = notesRel ? await readPart(zip, resolveTarget(path, notesRel.target)) : null;

    slides.push({
      slide: i + 1,
      title,
      body: [slideBody, ...extra].filter(Boolean).join("\n"),
      notes: notesXml ? notesText(notesXml) : "",
      hidden,
    });
  }
  return { slides, slideCount: slidePaths.length };
}

function splitText(text, size) {
  if (text.length <= size) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size / 2) cut = size;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Chunks for the worker: one per slide with text (a very long slide is
 * split, every part keeping the slide's metadata), and the deck's full text.
 * Chunk metadata (the contract in WS_E_CONTENT_COVERAGE.md §3.2):
 * { kind: "slide", slide, of, title, hasNotes, hidden? , part? }.
 */
export function pptxChunks({ slides, slideCount }, maxChars = MAX_SLIDE_CHUNK_CHARS) {
  const chunks = [];
  const texts = [];
  for (const s of slides) {
    if (!s.title && !s.body && !s.notes) continue; // no text: skipped, numbering kept
    const heading = `Slide ${s.slide}${s.title ? `: ${s.title}` : ""}${s.hidden ? " (hidden slide)" : ""}`;
    const text = [heading, s.body, s.notes ? `Speaker notes:\n${s.notes}` : ""].filter(Boolean).join("\n\n");
    texts.push(text);
    const metadata = {
      kind: "slide",
      slide: s.slide,
      of: slideCount,
      title: s.title || null,
      hasNotes: Boolean(s.notes),
      ...(s.hidden ? { hidden: true } : {}),
    };
    const parts = splitText(text, maxChars);
    parts.forEach((part, i) => chunks.push({ text: part, metadata: parts.length > 1 ? { ...metadata, part: i + 1 } : metadata }));
  }
  return { chunks, fullText: texts.join("\n\n") };
}

export async function extractPptxChunks(buffer, maxChars) {
  return pptxChunks(await extractPptxSlides(buffer), maxChars);
}
