import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getOpenAIForDocument(docId) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: {
      orgId: true,
      organization: {
        select: { openaiApiKey: true },
      },
    },
  });

  if (!doc?.organization?.openaiApiKey) {
    throw new Error("OPENAI_KEY_MISSING");
  }

  return new OpenAI({
    apiKey: doc.organization.openaiApiKey,
  });
}
