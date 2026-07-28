// src/lib/decisionIntelligence.js
// FR-P3-2: detect decision-oriented chat questions and retrieve related past
// `Decision` rows as grounding evidence, the same RBAC-scoped-retrieval
// pattern as orgKeywordSearch (src/lib/vectorSearch.js) rather than a new
// unscoped query.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { computeBM25, tokenize } from "@/lib/keywordSearch";
import { scopeSql } from "@/lib/vectorSearch";

const DECISION_INTENT_PATTERNS = [
  /\bshould we\b/i,
  /\bshould i\b/i,
  /\bwhat('?s| is) the (right|best) (call|decision|approach|option)\b/i,
  /\bwhat do (you|we) recommend\b/i,
  /\bwhat would you recommend\b/i,
  /\bwhich (option|approach) (should|is better)\b/i,
  /\bis it (a good idea|worth it) to\b/i,
  /\bdo we need to\b/i,
  /\brecommend(ation)?\b/i,
];

export function isDecisionQuestion(question) {
  const text = String(question || "").trim();
  if (!text) return false;
  return DECISION_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * RBAC-scoped keyword search over Decision.statement/rationale, joined
 * through Document the same way orgKeywordSearch joins through Chunk — reuses
 * scopeSql and the identical repository/project access-check shape so a
 * decision never surfaces to a user who couldn't already see its document.
 */
export async function getDecisionEvidence({
  question,
  orgId,
  userId,
  isSuperAdmin = false,
  scope = "organization",
  departmentId = null,
  limit = 3,
}) {
  const safeQuery = String(question || "").trim();
  if (!safeQuery) return [];

  const terms = tokenize(safeQuery).slice(0, 8);
  if (terms.length === 0) return [];

  const scopeFilter = scopeSql({ scope, departmentId });
  const termFilters = terms.map(
    (term) => Prisma.sql`
      (
        dec.statement ILIKE ${`%${term}%`}
        OR dec.rationale ILIKE ${`%${term}%`}
      )
    `
  );

  const candidates = await prisma.$queryRaw`
    SELECT dec.id, dec.statement, dec.rationale, dec."decidedAt", dec."documentId",
           d.filename, d."departmentId", d."projectId", d.scope,
           dept.name AS department_name,
           proj.name AS project_name
    FROM "Decision" dec
    JOIN "Document" d ON dec."documentId" = d.id
    LEFT JOIN "Department" dept ON dept.id = d."departmentId"
    LEFT JOIN "Project" proj ON proj.id = d."projectId"
    LEFT JOIN "DepartmentMember" dm
      ON d."departmentId" = dm."departmentId" AND dm."userId" = ${userId}
    WHERE d."orgId" = ${orgId}
      ${scopeFilter}
      AND (${Prisma.join(termFilters, " OR ")})
      AND (
        (d.scope = 'repository'
         AND d.lifecycle = 'published'
         AND (${isSuperAdmin} OR d."departmentId" IS NULL OR dm."userId" IS NOT NULL))
        OR
        EXISTS (
          SELECT 1 FROM "Project" p
          WHERE p.id = d."projectId"
            AND p.scope = 'org'
            AND p."orgId" = ${orgId}
            AND (
              ${isSuperAdmin}
              OR EXISTS (
                SELECT 1 FROM "DepartmentMember" pm
                WHERE pm."departmentId" = p."departmentId" AND pm."userId" = ${userId}
              )
            )
        )
      )
    LIMIT 100
  `;

  if (candidates.length === 0) return [];

  return computeBM25(
    candidates.map((c) => ({ ...c, text: `${c.statement} ${c.rationale || ""}` })),
    safeQuery
  )
    .filter((c) => c.score > 0)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      statement: c.statement,
      rationale: c.rationale,
      decidedAt: c.decidedAt,
      documentId: c.documentId,
      filename: c.filename,
      departmentName: c.department_name,
      projectName: c.project_name,
    }));
}

export function formatDecisionContext(decisions) {
  if (!decisions.length) return "";
  const blocks = decisions.map((d) => {
    const scopeLabel = d.projectName || d.departmentName;
    return `- Decision (from "${d.filename}"${scopeLabel ? `, ${scopeLabel}` : ""}): "${d.statement}"${
      d.rationale ? ` — Rationale: ${d.rationale}` : ""
    }`;
  });
  return `Relevant past decisions:\n${blocks.join("\n")}`;
}

export const DECISION_INSTRUCTION =
  "The user's question is decision-oriented. Ground your recommendation in the past decisions listed below and explicitly cite them (by document name and statement) as evidence, rather than only retrieving them verbatim. If none of the past decisions are actually relevant, answer from the general context instead and do not force a connection.";
