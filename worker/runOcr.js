// worker/runOcr.js
// OCR pipeline for scanned PDFs using pdfjs-dist + pngjs + tesseract.js
// No native binaries: no tesseract binary, no poppler, no canvas, no cairo.

import { createRequire } from "module";
import { PNG } from "pngjs";
import Tesseract from "tesseract.js";

const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

// In Node.js, pdfjs-dist automatically uses a fake (in-process) worker.
// No workerSrc config needed — isWorkerDisabled is set to true by pdfjs for Node.js.

const OPS = pdfjsLib.OPS;

// ImageKind constants (not exported by pdfjs-dist display layer, defined here)
const ImageKind = { GRAYSCALE_1BPP: 1, RGB_24BPP: 2, RGBA_32BPP: 3 };

// OCR concurrency: 2 pages at a time to keep memory/CPU stable on EC2
const CONCURRENCY = 2;

// -------------------------------------------------------------------
// Image format conversion: pdfjs pixel data → PNG buffer for tesseract
// -------------------------------------------------------------------
function pixelDataToPngBuffer(imgData) {
  const { width, height, data, kind } = imgData;
  const png = new PNG({ width, height, filterType: -1 });

  if (kind === ImageKind.RGBA_32BPP) {
    // 4 bytes per pixel — use directly
    png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (kind === ImageKind.RGB_24BPP) {
    // 3 bytes per pixel → expand to RGBA
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
    png.data = rgba;
  } else if (kind === ImageKind.GRAYSCALE_1BPP) {
    // 1 bit per pixel (packed) → RGBA.
    // Each row is padded to a byte boundary (PDF spec / pdfjs convention),
    // so the bit offset must be computed per-row, not as one continuous bitstream.
    const rowBytes = (width + 7) >> 3;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bitIndex = y * rowBytes * 8 + x;
        const bit = (data[bitIndex >> 3] >> (7 - (bitIndex % 8))) & 1;
        const val = bit ? 255 : 0;
        const p = y * width + x;
        rgba[p * 4] = val;
        rgba[p * 4 + 1] = val;
        rgba[p * 4 + 2] = val;
        rgba[p * 4 + 3] = 255;
      }
    }
    png.data = rgba;
  } else {
    // Treat unknown kinds as RGBA if byte count matches
    const expectedRgba = width * height * 4;
    if (data.length === expectedRgba) {
      png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else {
      throw new Error(`Unsupported image kind: ${kind} (data length ${data.length})`);
    }
  }

  return PNG.sync.write(png);
}

// -------------------------------------------------------------------
// Fallback: scan raw PDF bytes for embedded JPEG streams (FF D8 FF … FF D9)
// Works reliably for scanner-produced PDFs where each page is a JPEG.
// -------------------------------------------------------------------
function extractJpegsFromBuffer(pdfBuffer) {
  const images = [];
  for (let i = 0; i < pdfBuffer.length - 3; i++) {
    if (pdfBuffer[i] === 0xFF && pdfBuffer[i + 1] === 0xD8 && pdfBuffer[i + 2] === 0xFF) {
      const start = i;
      for (let j = start + 2; j < pdfBuffer.length - 1; j++) {
        if (pdfBuffer[j] === 0xFF && pdfBuffer[j + 1] === 0xD9) {
          const jpeg = pdfBuffer.slice(start, j + 2);
          if (jpeg.length > 8192) images.push(jpeg); // skip tiny thumbnails
          i = j + 1;
          break;
        }
      }
    }
  }
  return images;
}

