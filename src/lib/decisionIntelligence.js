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

// The RBAC boundary shared by getDecisionEvidence (chat grounding) and
// getAccessibleDecisions (Rank 14 repository browse/search) — a decision is
// visible only if its source document is a published repository document in
// a department the user belongs to (or an unassigned department), or is
// attached to an org-scope project whose department the user belongs to.
// Kept as one fragment so the repository surface can never drift from what
// chat grounding already allows. See REQUIREMENTS_DECISION_INTELLIGENCE_REPOSITORY.md's
// Non-Functional Requirements.
function decisionAccessSql({ orgId, userId, isSuperAdmin }) {
  return Prisma.sql`
    (
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
  `;
}

/**
 * RBAC-scoped keyword search over Decision.statement/rationale, joined
 * through Document the same way orgKeywordSearch joins through Chunk — reuses
 * scopeSql and decisionAccessSql so a decision never surfaces to a user who
 * couldn't already see its document.
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

  const scopeFilter = scopeSql({ scope, departmentId, userId });
  const termFilters = terms.map(
    (term) => Prisma.sql`
      (
        dec.statement ILIKE ${`%${term}%`}
        OR dec.rationale ILIKE ${`%${term}%`}
      )
    `
  );

  const candidates = await prisma.$queryRaw`
    SELECT dec.id, dec.statement, dec.rationale, dec.status, dec."statusNote", dec."decidedAt", dec."documentId",
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
      AND ${decisionAccessSql({ orgId, userId, isSuperAdmin })}
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
      status: c.status,
      statusNote: c.statusNote,
      decidedAt: c.decidedAt,
      documentId: c.documentId,
      filename: c.filename,
      departmentName: c.department_name,
      projectName: c.project_name,
    }));
}

/**
 * Rank 14 (Decision Intelligence Repository), FR-1/FR-4: org-wide browse and
 * search over decisions, RBAC-scoped by the same decisionAccessSql fragment
 * getDecisionEvidence uses for chat grounding. `query` reuses this file's
 * existing keyword-search shape (tokenize + ILIKE candidate fetch + BM25
 * rerank) rather than a second search implementation, per FR-4; without a
 * query it's a plain, filterable, paginated listing ordered by decidedAt.
 */
export async function getAccessibleDecisions({
  orgId,
  userId,
  isSuperAdmin = false,
  departmentId = null,
  projectId = null,
  status = null,
  from = null,
  to = null,
  query = "",
  limit = 20,
  offset = 0,
}) {
  const scopeFilter = scopeSql({ scope: departmentId ? "department" : "organization", departmentId, userId });
  const projectFilter = projectId ? Prisma.sql`AND d."projectId" = ${projectId}` : Prisma.empty;
  const statusFilter = status ? Prisma.sql`AND dec.status = ${status}` : Prisma.empty;
  const fromFilter = from ? Prisma.sql`AND dec."decidedAt" >= ${new Date(from)}` : Prisma.empty;
  const toFilter = to ? Prisma.sql`AND dec."decidedAt" <= ${new Date(to)}` : Prisma.empty;

  const safeQuery = String(query || "").trim();
  const terms = safeQuery ? tokenize(safeQuery).slice(0, 8) : [];
  const termFilter = terms.length
    ? Prisma.sql`AND (${Prisma.join(
        terms.map((term) => Prisma.sql`(dec.statement ILIKE ${`%${term}%`} OR dec.rationale ILIKE ${`%${term}%`})`),
        " OR "
      )})`
    : Prisma.empty;

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);
  // Search reruns BM25 over a wider candidate pool (mirrors getDecisionEvidence);
  // a plain browse just paginates directly in SQL.
  const fetchLimit = terms.length ? 100 : safeLimit;

  const rows = await prisma.$queryRaw`
    SELECT dec.id, dec.statement, dec.rationale, dec.status, dec."decidedAt", dec."documentId",
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
      ${projectFilter}
      ${statusFilter}
      ${fromFilter}
      ${toFilter}
      ${termFilter}
      AND ${decisionAccessSql({ orgId, userId, isSuperAdmin })}
    ORDER BY dec."decidedAt" DESC NULLS LAST, dec.created_at DESC
    LIMIT ${Prisma.raw(String(fetchLimit))}
    OFFSET ${Prisma.raw(String(terms.length ? 0 : safeOffset))}
  `;

  const serialize = (r) => ({
    id: r.id,
    statement: r.statement,
    rationale: r.rationale,
    status: r.status,
    decidedAt: r.decidedAt,
    documentId: r.documentId,
    filename: r.filename,
    departmentId: r.departmentId,
    projectId: r.projectId,
    departmentName: r.department_name,
    projectName: r.project_name,
  });

  if (!terms.length) return rows.map(serialize);

  return computeBM25(
    rows.map((r) => ({ ...r, text: `${r.statement} ${r.rationale || ""}` })),
    safeQuery
  )
    .filter((r) => r.score > 0)
    .slice(0, safeLimit)
    .map(serialize);
}

const STATUS_LABELS = { active: "Active", reversed: "Reversed", superseded: "Superseded" };

export function formatDecisionContext(decisions) {
  if (!decisions.length) return "";
  const blocks = decisions.map((d) => {
    const scopeLabel = d.projectName || d.departmentName;
    // Outcome status only worth stating when it's not the default "active" —
    // and whenever there's a statusNote explaining it, since that's the
    // whole point of a reversed/superseded decision still being cited: the
    // model should know it didn't hold, and why, not just quote it verbatim.
    const statusLabel = d.status && d.status !== "active" ? (STATUS_LABELS[d.status] || d.status) : null;
    return `- Decision (from "${d.filename}"${scopeLabel ? `, ${scopeLabel}` : ""}): "${d.statement}"${
      d.rationale ? ` — Rationale: ${d.rationale}` : ""
    }${statusLabel ? ` — Outcome: ${statusLabel}` : ""}${d.statusNote ? ` — Note: ${d.statusNote}` : ""}`;
  });
  return `Relevant past decisions:\n${blocks.join("\n")}`;
}

export const DECISION_INSTRUCTION =
  "The user's question is decision-oriented. Ground your recommendation in the past decisions listed below and explicitly cite them (by document name and statement) as evidence, rather than only retrieving them verbatim. If a decision's outcome is Reversed or Superseded, treat it as historical context, not current guidance — surface the outcome and its note rather than recommending the reversed/superseded decision itself. If none of the past decisions are actually relevant, answer from the general context instead and do not force a connection.";
