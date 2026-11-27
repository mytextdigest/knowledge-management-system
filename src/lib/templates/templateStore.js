// EKP E14 (E-16): reading and writing asset templates (rules in
// ./assetTemplates.js). Every function takes the Prisma client.
import { versionChanged } from "./assetTemplates.js";

const LATEST = { orderBy: { version: "desc" }, take: 1 };

/** A template with its latest version, as the API returns it. */
export function serializeTemplate(t, { usage = null } = {}) {
  const latest = t.versions?.[0] || null;
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    version: latest?.version ?? 0,
    versionId: latest?.id ?? null,
    sections: latest?.sections ?? [],
    requiredFields: latest?.requiredFields ?? [],
    updatedAt: (latest?.createdAt || t.updatedAt)?.toISOString?.() ?? null,
    ...(usage != null ? { assetCount: usage } : {}),
  };
}

/** The org's templates (active only, unless `all`), each with its latest version. */
export async function listTemplates(db, orgId, { all = false } = {}) {
  const templates = await db.assetTemplate.findMany({
    where: { orgId, ...(all ? {} : { status: "active" }) },
    include: { versions: LATEST },
    orderBy: { name: "asc" },
  });
  if (!all) return templates.map((t) => serializeTemplate(t));
  // Admins see how many assets each template has (across its versions).
  const counts = await db.document.groupBy({
    by: ["templateVersionId"],
    where: { orgId, deletedAt: null, templateVersionId: { not: null } },
    _count: { _all: true },
  });
  const byVersion = new Map(counts.map((c) => [c.templateVersionId, c._count._all]));
  const versions = await db.assetTemplateVersion.findMany({
    where: { templateId: { in: templates.map((t) => t.id) } },
    select: { id: true, templateId: true },
  });
  const usage = new Map();
  for (const v of versions) usage.set(v.templateId, (usage.get(v.templateId) || 0) + (byVersion.get(v.id) || 0));
  return templates.map((t) => serializeTemplate(t, { usage: usage.get(t.id) || 0 }));
}

export function getTemplate(db, orgId, templateId) {
  return db.assetTemplate.findFirst({ where: { id: templateId, orgId }, include: { versions: LATEST } });
}

/** Creates a template with version 1. Throws { code: "P2002" } on a duplicate name. */
export function createTemplate(db, orgId, userId, data) {
  return db.assetTemplate.create({
    data: {
      orgId,
      name: data.name,
      createdById: userId,
      versions: { create: { version: 1, sections: data.sections, requiredFields: data.requiredFields, createdById: userId } },
    },
    include: { versions: LATEST },
  });
}

/**
 * Saves an edit: a rename changes the template; changed sections or required
 * fields make a new version (assets keep theirs). Returns
 * { template, newVersion: boolean }.
 */
export async function updateTemplate(db, template, userId, data) {
  const latest = template.versions?.[0];
  const newVersion = versionChanged(latest, data);
  // Inside a caller's transaction (tests) there is no nested $transaction.
  const run = typeof db.$transaction === "function" ? (fn) => db.$transaction(fn) : (fn) => fn(db);
  return run(async (tx) => {
    if (data.name !== template.name) await tx.assetTemplate.update({ where: { id: template.id }, data: { name: data.name } });
    if (newVersion) {
      await tx.assetTemplateVersion.create({
        data: {
          templateId: template.id,
          version: (latest?.version || 0) + 1,
          sections: data.sections,
          requiredFields: data.requiredFields,
          createdById: userId,
        },
      });
    }
    const fresh = await tx.assetTemplate.findUnique({ where: { id: template.id }, include: { versions: LATEST } });
    return { template: fresh, newVersion };
  });
}
