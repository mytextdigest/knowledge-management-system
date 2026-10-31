// EKP A-17: one ServiceNow sync run (Sync Now or the servicenow.sync job).
// For each mapped knowledge base: list articles changed since its cursor,
// bring new and changed published ones in as documents of the mapped
// department (new ones as drafts for Needs Review, like SharePoint), and
// retire documents whose article is no longer published. Each knowledge
// base's cursor is saved as soon as it's done.
//
// Imported by the worker, so relative imports only.

import { ServiceNowConnector, serviceNowConnection } from "./servicenow.js";

const MIN_ARTICLE_TEXT = 50; // same floor as processChunkJob

async function syncOneArticle(db, { change, integration, kb, enqueueChunk }) {
  const orgId = integration.orgId;
  const connectedByUserId = integration.scopeConfig.connectedByUserId;
  const existing = await db.document.findFirst({
    where: { orgId, sourceProvider: "servicenow", externalId: change.externalId },
    select: { id: true, externalModifiedAt: true, departmentId: true, lifecycle: true },
  });

  if (change.deleted) {
    if (!existing || existing.lifecycle === "retired") return { skipped: true };
    await db.document.update({ where: { id: existing.id }, data: { lifecycle: "retired" } });
    return { retired: true };
  }

  const modifiedAt = new Date(change.modifiedAt);
  if (existing?.externalModifiedAt?.getTime() === modifiedAt.getTime() && existing.lifecycle !== "retired") {
    // Unchanged, but the knowledge base may have been mapped to another department.
    if (existing.departmentId !== kb.departmentId) {
      await db.document.update({ where: { id: existing.id }, data: { departmentId: kb.departmentId } });
    }
    return { skipped: true };
  }
  if (change.content.length < MIN_ARTICLE_TEXT && !existing) return { skipped: true };

  const subscription = await db.subscription.findUnique({ where: { orgId } });
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    throw new Error("No active subscription for org");
  }

  const data = {
    filename: change.name,
    content: change.content,
    contentType: "article",
    filePath: null,
    status: "queued",
    externalModifiedAt: modifiedAt,
    externalUrl: change.webUrl,
    departmentId: kb.departmentId,
    // Published again after being retired: back through Needs Review.
    ...(existing?.lifecycle === "retired" ? { lifecycle: "draft" } : {}),
  };
  const doc = existing
    ? await db.document.update({ where: { id: existing.id }, data })
    : await db.document.create({
        data: {
          ...data,
          visibility: "private",
          scope: "repository",
          lifecycle: "draft", // waits for a super admin in Needs Review, like SharePoint files
          sourceProvider: "servicenow",
          externalId: change.externalId,
          orgId,
          userId: connectedByUserId,
        },
      });
  await enqueueChunk({ doc, s3Key: null, filename: change.name, connectedByUserId, orgId });
  return { skipped: false };
}

/**
 * Sync every mapped knowledge base. Returns { found, failed, retired }.
 * `connectorFor(kb)` is for tests; by default the stored credentials are used.
 */
export async function syncServiceNow(db, { integration, enqueueChunk, connectorFor }) {
  if (!integration.scopeConfig?.connectedByUserId) throw new Error("scopeConfig.connectedByUserId is missing");
  const connection = connectorFor ? null : serviceNowConnection(integration);
  const makeConnector = connectorFor || ((kb) => new ServiceNowConnector({ ...connection, kbId: kb.kbId }));

  const stats = { found: 0, failed: 0, retired: 0 };
  let scopeConfig = integration.scopeConfig;
  for (const kb of scopeConfig.knowledgeBases || []) {
    let changes;
    let cursor;
    try {
      ({ changes, cursor } = await makeConnector(kb).listChanges(kb.cursor));
    } catch (err) {
      console.error(`❌ Couldn't list articles of knowledge base "${kb.title}":`, err.message);
      stats.failed++;
      continue; // keep going with the next knowledge base
    }

    let failedHere = 0;
    for (const change of changes) {
      try {
        const result = await syncOneArticle(db, { change, integration: { ...integration, scopeConfig }, kb, enqueueChunk });
        if (result.retired) stats.retired++;
        else if (!result.skipped) stats.found++;
      } catch (err) {
        console.error(`❌ Failed to sync article "${change.name}" (${change.externalId}):`, err.message);
        failedHere++;
      }
    }
    stats.failed += failedHere;

    // A failed article must be retried next run, so the cursor only moves on
    // when every article of this knowledge base went through.
    scopeConfig = {
      ...scopeConfig,
      knowledgeBases: scopeConfig.knowledgeBases.map((k) => (k.kbId === kb.kbId && !failedHere ? { ...k, cursor } : k)),
    };
    await db.orgIntegration.update({ where: { id: integration.id }, data: { scopeConfig } });
  }
  return stats;
}
