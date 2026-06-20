import { prisma } from '@/lib/prisma';

export async function getUserOpenAIKey(userId) {
    const setting = await prisma.setting.findFirst({
      where: {
        userId,
        key: "openai_api_key",
      },
    });
  
    return setting?.value || null;
}

export async function getOrgOpenAIKey(orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { openaiApiKey: true },
    });

    return org?.openaiApiKey || null;
}
