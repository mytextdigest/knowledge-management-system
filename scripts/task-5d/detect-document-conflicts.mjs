import "dotenv/config";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const orgIdArg = process.argv.find((arg) => arg.startsWith("--org="));
const orgId = orgIdArg?.split("=")[1];
const thresholdArg = process.argv.find((arg) => arg.startsWith("--distance="));
const distanceThreshold = Number(thresholdArg?.split("=")[1] || 0.22);

if (!orgId) {
  console.error("Usage: npm run task5d:conflicts -- --org=<ORG_ID> [--distance=0.22]");
  process.exit(1);
}

function canonicalPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

try {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { openaiApiKey: true },
  });
  const apiKey = org?.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("ORG_OPENAI_KEY_MISSING");
  const openai = new OpenAI({ apiKey });

  const candidates = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT ON (LEAST(a.document_id, b.document_id), GREATEST(a.document_id, b.document_id))
      a.document_id AS "documentAId",
      b.document_id AS "documentBId",
      da.filename AS "filenameA",
      db.filename AS "filenameB",
      da."departmentId" AS "departmentAId",
      db."departmentId" AS "departmentBId",
      COALESCE(a.summary, a.text, '') AS "textA",
      COALESCE(b.summary, b.text, '') AS "textB",
      (a.embedding_vec <=> b.embedding_vec) AS distance
    FROM "Chunk" a
    JOIN "Chunk" b ON a.id < b.id AND a.document_id <> b.document_id
    JOIN "Document" da ON da.id = a.document_id
    JOIN "Document" db ON db.id = b.document_id
    WHERE da."orgId" = $1
      AND db."orgId" = $1
      AND a.embedding_vec IS NOT NULL
      AND b.embedding_vec IS NOT NULL
      AND da.lifecycle = 'published'
      AND db.lifecycle = 'published'
      AND (
        da."departmentId" = db."departmentId"
        OR da."projectId" = db."projectId"
        OR (da."departmentId" IS NULL AND db."departmentId" IS NULL)
      )
      AND (a.embedding_vec <=> b.embedding_vec) <= $2
    ORDER BY LEAST(a.document_id, b.document_id), GREATEST(a.document_id, b.document_id), distance ASC
    LIMIT 60
  `, orgId, distanceThreshold);

  let flagged = 0;
  for (const candidate of candidates) {
    const textA = String(candidate.textA || "").slice(0, 1800);
    const textB = String(candidate.textB || "").slice(0, 1800);
    if (!textA || !textB) continue;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 250,
      messages: [
        {
          role: "system",
          content:
            "Determine whether two passages make materially contradictory factual claims about the same topic. Similar wording, updates, omissions, or different scope are not contradictions. Return JSON: {conflict:boolean, summary:string, confidence:number}. The summary must name the conflicting claims concisely.",
        },
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
      continue;
    }
    if (!verdict.conflict || Number(verdict.confidence || 0) < 0.7) continue;

    const [documentAId, documentBId] = canonicalPair(
      candidate.documentAId,
      candidate.documentBId
    );
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
    flagged += 1;
  }

  console.log(`Reviewed ${candidates.length} semantically related document pair(s).`);
  console.log(`Flagged or refreshed ${flagged} conflict(s).`);
} finally {
  await prisma.$disconnect();
}
