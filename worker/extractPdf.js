// worker/extractPdf.js
// Pure-JS PDF text extraction using pdf-parse (no native pdftotext binary required).
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export async function extractPdfText(buffer) {
  try {
    const result = await pdfParse(buffer);
    return result.text || "";
  } catch (err) {
    // Treat parse errors as empty text — caller will detect scanned PDF
    console.warn(`⚠️  pdf-parse error: ${err.message}`);
    return "";
  }
}
