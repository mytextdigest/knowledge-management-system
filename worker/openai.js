import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getOpenAIForDocument(docId) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: {
      userId: true,
      orgId: true,
      organization: {
        select: { openaiApiKey: true },
      },
    },
  });

  if (!doc) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }

  const validKey = (key) => {
    const value = typeof key === "string" ? key.trim() : "";
    return value && !/REPLACE_|YOUR_API_KEY|PLACEHOLDER|^sk-test/i.test(value) ? value : null;
  };

  const orgKey = validKey(doc.organization?.openaiApiKey);
  if (orgKey) {
    return new OpenAI({ apiKey: orgKey });
  }

  if (doc.userId) {
    const setting = await prisma.setting.findUnique({
      where: {
        userId_key: {
          userId: doc.userId,
          key: "openai_api_key",
        },
      },
      select: { value: true },
    });

    const userKey = validKey(setting?.value);
    if (userKey) {
      return new OpenAI({ apiKey: userKey });
    }
  }

  const envKey = validKey(process.env.OPENAI_API_KEY);
  if (envKey) {
    return new OpenAI({ apiKey: envKey });
  }

  throw new Error("OPENAI_KEY_MISSING");
}
