import crypto from "node:crypto";

export const CATEGORY_TAXONOMY = [
  "Policies",
  "SOPs",
  "Reports",
  "Meeting Knowledge",
  "Product Knowledge",
  "Historical Documents",
  "Other",
];

export const DEFAULT_CATEGORY_THRESHOLD = Number(
  process.env.CLASSIFICATION_CATEGORY_THRESHOLD || 0.72
);
export const DEFAULT_DEPARTMENT_THRESHOLD = Number(
  process.env.CLASSIFICATION_DEPARTMENT_THRESHOLD || 0.78
);
export const DEFAULT_DUPLICATE_THRESHOLD = Number(
  process.env.CLASSIFICATION_DUPLICATE_THRESHOLD || 0.92
);

function clamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function computeContentHash(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : null;
}

export function averageEmbeddings(vectors) {
  const valid = vectors.filter(
    (v) => Array.isArray(v) && v.length > 0 && v.every((x) => Number.isFinite(Number(x)))
  );
  if (!valid.length) return null;
  const size = valid[0].length;
  const sameSize = valid.filter((v) => v.length === size);
  if (!sameSize.length) return null;
  const avg = Array(size).fill(0);
  for (const vector of sameSize) {
    for (let i = 0; i < size; i += 1) avg[i] += Number(vector[i]);
  }
  return avg.map((n) => n / sameSize.length);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function isClassificationRelevant(document) {
  if (!document) return false;
  if (document.scope === "repository" && document.orgId) return true;
  if (document.scope === "project" && document.project?.scope === "org" && document.project?.orgId) return true;
  return false;
}

export async function classifyDocument({ prisma, openai, documentId, filename, text, summary }) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      orgId: true,
      userId: true,
      departmentId: true,
      category: true,
      scope: true,
      project: { select: { scope: true, orgId: true } },
    },
  });
  if (!document) throw new Error(`Document ${documentId} not found`);

  // Rank 4 is repository intelligence. Private documents and project documents
  // that have not been promoted to org scope are intentionally skipped so we
  // do not spend an LLM call on content that cannot appear in the Repository.
  if (!isClassificationRelevant(document)) {
    return { skipped: true, reason: "document_not_repository_relevant" };
  }

  const effectiveOrgId = document.orgId || document.project?.orgId;
  const departments = effectiveOrgId
    ? await prisma.department.findMany({
        where: { orgId: effectiveOrgId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const memberships = departments.length
    ? await prisma.departmentMember.findMany({
        where: { userId: document.userId, departmentId: { in: departments.map((d) => d.id) } },
        select: { departmentId: true },
      })
    : [];
  const memberDepartmentIds = new Set(memberships.map((m) => m.departmentId));

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 350,
    messages: [
      {
        role: "system",
        content:
          "Classify enterprise documents. Return only valid JSON. Never invent department IDs. Confidence must be between 0 and 1.",
      },
      {
        role: "user",
        content: `Classify this document using exactly one category from:\n${CATEGORY_TAXONOMY.join(", ")}\n\nAlso suggest one department only when strongly supported. The uploader belongs to department IDs: ${[...memberDepartmentIds].join(", ") || "none"}. Available departments: ${JSON.stringify(departments)}.\n\nReturn exactly:\n{"category":"one taxonomy value","categoryConfidence":0.0,"suggestedDepartmentId":"available id or null","departmentConfidence":0.0,"reason":"brief reason"}\n\nFilename: ${filename || "Unknown"}\nSummary: ${String(summary || "").slice(0, 6000)}\nContent sample: ${String(text || "").slice(0, 10000)}`,
      },
    ],
  });

  const parsed = parseJson(completion.choices?.[0]?.message?.content || "{}");
  const category = CATEGORY_TAXONOMY.includes(parsed.category) ? parsed.category : "Other";
  const categoryConfidence = clamp(parsed.categoryConfidence);
  const requestedDepartment = departments.find((d) => d.id === parsed.suggestedDepartmentId);
  let departmentConfidence = clamp(parsed.departmentConfidence);

  // Uploader membership is a useful prior but never enough to force a department.
  if (requestedDepartment && memberDepartmentIds.has(requestedDepartment.id)) {
    departmentConfidence = Math.min(1, departmentConfidence + 0.05);
  }

  const acceptedCategory = categoryConfidence >= DEFAULT_CATEGORY_THRESHOLD ? category : null;
  const suggestedDepartmentId =
    requestedDepartment && departmentConfidence >= DEFAULT_DEPARTMENT_THRESHOLD
      ? requestedDepartment.id
      : null;

  const needsReview =
    !acceptedCategory ||
    (!document.departmentId && departments.length > 0 && !suggestedDepartmentId);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      category: acceptedCategory,
      categoryConfidence,
      suggestedDepartmentId: document.departmentId ? null : suggestedDepartmentId,
      departmentSuggestionConfidence: document.departmentId ? null : departmentConfidence,
      classificationStatus: needsReview ? "needs_review" : "published",
      classifiedAt: new Date(),
      contentHash: computeContentHash(text),
    },
  });

  return {
    category: acceptedCategory,
    categoryConfidence,
    suggestedDepartmentId: document.departmentId ? null : suggestedDepartmentId,
    departmentConfidence: document.departmentId ? null : departmentConfidence,
    classificationStatus: needsReview ? "needs_review" : "published",
  };
}

