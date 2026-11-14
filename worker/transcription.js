// EKP E11.3 / E11.7 (Workstream E, E-10, E-11): the worker's media jobs.
//
//   transcribe  A recording with no transcript: stream it to disk, extract
//               the audio, cut it at silences, transcribe each piece, store
//               the timed chunks on the recording, then the normal embed →
//               summarize → cluster stages. Automatic when the org's
//               `media.transcription.auto` is on (the default), after
//               a wait (10 min from SharePoint, 1 min for an upload:
//               autoTranscribeDelaySeconds) so a transcript that arrives
//               with the recording is used instead; or on request from the
//               document page. One recording at a time per org. Never retried
//               by SQS (a failed job is marked failed and can be retried from
//               the page), so a provider error can't run up cost.
//   segment     Chapters from the recording's transcript (src/lib/chapters.js).
//
// Every job writes a MediaJob row: status, progress, provider, minutes, cost.

import { createReadStream } from "node:fs";
import { join } from "node:path";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { withTempDir, streamToFile, probeMedia, extractAudio, detectSilences, cutPiece, watchMemory, MediaToolsUnavailable } from "./media.js";
import { getOpenAIForDocument } from "./openai.js";
import { getSetting } from "../src/lib/settings/index.js";
import { fileExtension, isMediaFile } from "../src/lib/fileFormats.js";
import { chunkTranscript, transcriptText, transcriptLines, timeOf } from "../src/lib/transcripts.js";
import {
  AUDIO_ARGS, DEFAULT_PROVIDER, TRANSCRIPTION_PROVIDERS, parseSilences, planPieces, segmentsToCues, transcriptionCost,
} from "../src/lib/transcription.js";
import {
  autoTranscribeDelaySeconds, ACTIVE_JOB_STATUSES, hasLinkedTranscript, dropGeneratedTranscript, generatedChunkCount,
} from "../src/lib/generatedTranscript.js";
import { CHAPTER_INSTRUCTIONS, MIN_CHAPTER_RECORDING_SECONDS, chapterInput, parseChapters } from "../src/lib/chapters.js";

/** A job running longer than this is taken as stuck (worker restarted mid-way) and doesn't block the org. */
const STUCK_AFTER_MS = 4 * 3600 * 1000;
const BUSY_RETRY_SECONDS = 120;

const friendly = (err) => {
  const m = String(err?.message || err);
  if (m === "OPENAI_KEY_MISSING") return "No OpenAI API key is set for this organization";
  if (err?.status === 401) return "The organization's OpenAI API key was refused";
  if (err?.status === 429) return "OpenAI's rate limit or quota was reached; try again later";
  return m.slice(0, 500);
};

