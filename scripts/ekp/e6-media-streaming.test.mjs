// EKP E11.6 (Workstream E, E-6): recordings are streamed to a temp file and
// probed with ffprobe; memory stays flat; the format list and the sync accept
// recordings whatever their size.
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { withTempDir, streamToFile, probeMedia, watchMemory, toNodeReadable } from "../../worker/media.js";
import { checkFileFormat, isMediaFile, mediaKind } from "../../src/lib/fileFormats.js";
import { firstMissingStage } from "../../src/lib/documentPipeline.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const hasFfmpeg = (() => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

test("recordings are accepted formats", () => {
  for (const name of ["Weekly sync.mp4", "TOWN HALL.MOV", "call.m4a", "memo.mp3", "dictation.wav"]) {
    assert.equal(checkFileFormat(name).ok, true, name);
  }
  assert.equal(mediaKind("a.MP4"), "video");
  assert.equal(mediaKind("a.mp3"), "audio");
  assert.equal(isMediaFile("a.vtt"), false);
  assert.equal(checkFileFormat("clip.avi").ok, false);
});

test("a recording needs no pipeline stage (its text is its transcript's)", () => {
  const state = { textChunks: 0, embedded: 0, hasSummary: false, topics: 0 };
  assert.equal(firstMissingStage({ filename: "Weekly sync.mp4", filePath: "k", projectId: "p" }, state), null);
  assert.equal(firstMissingStage({ filename: "Weekly sync.vtt", filePath: "k" }, state), "chunk");
});

test("streamToFile writes a web or Node stream to disk and temp dirs are removed", async () => {
  let kept;
  const bytes = await withTempDir(async (dir) => {
    kept = dir;
    const a = await streamToFile(new Response("hello world").body, join(dir, "a"));
    const b = await streamToFile(Readable.from([Buffer.from("abc")]), join(dir, "b"));
    return a + b;
  });
  assert.equal(bytes, 14);
  assert.equal(existsSync(kept), false);
  await assert.rejects(withTempDir(async (dir) => { kept = dir; throw new Error("boom"); }), /boom/);
  assert.equal(existsSync(kept), false, "removed after a failure too");
  assert.throws(() => toNodeReadable(null), /No content/);
});

test("streaming 512 MB to disk keeps memory flat", async () => {
  const MB = 1024 * 1024;
  const block = Buffer.alloc(MB, 7);
  let sent = 0;
  const source = new Readable({
    read() {
      if (sent >= 512) return this.push(null);
      sent++;
      this.push(block);
    },
  });
  const memory = watchMemory(50);
  const bytes = await withTempDir((dir) => streamToFile(source, join(dir, "big.bin")));
  const { startMb, peakMb } = memory.stop();
  assert.equal(bytes, 512 * MB);
  assert.ok(peakMb - startMb < 128, `memory grew ${peakMb - startMb} MB for a 512 MB file`);
});

test("ffprobe reads a recording's length and kind", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  await withTempDir(async (dir) => {
    const video = join(dir, "clip.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=3",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-shortest", "-pix_fmt", "yuv420p", video]);
    const v = await probeMedia(video);
    assert.ok(Math.abs(v.durationSeconds - 3) < 0.3, String(v.durationSeconds));
    assert.equal(v.hasVideo, true);
    assert.equal(v.hasAudio, true);

    const audio = join(dir, "clip.mp3");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", audio]);
    const a = await probeMedia(audio);
    assert.equal(a.hasVideo, false);
    assert.equal(a.hasAudio, true);

    const junk = join(dir, "junk.mp4");
    await streamToFile(Readable.from([Buffer.from("not a video")]), junk);
    await assert.rejects(probeMedia(junk), /^Error: ffprobe couldn't read the file/);
  });
});

test("the worker streams recordings and lets them past the A-24 size limit", () => {
  const worker = read("worker/index.js");
  assert.match(worker, /if \(isMediaFile\(filename\)\) return processRecording\(existingDoc, s3Key, filename\);/);
  assert.match(worker, /const overLimit = !isRecording && exceedsSizeLimit\(change\.size, integration\.scopeConfig\);/);
  assert.match(worker, /new Upload\(\{/, "SharePoint copies are streamed to S3 in parts");
  assert.match(worker, /const startCursor = site\.mediaListedAt \? site\.lastSyncCursor : null;/, "one full listing picks up skipped media");
  assert.match(worker, /mediaListedAt: s\.mediaListedAt \|\| new Date\(\)\.toISOString\(\)/);
  assert.match(worker, /worker memory \$\{startMb\} MB → peak \$\{peakMb\} MB/);
});
