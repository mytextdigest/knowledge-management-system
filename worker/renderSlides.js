// Renders a PowerPoint deck to PDF with LibreOffice (headless), so the
// document page can show slides as designed. Needs `soffice` on the worker
// (libreoffice-impress) and, for faithful text, metric-compatible fonts
// (fonts-crosextra-carlito for Calibri, fonts-crosextra-caladea for Cambria,
// fonts-liberation for Arial/Times/Courier).
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";

const SOFFICE = process.env.SOFFICE_PATH || "soffice";
const TIMEOUT_MS = 120_000;

export class SlideRenderUnavailable extends Error {}

function run(cmd, args, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new SlideRenderUnavailable(`${cmd} is not installed`) : err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${signal ? `on ${signal}` : `with ${code}`}: ${stderr.trim().slice(0, 300)}`));
    });
  });
}

// Hidden slides are indexed and cited by their position, so the PDF must keep
// them too (page N = slide N). LibreOffice skips them and older versions
// ignore its export option, so they're un-hidden in a copy first.
export async function unhideSlides(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    const xml = await zip.file(name).async("string");
    const shown = xml.replace(/(<p:sld\b[^>]*?)\s+show="(?:0|false)"/, "$1");
    if (shown !== xml) {
      zip.file(name, shown);
      changed = true;
    }
  }
  return changed ? zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : buffer;
}

/** A .pptx buffer → its slides as a PDF buffer (one page per slide, hidden slides included). */
export async function renderPptxToPdf(buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "kms-slides-"));
  try {
    const input = path.join(dir, "deck.pptx");
    await writeFile(input, await unhideSlides(buffer));
    // A profile per run, so parallel conversions don't fight over one.
    await run(SOFFICE, [
      "--headless", "--norestore", "--nolockcheck",
      `-env:UserInstallation=${pathToFileURL(path.join(dir, "profile")).href}`,
      "--convert-to", "pdf",
      "--outdir", dir, input,
    ], { timeoutMs: TIMEOUT_MS });
    return await readFile(path.join(dir, "deck.pdf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
