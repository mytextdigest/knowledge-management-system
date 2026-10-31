import "dotenv/config";
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import { findConflictCandidatesForOrg, verifyAndRecordConflict } from "../../worker/detectConflicts.js";

const prisma = new PrismaClient();
const orgIdArg = process.argv.find((arg) => arg.startsWith("--org="));
const orgId = orgIdArg?.split("=")[1];
const thresholdArg = process.argv.find((arg) => arg.startsWith("--distance="));
const distanceThreshold = Number(thresholdArg?.split("=")[1] || 0.22);

if (!orgId) {
  console.error("Usage: npm run task5d:conflicts -- --org=<ORG_ID> [--distance=0.22]");
  process.exit(1);
}

// Conflict detection now also runs automatically per-document in
// worker/index.js's processSummarizationJob (on every upload/regenerate).
// This script stays as a backfill/rescan tool for documents that existed
// before that shipped, or for a full org-wide re-check on demand.
try {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { openaiApiKey: true },
  });
  const apiKey = org?.openaiApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("ORG_OPENAI_KEY_MISSING");
  const openai = new OpenAI({ apiKey });

  const candidates = await findConflictCandidatesForOrg(prisma, orgId, { distanceThreshold });

  let flagged = 0;
  for (const candidate of candidates) {
    const ok = await verifyAndRecordConflict(prisma, openai, candidate);
    if (ok) flagged += 1;
  }

  console.log(`Reviewed ${candidates.length} semantically related document pair(s).`);
  console.log(`Flagged or refreshed ${flagged} conflict(s).`);
} finally {
  await prisma.$disconnect();
}