// -------------------------------------------------------------------
// Primary image extraction via pdfjs-dist operator list + page.objs
// After getOperatorList() resolves, image pixel data is available in
// page.objs (decoded to RGBA/RGB/1bpp by the pdfjs inline worker).
// No canvas or rendering step is required.
// -------------------------------------------------------------------
async function extractPageImages(pdfBuffer) {
  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    verbosity: 0,
    disableFontFace: true,
  }).promise;

  const numPages = pdfDoc.numPages;
  const pageImages = [];

  const imageOps = new Set([
    OPS.paintImageXObject,
    OPS.paintJpegXObject,
    OPS.paintImageXObjectRepeat,
  ]);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    try {
      // getOperatorList() triggers full page processing including image decoding.
      // pdfjs resolves all image XObjects into page.objs before lastChunk arrives.
      const ops = await page.getOperatorList();

      // Collect image XObject names referenced on this page
      const imgNames = new Set();
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (imageOps.has(ops.fnArray[i])) imgNames.add(ops.argsArray[i][0]);
      }

      // Get the largest image (page scan) — scanned PDFs have one image per page
      let bestData = null;
      let bestSize = 0;

      for (const name of imgNames) {
        let imgData = null;
        // page.objs holds page-specific images; commonObjs holds shared resources
        if (page.objs.has(name)) {
          imgData = page.objs.get(name);
        } else if (page.commonObjs.has(name)) {
          imgData = page.commonObjs.get(name);
        }

        if (imgData?.data && imgData.width && imgData.height) {
          const size = imgData.width * imgData.height;
          if (size > bestSize) {
            bestSize = size;
            bestData = imgData;
          }
        }
      }

      if (bestData) {
        pageImages.push({ pageNum, buffer: pixelDataToPngBuffer(bestData) });
      } else if (imgNames.size > 0) {
        console.warn(`⚠️  Image data not resolved for page ${pageNum} (names: ${[...imgNames].join(', ')})`);
      }
    } catch (err) {
      console.warn(`⚠️  Could not extract image from page ${pageNum}: ${err.message}`);
    }
    page.cleanup();
  }

  await pdfDoc.destroy();
  return pageImages;
}

// -------------------------------------------------------------------
// OCR text cleanup
// -------------------------------------------------------------------
function cleanOcrText(text) {
  return (text || '')
    .replace(/\f/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// -------------------------------------------------------------------
// runOCR — public entry point
// Accepts a PDF Buffer, returns { fullText, pageTexts }
// -------------------------------------------------------------------
export async function runOCR(pdfBuffer) {
  const ocrStart = Date.now();
  console.log('⚠️  Scanned PDF detected → running OCR');

  // Step 1: extract page images via pdfjs-dist (preferred, no native deps)
  let pageImages = await extractPageImages(pdfBuffer);

  // Step 2: fallback — extract raw JPEG streams from PDF binary
  if (pageImages.length === 0) {
    console.log('🔄  Falling back to raw JPEG extraction from PDF binary...');
    const jpegs = extractJpegsFromBuffer(pdfBuffer);
    if (jpegs.length === 0) {
      throw new Error('No page images could be extracted from the scanned PDF');
    }
    pageImages = jpegs.map((buffer, idx) => ({ pageNum: idx + 1, buffer }));
  }

  console.log(`🖼️  PDF converted to ${pageImages.length} image(s)`);

  // Step 3: OCR each page with limited concurrency (avoid memory spikes)
  const pageTexts = new Array(pageImages.length).fill('');

  for (let i = 0; i < pageImages.length; i += CONCURRENCY) {
    const batch = pageImages.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async ({ pageNum, buffer }) => {
        console.log(`OCR page ${pageNum}/${pageImages.length}`);
        try {
          const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
          return cleanOcrText(result.data.text);
        } catch (err) {
          console.warn(`⚠️  OCR failed for page ${pageNum}: ${err.message}`);
          return '';
        }
      })
    );

    results.forEach((text, j) => { pageTexts[i + j] = text; });
  }

  const fullText = pageTexts.filter(Boolean).join('\n\n');
  const elapsed = ((Date.now() - ocrStart) / 1000).toFixed(2);
  console.log(`⏱️  OCR completed in ${elapsed}s`);

  return { fullText, pageTexts };
}
