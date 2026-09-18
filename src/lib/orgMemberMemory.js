// src/lib/orgMemberMemory.js
// FR-P2-5: cross-conversation memory. Extends Phase 1's per-conversation
// activeTopic/activeDocumentId (OrgConversation) with a per-user, per-org
// store of recently-discussed topics that persists across conversations.

import { prisma } from "@/lib/prisma";

const RECENT_MEMORY_LIMIT = 5;

export async function getRecentMemory(orgId, userId, limit = RECENT_MEMORY_LIMIT) {
  return prisma.orgMemberMemory.findMany({
    where: { orgId, userId },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });
}

export async function recordMemoryTopics(orgId, userId, topics) {
  const uniqueTopics = [...new Set((topics || []).map((t) => String(t || "").trim()).filter(Boolean))];
  if (uniqueTopics.length === 0) return;

  await Promise.all(
    uniqueTopics.map((topic) =>
      prisma.orgMemberMemory.upsert({
        where: { orgId_userId_topic: { orgId, userId, topic } },
        update: { lastSeenAt: new Date() },
        create: { orgId, userId, topic },
      })
    )
  );
}
