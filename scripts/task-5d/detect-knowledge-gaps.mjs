import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const orgIdArg = process.argv.find((arg) => arg.startsWith("--org="));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const orgId = orgIdArg?.split("=")[1] || null;
const days = Number(daysArg?.split("=")[1] || 30);
const since = new Date(Date.now() - Math.max(1, days) * 86_400_000);

function normalizeQuestion(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\b(the|a|an|is|are|was|were|what|why|how|when|where|who|do|does|did|can|could|would|should|please|tell|me|about)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ") || "uncategorized";
}

try {
  const audits = await prisma.chatAuditLog.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      outcome: "answered",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "asc" },
  });

  const conversations = await prisma.orgConversation.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      createdAt: { gte: since },
    },
    select: {
      orgId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, confidence: true, createdAt: true },
      },
    },
  });

  const lowConfidenceByOrg = new Map();
  for (const conversation of conversations) {
    const lowCount = conversation.messages.filter(
      (message) => message.role === "assistant" && message.confidence === "low"
    ).length;
    lowConfidenceByOrg.set(
      conversation.orgId,
      (lowConfidenceByOrg.get(conversation.orgId) || 0) + lowCount
    );
  }

  const groups = new Map();
  for (const audit of audits) {
    const topic = normalizeQuestion(audit.question);
    const key = `${audit.orgId}::${topic}`;
    const current = groups.get(key) || {
      orgId: audit.orgId,
      topic,
      questions: [],
      occurrences: 0,
      zeroCitationCount: 0,
      latestAskedAt: audit.createdAt,
    };
    current.occurrences += 1;
    current.zeroCitationCount += audit.citedDocIds.length === 0 ? 1 : 0;
    current.latestAskedAt = audit.createdAt;
    if (current.questions.length < 5) current.questions.push(audit.question);
    groups.set(key, current);
  }

  const gaps = [...groups.values()]
    .map((group) => ({
      ...group,
      lowConfidenceAnswersInOrg: lowConfidenceByOrg.get(group.orgId) || 0,
      gapScore:
        group.occurrences * 2 +
        group.zeroCitationCount * 3 +
        Math.min(lowConfidenceByOrg.get(group.orgId) || 0, 10),
    }))
    .filter((group) => group.zeroCitationCount > 0 || group.occurrences >= 2)
    .sort((a, b) => b.gapScore - a.gapScore);

  const report = {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    orgId: orgId || "all",
    auditQuestionsAnalyzed: audits.length,
    lowConfidenceAnswers: [...lowConfidenceByOrg.values()].reduce((a, b) => a + b, 0),
    gaps,
  };

  const dir = path.resolve("reports/task-5d");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `knowledge-gaps-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  console.log(`Knowledge-gap report written to ${file}`);
  console.log(`Flagged ${gaps.length} topic pattern(s).`);

  // FR-P3-7: persist as KnowledgeGap rows too, so the health dashboard has
  // something to query instead of only this JSON report. Each run replaces
  // the prior snapshot for the org(s) it actually analyzed — this is a
  // current-state view, not an append-only history — scoped to exactly the
  // orgs present in `gaps` (or the single `--org` requested) so a narrow
  // `--days`/`--org` run never wipes another org's untouched snapshot.
  const analyzedOrgIds = orgId ? [orgId] : [...new Set(gaps.map((g) => g.orgId))];
  if (analyzedOrgIds.length > 0) {
    await prisma.knowledgeGap.deleteMany({ where: { orgId: { in: analyzedOrgIds } } });
  }
  if (gaps.length > 0) {
    await prisma.knowledgeGap.createMany({
      data: gaps.map((g) => ({
        orgId: g.orgId,
        topic: g.topic,
        gapScore: g.gapScore,
        occurrenceCount: g.occurrences,
        zeroCitationCount: g.zeroCitationCount,
        lowConfidenceCount: g.lowConfidenceAnswersInOrg,
      })),
    });
  }
  console.log(`Persisted ${gaps.length} KnowledgeGap row(s) for ${analyzedOrgIds.length} org(s).`);
} finally {
  await prisma.$disconnect();
}
