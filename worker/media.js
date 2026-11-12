// EKP E11.6 (Workstream E, E-6): recordings are never held in memory. The
// file is streamed from S3 or SharePoint to a temp file, and ffmpeg/ffprobe
// read it from disk. Worker memory stays flat whatever the file's size (an
// 8 GB video, NYPA Q&A #188). Temp files are always removed.
//
// The worker host needs ffmpeg (`sudo apt-get install -y ffmpeg`).

import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** ffmpeg/ffprobe is missing on this host. */
export class MediaToolsUnavailable extends Error {}

/** A web ReadableStream (fetch) or a Node stream, as a Node Readable. */
export function toNodeReadable(body) {
  if (!body) throw new Error("No content to read");
  return typeof body.getReader === "function" ? Readable.fromWeb(body) : body;
}

/**
 * Runs fn(dir) with a fresh temp directory, removed afterwards whatever happens.
 */
export async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "kms-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Streams `body` to `path`; returns the bytes written. */
export async function streamToFile(body, path) {
  await pipeline(toNodeReadable(body), createWriteStream(path));
  return (await stat(path)).size;
}

/**
 * Duration and kind of a media file, from ffprobe:
 * { durationSeconds, hasVideo, hasAudio }.
 */
export async function probeMedia(path) {
  let stdout;
  try {
    ({ stdout } = await run(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path],
      { timeout: 120_000, maxBuffer: 1024 * 1024 }
    ));
  } catch (err) {
    if (err.code === "ENOENT") throw new MediaToolsUnavailable("ffprobe isn't installed on this worker (apt-get install ffmpeg)");
    throw new Error(`ffprobe couldn't read the file: ${String(err.stderr || err.message).trim().slice(0, 300)}`);
  }
  const info = JSON.parse(stdout || "{}");
  const types = new Set((info.streams || []).map((s) => s.codec_type));
  const duration = Number(info.format?.duration);
  return {
    durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 10) / 10 : null,
    hasVideo: types.has("video"),
    hasAudio: types.has("audio"),
  };
}

/**
 * Samples the process's resident memory while a job runs, so the log shows
 * it stayed flat (E11.6 acceptance). stop() returns { startMb, peakMb }.
 */
export function watchMemory(intervalMs = 250) {
  const mb = () => Math.round(process.memoryUsage().rss / 1048576);
  const startMb = mb();
  let peakMb = startMb;
  const timer = setInterval(() => { peakMb = Math.max(peakMb, mb()); }, intervalMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
      peakMb = Math.max(peakMb, mb());
      return { startMb, peakMb };
    },
  };
}
