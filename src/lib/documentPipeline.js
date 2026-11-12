// Which stage of the worker pipeline a document still needs, judged by what
// each stage leaves behind (not by `status`, which can say "ready" for a
// document whose processing stopped part-way):
//
//   chunk      → Chunk rows with text            (needs the file, a SharePoint
//                                                 source, or a page's text)
//   embed      → a search vector on every chunk  (Chunk.embedding_vec)
//   summarize  → Document.summary (the same job classifies, extracts entities,
//                decisions and lessons, and checks conflicts and duplicates)
//   cluster    → a topic for project documents   (TopicDocument)
//
// The worker's `repair` job runs the first missing stage; each stage then
// queues the next as in normal processing, so everything after it is redone
// too. Shared by the worker and the API, so relative imports only.
//
// A recording (E11.6) has no stages: it is probed for its length and is
// ready. Its text comes from its transcript, which is its own document.

import { isMediaFile } from "./fileFormats.js";

export const PIPELINE_STAGES = ["chunk", "embed", "summarize", "cluster"];

export const STAGE_LABELS = {
  chunk: "text extraction",
  embed: "search index",
  summarize: "summary",
  cluster: "topic",
  unrepairable: "text (the original file isn't available)",
};

/** Whether the worker can read the document's content again (for the chunk stage). */
export function canReadSource(doc) {
  if (!doc) return false;
  if (doc.contentType === "page" || doc.contentType === "article") return Boolean(doc.content);
  if (doc.filePath) return true;
  return doc.sourceProvider === "sharepoint" && Boolean(doc.externalUrl && doc.externalId && doc.orgId);
}

/** What the pipeline has produced for one document. */
export async function pipelineState(db, doc) {
  const [row] = await db.$queryRaw`
    SELECT
      count(*) FILTER (WHERE coalesce(btrim(text), '') <> '')::int AS "textChunks",
      count(*) FILTER (WHERE coalesce(btrim(text), '') <> '' AND embedding_vec IS NOT NULL)::int AS embedded
    FROM "Chunk"
    WHERE document_id = ${doc.id}`;
  const topics = doc.projectId ? await db.topicDocument.count({ where: { documentId: doc.id } }) : null;
  return {
    textChunks: row?.textChunks ?? 0,
    embedded: row?.embedded ?? 0,
    hasSummary: Boolean(doc.summary),
    topics,
  };
}

/**
 * The first stage the document still needs: "chunk" | "embed" | "summarize" |
 * "cluster", null when nothing is missing, or "unrepairable" when there is
 * no text and nothing to read it from.
 */
export function firstMissingStage(doc, state) {
  if (isMediaFile(doc.filename)) return null;
  if (state.textChunks === 0) return canReadSource(doc) ? "chunk" : "unrepairable";
  if (state.embedded < state.textChunks) return "embed";
  if (!state.hasSummary) return "summarize";
  if (doc.projectId && state.topics === 0) return "cluster";
  return null;
}