export function createMediaJobs({ prisma, sqs, queueUrl, openDocumentStream }) {
  const send = (body, delaySeconds = 0) =>
    sqs.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(body),
      ...(delaySeconds ? { DelaySeconds: Math.min(900, delaySeconds) } : {}),
    }));

  /**
   * Queue a transcription (a MediaJob row, then the SQS message). `auto`:
   * started by KMS, waits autoTranscribeDelaySeconds(doc) and is dropped if a
   * transcript arrives or the setting is turned off meanwhile.
   */
  async function queueTranscription(doc, { auto }) {
    const job = await prisma.mediaJob.create({
      data: { orgId: doc.orgId, documentId: doc.id, kind: "transcribe", status: "queued", provider: DEFAULT_PROVIDER },
    });
    await send({ type: "transcribe", docId: doc.id, jobId: job.id, auto }, auto ? autoTranscribeDelaySeconds(doc) : 0);
    return job;
  }

  /** After a recording is probed: transcribe it automatically when it has no transcript and the org allows it. */
  async function maybeAutoTranscribe(doc) {
    if (!doc.orgId || !isMediaFile(doc.filename)) return null;
    if (await hasLinkedTranscript(prisma, doc.id)) return null;
    if ((await generatedChunkCount(prisma, doc.id)) > 0) return null;
    if (!(await getSetting(doc.orgId, "media.transcription.auto"))) return null;
    const active = await prisma.mediaJob.count({ where: { documentId: doc.id, kind: "transcribe", status: { in: ACTIVE_JOB_STATUSES } } });
    if (active) return null;
    const job = await queueTranscription(doc, { auto: true });
    console.log(`🎙️ ${doc.filename}: no transcript; transcription queued (starts in ${autoTranscribeDelaySeconds(doc) / 60} min unless a transcript arrives)`);
    return job;
  }

  async function queueChapters(recordingId) {
    await send({ type: "segment", docId: recordingId });
  }

  const finish = (id, data) => prisma.mediaJob.update({ where: { id }, data: { finishedAt: new Date(), ...data } });

  async function processTranscribeJob({ docId, jobId, auto = false }) {
    const job = jobId ? await prisma.mediaJob.findUnique({ where: { id: jobId } }) : null;
    if (!job || job.status !== "queued") return; // already handled (a duplicate message)
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc || doc.deletedAt || !isMediaFile(doc.filename)) {
      await finish(job.id, { status: "cancelled", error: "The recording was removed" });
      return;
    }
    if (await hasLinkedTranscript(prisma, docId)) {
      await finish(job.id, { status: "cancelled", error: "A transcript was linked; KMS uses it instead" });
      console.log(`🎙️ ${doc.filename}: a transcript arrived, transcription not needed`);
      return;
    }
    if (auto && !(await getSetting(doc.orgId, "media.transcription.auto"))) {
      await finish(job.id, { status: "cancelled", error: "Automatic transcription was turned off" });
      return;
    }
    const busy = await prisma.mediaJob.count({
      where: { orgId: doc.orgId, kind: "transcribe", status: "running", id: { not: job.id }, startedAt: { gt: new Date(Date.now() - STUCK_AFTER_MS) } },
    });
    if (busy) {
      await send({ type: "transcribe", docId, jobId, auto }, BUSY_RETRY_SECONDS);
      console.log(`🎙️ ${doc.filename}: another recording of this org is being transcribed; waiting ${BUSY_RETRY_SECONDS} s`);
      return;
    }

    const provider = DEFAULT_PROVIDER;
    const { model } = TRANSCRIPTION_PROVIDERS[provider];
    await prisma.mediaJob.update({ where: { id: job.id }, data: { status: "running", startedAt: new Date(), attempts: { increment: 1 }, progress: 0, provider, error: null } });
    const statusBefore = doc.status;
    await prisma.document.update({ where: { id: docId }, data: { status: "transcribing" } });
    const progress = (p) => prisma.mediaJob.update({ where: { id: job.id }, data: { progress: Math.round(p) } }).catch(() => {});
    const memory = watchMemory();
    const started = Date.now();
    let cues = [];
    let audioSeconds = 0;
    let language = null;
    try {
      const openai = await getOpenAIForDocument(docId);
      await withTempDir(async (dir) => {
        const source = join(dir, `source${fileExtension(doc.filename) || ".media"}`);
        const { body, bytes } = await openDocumentStream(doc);
        await streamToFile(body, source, { bytes });
        const audio = join(dir, "audio.mp3");
        const audioBytes = await extractAudio(source, audio, AUDIO_ARGS);
        audioSeconds = (await probeMedia(audio)).durationSeconds || doc.durationSeconds || 0;
        if (!audioSeconds) throw new Error("The recording has no audio KMS can read");
        const pieces = planPieces(audioSeconds, parseSilences(await detectSilences(audio)));
        console.log(`🎙️ ${doc.filename}: ${(audioBytes / 1048576).toFixed(1)} MB of audio, ${Math.round(audioSeconds)} s, ${pieces.length} piece(s)`);
        await progress(10);
        for (const [i, piece] of pieces.entries()) {
          const path = join(dir, `piece-${i}.mp3`);
          await cutPiece(audio, path, piece.start, piece.end);
          const res = await openai.audio.transcriptions.create({
            file: createReadStream(path),
            model,
            response_format: "verbose_json",
            timestamp_granularities: ["segment"],
          });
          language ||= res.language || null;
          cues.push(...segmentsToCues(res.segments, piece.start));
          await progress(10 + (85 * (i + 1)) / pieces.length);
        }
      });
    } catch (err) {
      const { peakMb } = memory.stop();
      const message = err instanceof MediaToolsUnavailable ? err.message : friendly(err);
      console.error(`⚠️ Transcription of ${doc.filename} failed: ${message} (peak memory ${peakMb} MB)`);
      await finish(job.id, { status: "failed", error: message, audioSeconds: audioSeconds || null });
      await prisma.document.update({ where: { id: docId }, data: { status: statusBefore === "transcribing" ? "ready" : statusBefore || "ready" } });
      return;
    }
    const { startMb, peakMb } = memory.stop();
    const costUsd = transcriptionCost(audioSeconds, provider);
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`🎙️ ${doc.filename}: transcribed ${Math.round(audioSeconds / 60)} min (${language || "language ?"}) in ${seconds} s, ${cues.length} segments, ≈ $${costUsd}; memory ${startMb} → peak ${peakMb} MB`);

    // A transcript linked meanwhile wins (decided 2026-11-13).
    if (await hasLinkedTranscript(prisma, docId)) {
      await finish(job.id, { status: "cancelled", progress: 100, audioSeconds, costUsd, error: "A transcript was linked while transcribing; KMS uses it instead" });
      await prisma.document.update({ where: { id: docId }, data: { status: "ready" } });
      return;
    }
    if (!cues.length) {
      await finish(job.id, { status: "done", progress: 100, audioSeconds, costUsd, error: "No speech was found in the recording" });
      await prisma.document.update({ where: { id: docId }, data: { status: "ready" } });
      return;
    }

    const chunks = chunkTranscript(cues);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${docId}))`;
      await tx.chunk.deleteMany({ where: { documentId: docId } });
      await tx.chunk.createMany({
        data: chunks.map((c, i) => ({ documentId: docId, chunkIndex: i, text: c.text, metadata: { ...c.metadata, generated: true, ...(language ? { language } : {}) } })),
      });
      await tx.document.update({ where: { id: docId }, data: { content: transcriptText(chunks), summary: null, status: "chunked" } });
    }, { timeout: 60_000 });
    await finish(job.id, { status: "done", progress: 100, audioSeconds, costUsd });
    await send({ type: "embed", docId, filename: doc.filename, projectId: doc.projectId });
    await queueChapters(docId);
  }

  /** The timed lines chapters are made from: KMS's own transcript, else the longest linked one. */
  async function chapterLines(recordingId) {
    const own = await prisma.chunk.findMany({ where: { documentId: recordingId }, orderBy: { chunkIndex: "asc" }, select: { text: true, metadata: true } });
    let chunks = own;
    if (!own.length) {
      const transcripts = await prisma.document.findMany({
        where: { transcriptOfId: recordingId, deletedAt: null },
        select: { chunks: { orderBy: { chunkIndex: "asc" }, select: { text: true, metadata: true } } },
      });
      chunks = transcripts.map((t) => t.chunks.filter((c) => timeOf(c))).sort((a, b) => b.length - a.length)[0] || [];
    }
    return transcriptLines(chunks.filter((c) => timeOf(c)).map((c) => ({ start: c.metadata.start, speakers: c.metadata.speakers, text: c.text })));
  }

  async function processSegmentJob({ docId }) {
    const doc = await prisma.document.findUnique({ where: { id: docId }, select: { id: true, orgId: true, filename: true, durationSeconds: true, deletedAt: true, mediaSegments: true } });
    if (!doc || doc.deletedAt || !isMediaFile(doc.filename)) return;
    const lines = await chapterLines(docId);
    const duration = doc.durationSeconds || (lines.length ? lines[lines.length - 1].start : 0);
    if (!lines.length || duration < MIN_CHAPTER_RECORDING_SECONDS) {
      if (doc.mediaSegments != null) await prisma.document.update({ where: { id: docId }, data: { mediaSegments: null } });
      return;
    }
    const job = await prisma.mediaJob.create({ data: { orgId: doc.orgId, documentId: docId, kind: "segment", status: "running", startedAt: new Date(), attempts: 1 } });
    try {
      const openai = await getOpenAIForDocument(docId);
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CHAPTER_INSTRUCTIONS },
          { role: "user", content: `Recording: ${doc.filename} (${Math.round(duration / 60)} min)\n\n${chapterInput(lines)}` },
        ],
      });
      const chapters = parseChapters(res.choices?.[0]?.message?.content, { duration, firstStart: lines[0].start });
      await prisma.document.update({ where: { id: docId }, data: { mediaSegments: chapters.length ? chapters : null } });
      await finish(job.id, { status: "done", progress: 100, ...(chapters.length ? {} : { error: "The model returned no usable chapters" }) });
      console.log(`📑 ${doc.filename}: ${chapters.length} chapter(s)`);
    } catch (err) {
      await finish(job.id, { status: "failed", error: friendly(err) });
      console.error(`⚠️ Chapters for ${doc.filename} failed: ${friendly(err)}`);
    }
  }

  /**
   * After transcript links change: a recording that now has a provided
   * transcript drops KMS's own (decided 2026-11-13), and every recording
   * whose transcript changed gets its chapters made again.
   */
  async function afterLinkChange(recordingIds) {
    for (const id of new Set(recordingIds.filter(Boolean))) {
      if (await hasLinkedTranscript(prisma, id)) {
        const dropped = await dropGeneratedTranscript(prisma, id);
        if (dropped) console.log(`🎙️ Recording ${id}: a provided transcript replaces KMS's own (${dropped} chunks removed)`);
      }
      await queueChapters(id);
    }
  }

  return { queueTranscription, maybeAutoTranscribe, processTranscribeJob, processSegmentJob, afterLinkChange };
}
