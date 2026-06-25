import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { orgSearch } from "@/lib/vectorSearch";
import { getOrgOpenAIKey } from "@/utils/key_helper";

const SYSTEM_PROMPT = `
You are an expert assistant that answers questions using only the
organization's knowledge repository context provided below.

Do NOT invent factual information that is not supported by the context.
If the answer cannot be found in the context, say:
"I cannot answer that based on the organization's knowledge repository."

Response format:
- Plain text only (no markdown, no lists, no special formatting).
`.trim();

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const conversations = await prisma.orgConversation.findMany({
    where: { orgId, userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      title: c.title,
      preview: c.title || c.messages[0]?.content?.slice(0, 80) || "New conversation",
    })),
  });
}

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const question = body.question?.trim();
  let conversationId = body.conversationId || null;

  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const apiKey = await getOrgOpenAIKey(orgId);
  if (!apiKey) {
    return NextResponse.json({ error: "ORG_OPENAI_KEY_MISSING" }, { status: 400 });
  }

  if (conversationId) {
    const conv = await prisma.orgConversation.findFirst({
      where: { id: conversationId, orgId, userId: user.id },
    });
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  } else {
    const conv = await prisma.orgConversation.create({
      data: { orgId, userId: user.id },
    });
    conversationId = conv.id;
  }

  const userMsg = await prisma.orgMessage.create({
    data: { conversationId, role: "user", content: question },
  });

  const openai = new OpenAI({ apiKey });

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });
  const queryEmbedding = embRes.data[0].embedding;

  const chunks = await orgSearch(queryEmbedding, {
    userId: user.id,
    orgId,
    limit: 8,
    isSuperAdmin: isSuperAdmin(role),
  });

  const grouped = chunks.reduce((acc, c) => {
    const key = c.filename || c.document_id;
    acc[key] = acc[key] || { filename: c.filename, department: c.department_name, texts: [] };
    acc[key].texts.push(String(c.text || "").slice(0, 600).replace(/\n+/g, " "));
    return acc;
  }, {});

  const sources = Object.values(grouped).map((g) => ({
    filename: g.filename,
    department: g.department || null,
  }));

  const contextBlocks = Object.values(grouped).map(
    (g) => `Document: ${g.filename}${g.department ? ` (Department: ${g.department})` : ""}\n${g.texts.map((t) => `- ${t}`).join("\n")}`
  );
  const context = contextBlocks.length > 0
    ? contextBlocks.join("\n\n")
    : "No relevant organization documents were found for this question.";

  const prevMsgs = await prisma.orgMessage.findMany({
    where: { conversationId, createdAt: { lt: userMsg.createdAt } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  prevMsgs.reverse();

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...prevMsgs.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `Question: ${question}\n\nContext:\n${context}` },
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.3,
    max_tokens: 800,
  });

  const answer = completion?.choices?.[0]?.message?.content?.trim() || "";

  await prisma.orgMessage.create({
    data: { conversationId, role: "assistant", content: answer },
  });

  return NextResponse.json({ conversationId, answer, sources });
}
