// EKP E13.3 (E-15): small JPEG thumbnails for cards (src/lib/thumbnails.js).
// Tools: sharp (npm) for every kind; pdftoppm (apt-get install poppler-utils)
// for PDFs and rendered slides; ffmpeg (already on the worker for E11.6) for
// video. A missing tool throws ThumbnailToolUnavailable and the card keeps
// its file-type icon.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import { THUMBNAIL_MAX_SIDE } from "../src/lib/thumbnails.js";

export class ThumbnailToolUnavailable extends Error {}

function run(cmd, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new ThumbnailToolUnavailable(`${cmd} isn't installed on this worker`) : err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${signal ? `on ${signal}` : `with ${code}`}: ${stderr.trim().split("\n").slice(-2).join(" ").slice(0, 300)}`));
    });
  });
}

async function withTemp(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "kms-thumb-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Any image sharp reads → an upright JPEG no larger than THUMBNAIL_MAX_SIDE. */
export function imageThumbnail(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: THUMBNAIL_MAX_SIDE, height: THUMBNAIL_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

/** A PDF's first page. */
export async function pdfThumbnail(pdfBuffer) {
  return withTemp(async (dir) => {
    const input = path.join(dir, "in.pdf");
    await writeFile(input, pdfBuffer);
    // -singlefile writes out.jpg (no page number); -scale-to sets the longer side.
    await run("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-jpeg", "-scale-to", String(THUMBNAIL_MAX_SIDE * 2), input, path.join(dir, "out")]);
    return imageThumbnail(await readFile(path.join(dir, "out.jpg")));
  });
}

/** The preview PowerPoint saves inside a deck (docProps/thumbnail.jpeg), or null. */
export async function embeddedPptxThumbnail(pptxBuffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(pptxBuffer);
  } catch {
    return null;
  }
  const entry = Object.keys(zip.files).find((n) => /^docProps\/thumbnail\.(jpe?g|png)$/i.test(n));
  if (!entry) return null;
  return imageThumbnail(await zip.file(entry).async("nodebuffer"));
}

/**
 * A video frame at 1 s (or the first frame of a shorter clip). `input` is a
 * path or a URL: ffmpeg seeks over HTTP with range requests, so a large
 * recording isn't downloaded for one frame.
 */
export async function videoThumbnail(input) {
  return withTemp(async (dir) => {
    const out = path.join(dir, "frame.jpg");
    const grab = (at) => run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-ss", at, "-i", input, "-frames:v", "1", "-q:v", "3", out], { timeoutMs: 120_000 });
    try {
      await grab("1");
      return imageThumbnail(await readFile(out));
    } catch (err) {
      if (err instanceof ThumbnailToolUnavailable) throw err;
      await grab("0"); // under a second long: no frame at 1 s
      return imageThumbnail(await readFile(out));
    }
  });
}