export async function detectDocumentDuplicates({ prisma, documentId, threshold = DEFAULT_DUPLICATE_THRESHOLD }) {
  const current = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      orgId: true,
      scope: true,
      contentHash: true,
      content: true,
      chunks: { select: { embedding: true } },
      project: { select: { orgId: true, scope: true } },
    },
  });
  if (!current) throw new Error(`Document ${documentId} not found`);

  const orgId = current.orgId || current.project?.orgId;
  if (!orgId) return [];

  const currentVector = averageEmbeddings(current.chunks.map((c) => c.embedding));
  if (!currentVector && !current.contentHash) return [];

  // Compare repository documents and project documents explicitly promoted to org scope.
  const candidates = await prisma.document.findMany({
    where: {
      id: { not: documentId },
      OR: [
        { scope: "repository", orgId },
        { project: { orgId, scope: "org" } },
      ],
    },
    select: {
      id: true,
      contentHash: true,
      content: true,
      chunks: { select: { embedding: true } },
    },
  });

  const matches = [];
  for (const candidate of candidates) {
    let similarity = 0;
    const candidateHash = candidate.contentHash || computeContentHash(candidate.content);
    if (candidateHash && !candidate.contentHash) {
      // Backfill the hash when a candidate is still earlier in the worker
      // pipeline. This removes the upload-order race for exact duplicates.
      await prisma.document.update({
        where: { id: candidate.id },
        data: { contentHash: candidateHash },
      }).catch(() => {});
    }

    if (current.contentHash && candidateHash === current.contentHash) {
      similarity = 1;
    } else if (currentVector) {
      const candidateVector = averageEmbeddings(candidate.chunks.map((c) => c.embedding));
      similarity = candidateVector ? cosineSimilarity(currentVector, candidateVector) : 0;
    }
    if (similarity >= threshold) matches.push({ duplicateOfId: candidate.id, similarity });
  }

  await prisma.documentDuplicate.deleteMany({
    where: { documentId, status: "pending" },
  });
  for (const match of matches) {
    await prisma.documentDuplicate.upsert({
      where: { documentId_duplicateOfId: { documentId, duplicateOfId: match.duplicateOfId } },
      create: { documentId, ...match, status: "pending" },
      update: { similarity: match.similarity, status: "pending" },
    });
  }

  if (matches.length) {
    await prisma.document.update({
      where: { id: documentId },
      data: { classificationStatus: "needs_review" },
    });
  }
  return matches;
}
