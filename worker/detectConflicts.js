// FR-P2-10 conflict detection, shared between the automatic per-document
// path (worker/index.js, runs on every upload/regenerate) and the
// standalone org-wide backfill script (scripts/task-5d/detect-document-conflicts.mjs,
// for documents that existed before this became automatic).

const CONFLICT_SYSTEM_PROMPT =
  "Determine whether two passages make materially contradictory factual claims about the same topic. Similar wording, updates, omissions, or different scope are not contradictions. Return JSON: {conflict:boolean, summary:string, confidence:number}. The summary must name the conflicting claims concisely.";

function canonicalPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// Documents can carry orgId directly (repository scope) or only via their
// project (project scope, Document.orgId is null) — candidate queries below
// resolve org through both so project-scoped uploads aren't silently
// invisible to conflict detection.
const CANDIDATE_COLUMNS = `
      a.document_id AS "documentAId",
      b.document_id AS "documentBId",
      da.filename AS "filenameA",
      db.filename AS "filenameB",
      COALESCE(a.summary, a.text, '') AS "textA",
      COALESCE(b.summary, b.text, '') AS "textB",
      (a.embedding_vec <=> b.embedding_vec) AS distance
`;

const CANDIDATE_JOINS = `
    FROM "Chunk" a
    JOIN "Chunk" b ON a.id < b.id AND a.document_id <> b.document_id
    JOIN "Document" da ON da.id = a.document_id
    JOIN "Document" db ON db.id = b.document_id
    LEFT JOIN "Project" pa ON pa.id = da."projectId"
    LEFT JOIN "Project" pb ON pb.id = db."projectId"
`;

const CANDIDATE_SHARED_FILTERS = `
      AND a.embedding_vec IS NOT NULL
      AND b.embedding_vec IS NOT NULL
      AND da.lifecycle = 'published'
      AND db.lifecycle = 'published'
      AND (
        da."departmentId" = db."departmentId"
        OR da."projectId" = db."projectId"
        OR (da."departmentId" IS NULL AND db."departmentId" IS NULL)
      )
`;

export async function findConflictCandidatesForOrg(
  prisma,
  orgId,
  { distanceThreshold = 0.22, limit = 60 } = {}
) {
  return prisma.$queryRawUnsafe(
    `
    SELECT DISTINCT ON (LEAST(a.document_id, b.document_id), GREATEST(a.document_id, b.document_id))
      ${CANDIDATE_COLUMNS}
    ${CANDIDATE_JOINS}
    WHERE COALESCE(da."orgId", pa."orgId") = $1
      AND COALESCE(db."orgId", pb."orgId") = $1
      ${CANDIDATE_SHARED_FILTERS}
      AND (a.embedding_vec <=> b.embedding_vec) <= $2
    ORDER BY LEAST(a.document_id, b.document_id), GREATEST(a.document_id, b.document_id), distance ASC
    LIMIT ${limit}
  `,
    orgId,
    distanceThreshold
  );
}

// Scoped to one document vs. its siblings so cost stays proportional to
// what changed (one upload/regenerate) rather than rescanning a whole org.
export async function findConflictCandidatesForDocument(
  prisma,
  docId,
  { distanceThreshold = 0.22, limit = 20 } = {}
) {
  return prisma.$queryRawUnsafe(
    `
    SELECT DISTINCT ON (LEAST(a.document_id, b.document_id), GREATEST(a.document_id, b.document_id))
      ${CANDIDATE_COLUMNS}
    ${CANDIDATE_JOINS}
    WHERE (a.document_id = $1 OR b.document_id = $1)
      AND COALESCE(da."orgId", pa."orgId") IS NOT NULL
      AND COALESCE(da."orgId", pa."orgId") = COALESCE(db."orgId", pb."orgId")
      ${CANDIDATE_SHARED_FILTERS}
      AND (a.embedding_vec <=> b.embedding_vec) <= $2
    ORDER BY LEAST(a.document_id, b.document_id), GREATEST(a.document_id, b.document_id), distance ASC
    LIMIT ${limit}
  `,
    docId,
    distanceThreshold
  );
}

export async function verifyAndRecordConflict(prisma, openai, candidate) {
  const textA = String(candidate.textA || "").slice(0, 1800);
  const textB = String(candidate.textB || "").slice(0, 1800);
  if (!textA || !textB) return false;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 250,
    messages: [
      { role: "system", content: CONFLICT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Document A (${candidate.filenameA}):\n${textA}\n\nDocument B (${candidate.filenameB}):\n${textB}`,
      },
    ],
  });

  let verdict;
  try {
    verdict = JSON.parse(response.choices[0]?.message?.content || "{}");
  } catch {
    return false;
  }
  if (!verdict.conflict || Number(verdict.confidence || 0) < 0.7) return false;

  const [documentAId, documentBId] = canonicalPair(candidate.documentAId, candidate.documentBId);
  const existing = await prisma.documentConflict.findFirst({
    where: {
      OR: [
        { documentAId, documentBId },
        { documentAId: documentBId, documentBId: documentAId },
      ],
    },
  });

  if (existing) {
    await prisma.documentConflict.update({
      where: { id: existing.id },
      data: { summary: verdict.summary, status: "flagged" },
    });
  } else {
    await prisma.documentConflict.create({
      data: { documentAId, documentBId, summary: verdict.summary, status: "flagged" },
    });
  }
  return true;
}

// Called automatically from processSummarizationJob. Caller is responsible
// for clearing this document's stale conflicts first (regenerate mode can
// change the content enough that an old flag no longer applies).
export async function detectConflictsForDocument(prisma, openai, docId, opts = {}) {
  const candidates = await findConflictCandidatesForDocument(prisma, docId, opts);
  let flagged = 0;
  for (const candidate of candidates) {
    const ok = await verifyAndRecordConflict(prisma, openai, candidate);
    if (ok) flagged += 1;
  }
  return { reviewed: candidates.length, flagged };
}
