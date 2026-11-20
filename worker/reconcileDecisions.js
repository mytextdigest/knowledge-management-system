// Decision Extraction v2, FR-3: reconcile-on-regenerate. Replaces the old
// unconditional `decision.deleteMany` + `timelineEvent.deleteMany` for the
// whole document (worker/index.js, pre-v2) — that wipe is unacceptable once
// decisions can be reviewed/edited/rejected by a human, per the requirements
// doc's Non-Functional Requirements ("no silent data loss: regenerate never
// deletes a reviewed row").
//
// Only rows that are `source: "extracted"`, `status: "pending"`, and never
// reviewed (`reviewedAt` null) are ever deleted here. Everything else —
// confirmed, rejected, reversed, superseded, reviewer-edited, or manually
// added — survives a regenerate untouched. A new extraction that matches a
// preserved row creates nothing (evidence is appended instead); a match
// against a `rejected` row is fully suppressed, since the reviewer already
// said no.

import { statementsMatch } from "./decisions.js";

const MAX_EVIDENCE_PER_DECISION = 8;

async function createEvidenceRows(prisma, decisionId, documentId, evidence) {
  const rows = (evidence || []).slice(0, MAX_EVIDENCE_PER_DECISION);
  if (!rows.length) return;
  await prisma.decisionEvidence.createMany({
    data: rows.map((e) => ({
      decisionId,
      documentId,
      chunkId: e.chunkId || null,
      chunkIndex: e.chunkIndex ?? null,
      quote: e.quote,
      type: e.type,
    })),
  });
}

/**
 * prisma: PrismaClient (or a transaction client)
 * docId: the document being (re)processed
 * newDecisions: extractDecisionsV2()'s output for this run
 *
 * Returns { created, matched, deletedUnreviewed } counts for logging.
 */
export async function reconcileDecisions(prisma, { docId, newDecisions }) {
  const existing = await prisma.decision.findMany({
    where: { documentId: docId },
    include: { evidence: { select: { quote: true } } },
  });

  const toDelete = existing.filter((d) => d.source === "extracted" && d.status === "pending" && !d.reviewedAt);
  const preserved = existing.filter((d) => !toDelete.includes(d));

  if (toDelete.length) {
    // DecisionEvidence cascades on Decision delete; TimelineEvent is never
    // created for a still-pending decision (only on confirm), so there's
    // nothing else tied to these rows to clean up.
    await prisma.decision.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } });
  }

  let created = 0;
  let matched = 0;

  for (const candidate of newDecisions) {
    const match = preserved.find((p) => statementsMatch(p.aiStatement || p.statement, candidate.statement));

    if (match) {
      matched += 1;
      // A rejected row's match is fully suppressed — the reviewer already
      // said this isn't a decision; don't even append new evidence to it.
      if (match.status === "rejected") continue;

      const seenQuotes = new Set(match.evidence.map((e) => e.quote.toLowerCase().trim()));
      const newEvidence = candidate.evidence.filter((e) => !seenQuotes.has(e.quote.toLowerCase().trim()));
      if (newEvidence.length) await createEvidenceRows(prisma, match.id, docId, newEvidence);
      continue;
    }

    const created_row = await prisma.decision.create({
      data: {
        documentId: docId,
        statement: candidate.statement,
        subject: candidate.subject,
        rationale: candidate.rationale,
        decidedAt: candidate.decidedAt,
        status: "pending",
        source: "extracted",
        certainty: candidate.certainty,
        explicitness: candidate.explicitness,
        score: candidate.score,
        signals: candidate.signals,
        actors: candidate.actors,
        alternatives: candidate.alternatives,
      },
    });
    await createEvidenceRows(prisma, created_row.id, docId, candidate.evidence);
    created += 1;
  }

  return { created, matched, deletedUnreviewed: toDelete.length };
}
