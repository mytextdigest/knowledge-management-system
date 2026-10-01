import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.join("=") || true];
}));
const days = Math.max(1, Number(args.days || process.env.KMS_STALE_DAYS || 180));
const orgId = args.org || null;
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

try {
  const documents = await prisma.document.findMany({
    where: {
      lifecycle: "published",
      lifecycleSuggestionDismissedAt: null,
      ...(orgId ? { orgId } : {}),
      OR: [{ scope: "repository" }, { project: { scope: "org" } }],
    },
    select: { id: true, filename: true, createdAt: true, orgId: true },
  });

  let flagged = 0;
  for (const doc of documents) {
    const lastCitation = await prisma.chatAuditLog.findFirst({
      where: {
        ...(doc.orgId ? { orgId: doc.orgId } : {}),
        citedDocIds: { has: doc.id },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const lastUsedAt = lastCitation?.createdAt || doc.createdAt;
    if (lastUsedAt <= cutoff) {
      await prisma.document.update({
        where: { id: doc.id },
        data: {
          lifecycleSuggestion: "archived",
          lifecycleSuggestionReason: `Not cited in chat for at least ${days} days`,
          lifecycleSuggestedAt: new Date(),
        },
      });
      flagged += 1;
    }
  }
  console.log(`Reviewed ${documents.length} document(s); flagged ${flagged} stale candidate(s).`);
} finally {
  await prisma.$disconnect();
}
