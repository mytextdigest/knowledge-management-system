import { prisma } from "@/lib/prisma";

export async function getUserOpenAIKey(userId) {
  const setting = await prisma.setting.findUnique({
    where: {
      userId_key: {
        userId,
        key: "openai_api_key",
      },
    },
    select: {
      value: true,
    },
  });

  return setting?.value?.trim() || null;
}

export async function getOrgOpenAIKey(orgId) {
  if (!orgId) return null;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      openaiApiKey: true,
    },
  });

  return org?.openaiApiKey?.trim() || null;
}

export async function resolveOpenAIKey({ userId, orgId }) {
  const orgKey = await getOrgOpenAIKey(orgId);
  if (orgKey) return orgKey;

  const userKey = await getUserOpenAIKey(userId);
  if (userKey) return userKey;

  return process.env.OPENAI_API_KEY?.trim() || null;
}