// E-5 / E11.1: PowerPoint slides + notes, one chunk per slide (worker/extractPptx.js).
// Decks are built here with JSZip so every edge case is explicit.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { extractPptxSlides, pptxChunks, paragraphsText, PptxError } from "../../worker/extractPptx.js";
import { checkFileFormat } from "../../src/lib/fileFormats.js";
import { slideCitation, slideOf, slidesFromChunks } from "../../src/lib/slideCitations.js";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const para = (...runs) => `<a:p>${runs.map((r) => (r === "<br>" ? "<a:br/>" : `<a:r><a:rPr lang="en-US"/><a:t>${r}</a:t></a:r>`)).join("")}</a:p>`;
const shape = (ph, ...paras) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph ${ph}/>` : ""}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras.join("")}</p:txBody></p:sp>`;
const slideXml = (shapes, attrs = "") => `<?xml version="1.0"?><p:sld ${NS}${attrs}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${shapes.join("")}</p:spTree></p:cSld></p:sld>`;
const rels = (list) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join("")}</Relationships>`;

/** slides: [{ file, xml, notes?, diagram? }] in presentation order. */
async function buildDeck(slides) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`).join("")}</p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ...slides.map((s, i) => [`rId${i + 10}`, "slide", `slides/${s.file}`])]));
  for (const s of slides) {
    zip.file(`ppt/slides/${s.file}`, s.xml);
    const slideRels = [["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]];
    if (s.notes) {
      zip.file(`ppt/notesSlides/notes_${s.file}`, s.notes);
      slideRels.push(["rId2", "notesSlide", `../notesSlides/notes_${s.file}`]);
    }
    if (s.diagram) {
      zip.file(`ppt/diagrams/data_${s.file}`, s.diagram);
      slideRels.push(["rId3", "diagramData", `../diagrams/data_${s.file}`]);
    }
    zip.file(`ppt/slides/_rels/${s.file}.rels`, rels(slideRels));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

const notes = (text) => slideXml([shape('type="sldImg"'), shape('type="body" idx="1"', para(text)), shape('type="sldNum" idx="5"', para("3"))]).replace(/p:sld /, "p:notes ").replace("</p:sld>", "</p:notes>");

test("slides come in presentation order (sldIdLst), not file-name order", async () => {
  const deck = await buildDeck([
    { file: "slide3.xml", xml: slideXml([shape('type="title"', para("Intro")), shape('idx="1"', para("Welcome"))]) },
    { file: "slide1.xml", xml: slideXml([shape('type="title"', para("Second"))]) },
  ]);
  const { slides, slideCount } = await extractPptxSlides(deck);
  assert.equal(slideCount, 2);
  assert.deepEqual(slides.map((s) => [s.slide, s.title]), [[1, "Intro"], [2, "Second"]]);
  assert.equal(slides[0].body, "Welcome");
});

test("title, body, table and SmartArt text; footer, date and slide number dropped; entities decoded", async () => {
  const table = `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${para("Unit")}</a:txBody></a:tc><a:tc><a:txBody>${para("Output &amp; MW")}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  const deck = await buildDeck([
    {
      file: "slide1.xml",
      xml: slideXml([
        shape('type="ctrTitle"', para("Blenheim", "-Gilboa")),
        shape('type="body" idx="1"', para("Line one", "<br>", "line two"), para("  ")),
        `<p:grpSp>${shape(null, para("Grouped box"))}</p:grpSp>`,
        table,
        shape('type="ftr" idx="11"', para("NYPA Confidential")),
        shape('type="dt" idx="10"', para("11/4/2026")),
        shape('type="sldNum" idx="12"', para("1")),
      ]),
      diagram: `<dgm:dataModel xmlns:dgm="x" xmlns:a="y"><dgm:ptLst><dgm:pt><dgm:t>${para("Step A")}</dgm:t></dgm:pt></dgm:ptLst></dgm:dataModel>`,
    },
  ]);
  const [s] = (await extractPptxSlides(deck)).slides;
  assert.equal(s.title, "Blenheim-Gilboa");
  assert.equal(s.body, "Line one\nline two\nGrouped box\nUnit\nOutput & MW\nStep A");
  assert.doesNotMatch(s.body, /Confidential|11\/4\/2026/);
});

test("speaker notes: the notes body only, not the slide image or number", async () => {
  const deck = await buildDeck([{ file: "slide1.xml", xml: slideXml([shape('type="title"', para("Agenda"))]), notes: notes("Mention the outage on &lt;Unit 2&gt;") }]);
  const [s] = (await extractPptxSlides(deck)).slides;
  assert.equal(s.notes, "Mention the outage on <Unit 2>");
});

test("one chunk per slide with slide metadata; empty slides skipped with numbering kept; hidden slides marked", async () => {
  const deck = await buildDeck([
    { file: "slide1.xml", xml: slideXml([shape('type="title"', para("One"))]) },
    { file: "slide2.xml", xml: slideXml([shape('type="sldNum"', para("2"))]) }, // no real text
    { file: "slide3.xml", xml: slideXml([shape('type="title"', para("Three")), shape('idx="1"', para("Body"))], ' show="0"'), notes: notes("Say this") },
  ]);
  const { chunks, fullText } = pptxChunks(await extractPptxSlides(deck));
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].metadata, { kind: "slide", slide: 1, of: 3, title: "One", hasNotes: false });
  assert.deepEqual(chunks[1].metadata, { kind: "slide", slide: 3, of: 3, title: "Three", hasNotes: true, hidden: true });
  assert.equal(chunks[1].text, "Slide 3: Three (hidden slide)\n\nBody\n\nSpeaker notes:\nSay this");
  assert.match(fullText, /^Slide 1: One\n\nSlide 3: Three/);
});

test("a very long slide is split into parts that keep the slide number", async () => {
  const lines = Array.from({ length: 40 }, (_, i) => para(`Requirement ${i} `.repeat(6)));
  const deck = await buildDeck([{ file: "slide1.xml", xml: slideXml([shape('type="title"', para("Big")), shape('idx="1"', ...lines)]) }]);
  const { chunks } = pptxChunks(await extractPptxSlides(deck), 1000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.metadata.slide === 1 && c.text.length <= 1000));
  assert.deepEqual(chunks.map((c) => c.metadata.part), chunks.map((_, i) => i + 1));
});

test("password-protected (OLE compound) and non-zip files fail with clear codes", async () => {
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
  await assert.rejects(extractPptxSlides(ole), (err) => err instanceof PptxError && err.errorCode === "PPTX_PROTECTED" && /password-protected/.test(err.message));
  await assert.rejects(extractPptxSlides(Buffer.from("not a zip")), (err) => err.errorCode === "PPTX_INVALID");
  const noPresentation = await new JSZip().file("a.txt", "x").generateAsync({ type: "nodebuffer" });
  await assert.rejects(extractPptxSlides(noPresentation), (err) => err.errorCode === "PPTX_INVALID");
});

test("paragraphsText ignores <a:pPr> and keeps paragraph order", () => {
  assert.equal(paragraphsText(`<a:p><a:pPr lvl="1"/><a:r><a:t>A</a:t></a:r></a:p><a:p><a:r><a:t xml:space="preserve"> B </a:t></a:r></a:p>`), "A\nB");
});

test(".pptx is accepted; .ppt is refused with a save-as message", () => {
  assert.equal(checkFileFormat("Deck.PPTX").ok, true);
  assert.match(checkFileFormat("Old deck.ppt").reason, /Save it as \.pptx/);
});

test("worker sends .pptx through the slide extractor and stops (no retry) on a protected file", () => {
  const worker = readFileSync(new URL("../../worker/index.js", import.meta.url), "utf8");
  assert.match(worker, /ext === "\.pptx"/);
  assert.match(worker, /extractPptxChunks\(/);
  assert.match(worker, /PPTX_PROTECTED/);
});

test("viewer reads back what the worker wrote: body, notes, hidden flag, split parts, slide count", async () => {
  const lines = Array.from({ length: 30 }, (_, i) => para(`Line ${i} `.repeat(8)));
  const deck = await buildDeck([
    { file: "slide1.xml", xml: slideXml([shape('type="title"', para("One")), shape('idx="1"', para("Body one"))]), notes: notes("Note one") },
    { file: "slide2.xml", xml: slideXml([]) },
    { file: "slide3.xml", xml: slideXml([shape('type="title"', para("Long")), shape('idx="1"', ...lines)], ' show="0"') },
    { file: "slide4.xml", xml: slideXml([]), notes: notes("Only notes") },
  ]);
  const { chunks } = pptxChunks(await extractPptxSlides(deck), 800);
  const rows = chunks.map((c, i) => ({ chunkIndex: i, ...c })).reverse(); // order must not matter
  const { slides, total } = slidesFromChunks(rows);
  assert.equal(total, 4);
  assert.deepEqual(slides.map((s) => s.slide), [1, 3, 4]);
  assert.deepEqual(slides[0], { slide: 1, title: "One", hidden: false, body: "Body one", notes: "Note one" });
  assert.equal(slides[1].hidden, true);
  assert.match(slides[1].body, /^Line 0 /);
  assert.match(slides[1].body, /Line 29 /);
  assert.deepEqual([slides[2].body, slides[2].notes], ["", "Only notes"]);
});

test("slide citations: label, viewer link at the first cited slide; nothing for non-slide chunks", () => {
  assert.equal(slideOf({ metadata: { kind: "slide", slide: 7 } }), 7);
  assert.equal(slideOf({ metadata: { sheetName: "Q3" } }), null);
  assert.equal(slideOf({ metadata: null }), null);
  assert.deepEqual(slideCitation("doc 1", new Set([9, 7, 7])), { slides: [7, 9], locator: "slides 7, 9", viewerUrl: "/document?id=doc%201&slide=7" });
  assert.equal(slideCitation("d", [1, 2, 3, 4, 5]).locator, "slides 1, 2, 3, 4…");
  assert.deepEqual(slideCitation("d", []), {});
});

test("chat tells the model which slide each excerpt is from and returns the slide locator", () => {
  const route = readFileSync(new URL("../../src/app/api/org/[orgId]/chat/route.js", import.meta.url), "utf8");
  assert.match(route, /\[slide \$\{slide\}\]/);
  assert.match(route, /slideCitation\(g\.documentId, g\.slides\)/);
});
