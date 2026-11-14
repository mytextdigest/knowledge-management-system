// EKP E11.6 (Workstream E, E-6): recordings are never held in memory. The
// file is streamed from S3 or SharePoint to a temp file, and ffmpeg/ffprobe
// read it from disk. Worker memory stays flat whatever the file's size (an
// 8 GB video, NYPA Q&A #188). Temp files are always removed. The disk is
// checked before a download (a file that doesn't fit isn't started), and
// folders left by a worker that was killed mid-job are removed at start.
//
// The worker host needs ffmpeg (`sudo apt-get install -y ffmpeg`).

import { createWriteStream } from "node:fs";
import { mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** ffmpeg/ffprobe is missing on this host. */
export class MediaToolsUnavailable extends Error {}

/** The worker's disk hasn't room for the file. Retrying won't help until space is freed. */
export class NotEnoughDiskSpace extends Error {}

/** Room kept free beyond the file itself: the extracted audio (~14 MB an hour), its pieces, logs. */
export const DISK_HEADROOM_BYTES = 512 * 1024 * 1024;

const TEMP_PREFIX = "kms-media-";

const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/**
 * Throws NotEnoughDiskSpace when `bytes` (plus DISK_HEADROOM_BYTES) won't fit
 * in `dir`'s file system. An unknown size (0, null) isn't checked.
 */
export async function ensureDiskSpace(dir, bytes, { freeBytes } = {}) {
  if (!(bytes > 0)) return;
  let free = freeBytes;
  if (free == null) {
    const fs = await statfs(dir);
    free = Number(fs.bavail) * Number(fs.bsize);
  }
  const need = bytes + DISK_HEADROOM_BYTES;
  if (free < need) {
    throw new NotEnoughDiskSpace(`Not enough disk space on the worker for this recording: it needs ${gb(need)}, ${gb(free)} is free`);
  }
}

/** Is process `pid` still running on this host? */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, owned by another user
  }
}

/**
 * Removes temp folders left by a worker that was killed mid-job (the
 * `finally` in withTempDir never ran). A folder is named with its worker's
 * pid, so a folder of another worker still running on this host is kept.
 * Returns the names removed.
 */
export async function removeStaleTempDirs(root = tmpdir()) {
  const removed = [];
  let names = [];
  try {
    names = await readdir(root);
  } catch {
    return removed;
  }
  for (const name of names) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const pid = Number(/^kms-media-(\d+)-/.exec(name)?.[1]);
    if (pid === process.pid || (pid && isRunning(pid))) continue;
    if (!pid) {
      // Named before the pid was added: remove it once it's an hour old.
      const info = await stat(join(root, name)).catch(() => null);
      if (!info || Date.now() - info.mtimeMs < 3600_000) continue;
    }
    await rm(join(root, name), { recursive: true, force: true }).catch(() => {});
    removed.push(name);
  }
  return removed;
}

/** A web ReadableStream (fetch) or a Node stream, as a Node Readable. */
export function toNodeReadable(body) {
  if (!body) throw new Error("No content to read");
  return typeof body.getReader === "function" ? Readable.fromWeb(body) : body;
}

/**
 * Runs fn(dir) with a fresh temp directory, removed afterwards whatever happens.
 */
export async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), `${TEMP_PREFIX}${process.pid}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Streams `body` to `path`; returns the bytes written. With `bytes` (the
 * file's size, when the source tells it), checks the disk first and throws
 * NotEnoughDiskSpace before downloading anything.
 */
export async function streamToFile(body, path, { bytes } = {}) {
  try {
    await ensureDiskSpace(dirname(path), bytes);
  } catch (err) {
    body?.destroy?.(); // don't leave the S3 or SharePoint connection open
    if (typeof body?.cancel === "function") await body.cancel().catch(() => {});
    throw err;
  }
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

// EKP E11.3 (E-10): audio for transcription.

async function ffmpeg(args, timeout) {
  try {
    return await run("ffmpeg", ["-hide_banner", "-nostdin", ...args], { timeout, maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    if (err.code === "ENOENT") throw new MediaToolsUnavailable("ffmpeg isn't installed on this worker (apt-get install ffmpeg)");
    throw new Error(`ffmpeg failed: ${String(err.stderr || err.message).trim().split("\n").slice(-3).join(" ").slice(0, 300)}`);
  }
}

/** The recording's audio track as a small MP3 (`audioArgs` from src/lib/transcription.js). */
export async function extractAudio(source, target, audioArgs) {
  await ffmpeg(["-y", "-i", source, ...audioArgs, target], 60 * 60_000);
  return (await stat(target)).size;
}

/** ffmpeg's silencedetect log for a file (parse with parseSilences). */
export async function detectSilences(path) {
  const { stderr } = await ffmpeg(["-i", path, "-af", "silencedetect=noise=-35dB:d=0.4", "-f", "null", "-"], 30 * 60_000);
  return stderr;
}

/** Copies seconds `start`–`end` of an MP3 into its own file. */
export async function cutPiece(source, target, start, end) {
  // -ss before -i seeks the input; -t is the piece's length.
  await ffmpeg(["-y", "-ss", String(start), "-i", source, "-t", String(Math.max(0, end - start)), "-c", "copy", target], 10 * 60_000);
  return (await stat(target)).size;
}
