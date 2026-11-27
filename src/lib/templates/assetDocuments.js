// EKP E14.2 / E14.3 (E-16): knowledge assets written in KMS from a template.
// An asset is a repository Document (contentType "asset", no file) that the
// worker reads from its `content` (worker/index.js, like a SharePoint page),
// so it is chunked, embedded, summarized and searched like any document. It
// starts as a draft and goes through the publishing workflow (E22) like an
// upload under a workflow: the author submits it, a reviewer publishes it.
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { ASSET_CONTENT_TYPE, assetData, renderAssetText } from "./assetTemplates.js";

let sqs;

/** Queues the worker's chunk job (it reads an asset's text from the document). */
export async function queueAssetProcessing(doc, userId) {
  sqs ??= new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      type: "chunk",
      docId: doc.id,
      s3Key: null,
      filename: doc.filename,
      projectId: null,
      userId,
      orgId: doc.orgId,
      visibility: doc.visibility || "private",
      regenerate: false,
    }),
  }));
}

/** The Document fields an asset's text and sections set (create and edit). */
export function assetDocumentFields(version, data, templateName) {
  return {
    filename: data.title,
    content: renderAssetText(version, data, templateName),
    assetData: assetData(data.sections),
    contentType: ASSET_CONTENT_TYPE,
    category: data.category,
    status: "queued",
    classificationStatus: "pending_classification",
    contentUpdatedAt: new Date(),
  };
}

/** Whether the asset can still be edited (drafts only; published content changes through a new draft). */
export const isEditableAsset = (doc) => doc?.contentType === ASSET_CONTENT_TYPE && !doc.deletedAt && doc.lifecycle === "draft";
