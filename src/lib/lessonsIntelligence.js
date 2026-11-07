// src/lib/lessonsIntelligence.js
// Rank 11 FR-4: detect lessons-oriented chat questions and retrieve
// `published` `Lesson` rows as grounding evidence, the same RBAC-scoped
// pattern as decisionIntelligence.js's getDecisionEvidence — RBAC applied in
// the SQL WHERE clause, never a post-filter.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeBM25, tokenize } from "@/lib/keywordSearch";

const LESSON_INTENT_PATTERNS = [
  /\bwhat (have|did) we learn(ed)?\b/i,
  /\blessons? learned\b/i,
  /\bwhat went (wrong|well)\b/i,
  /\bwhat (worked|didn'?t work)\b/i,
  /\bwhat would we do differently\b/i,
  /\bhave we (dealt with|run into|seen) this before\b/i,
  /\bpost[- ]?mortem\b/i,
  /\bretrospective\b/i,
  /\bany (past )?lessons\b/i,
];

export function isLessonQuestion(question) {
  const text = String(question || "").trim();
  if (!text) return false;
  return LESSON_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * A Lesson is visible if the asking user is a super_admin, a member of its
 * department, the owner/member of its project's department (for org-scope
 * projects), or its author. Only `published` lessons are ever returned here
 * — draft lessons are visible on the project/department feed to people who
 * already have access to that project/department, but never used as chat
 * grounding evidence for the wider org (see REQUIREMENTS_LESSONS_LEARNED_INTELLIGENCE.md FR-4/FR-6).
 */
export async function getLessonEvidence({
  question,
  orgId,
  userId,
  isSuperAdmin = false,
  limit = 3,
}) {
  const safeQuery = String(question || "").trim();
  if (!safeQuery) return [];

  const terms = tokenize(safeQuery).slice(0, 8);
  if (terms.length === 0) return [];

  const termFilters = terms.map(
    (term) => Prisma.sql`
      (
        l."whatHappened" ILIKE ${`%${term}%`}
        OR l."whatWorked" ILIKE ${`%${term}%`}
        OR l."whatDidntWork" ILIKE ${`%${term}%`}
        OR l.recommendation ILIKE ${`%${term}%`}
        OR l.topic ILIKE ${`%${term}%`}
      )
    `
  );

  const candidates = await prisma.$queryRaw`
    SELECT l.id, l.topic, l."whatHappened", l."whatWorked", l."whatDidntWork",
           l.recommendation, l."projectId", l."departmentId", l."authorUserId",
           proj.name AS project_name, dept.name AS department_name
    FROM "Lesson" l
    LEFT JOIN "Project" proj ON proj.id = l."projectId"
    LEFT JOIN "Department" dept ON dept.id = l."departmentId"
    WHERE l."orgId" = ${orgId}
      AND l.status = 'published'
      AND (${Prisma.join(termFilters, " OR ")})
      AND (
        ${isSuperAdmin}
        OR l."authorUserId" = ${userId}
        OR (l."departmentId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "DepartmentMember" dm
          WHERE dm."departmentId" = l."departmentId" AND dm."userId" = ${userId}
        ))
      )
    LIMIT 100
  `;

  if (candidates.length === 0) return [];

  return computeBM25(
    candidates.map((c) => ({
      ...c,
      text: [c.whatHappened, c.whatWorked, c.whatDidntWork, c.recommendation, c.topic]
        .filter(Boolean)
        .join(" "),
    })),
    safeQuery
  )
    .filter((c) => c.score > 0)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      topic: c.topic,
      whatHappened: c.whatHappened,
      whatWorked: c.whatWorked,
      whatDidntWork: c.whatDidntWork,
      recommendation: c.recommendation,
      projectId: c.projectId,
      projectName: c.project_name,
      departmentName: c.department_name,
    }));
}

export function formatLessonContext(lessons) {
  if (!lessons.length) return "";
  const blocks = lessons.map((l) => {
    const scopeLabel = l.projectName || l.departmentName;
    const parts = [`- Lesson${scopeLabel ? ` (from ${scopeLabel})` : ""}: "${l.whatHappened}"`];
    if (l.whatWorked) parts.push(`What worked: ${l.whatWorked}`);
    if (l.whatDidntWork) parts.push(`What didn't work: ${l.whatDidntWork}`);
    if (l.recommendation) parts.push(`Recommendation: ${l.recommendation}`);
    return parts.join(" — ");
  });
  return `Relevant lessons learned:\n${blocks.join("\n")}`;
}

export const LESSON_INSTRUCTION =
  "The user's question is asking about lessons learned or past experience. Ground your answer in the lessons listed below and explicitly reference what worked, what didn't, and any recommendation, rather than only retrieving them verbatim. If none of the listed lessons are actually relevant, answer from the general context instead and do not force a connection.";
