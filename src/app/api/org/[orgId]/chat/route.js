import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { orgSearch } from "@/lib/vectorSearch";
import { getOrgOpenAIKey } from "@/utils/key_helper";
import { generateSignedUrl } from "@/lib/s3SignedUrl";

const SYSTEM_PROMPT = `
You are an expert assistant that answers questions using only the
organization's knowledge repository context provided below.

Do NOT invent factual information that is not supported by the context.
If the answer cannot be found in the context, say:
"I cannot answer that based on the organization's knowledge repository."

Response format:
- For direct factual questions, answer concisely in a short paragraph or a couple of sentences. Do not force structure onto a simple answer.
- For broader or exploratory questions about a topic, project, or department, structure the answer with markdown headings for whichever of these sections are relevant (skip ones that don't apply): ## Overview, ## Objectives, ## Documents, ## Teams, ## Timeline, ## Related Knowledge.
- Use markdown (headings, bullet lists, bold) where it improves readability.
`.trim();

function computeConfidence(chunks) {
  if (!chunks.length) return "low";
  const top = chunks.slice(0, 5);
  const avgDistance = top.reduce((sum, c) => sum + Number(c.distance ?? 1), 0) / top.length;
  if (avgDistance <= 0.18 && chunks.length >= 3) return "high";
  if (avgDistance <= 0.3) return "medium";
  return "low";
}

async function generateTitle(openai, question) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Generate a short, descriptive conversation title (max 6 words, no surrounding quotes, no trailing punctuation) summarizing the topic of this question. Respond with only the title.",
        },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });
    const title = res?.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
    return title || null;
  } catch {
    return null;
  }
}

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

  let isNewConversation = false;
  let activeTopic = null;
  let activeDocumentId = null;

  if (conversationId) {
    const conv = await prisma.orgConversation.findFirst({
      where: { id: conversationId, orgId, userId: user.id },
    });
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    activeTopic = conv.activeTopic;
    activeDocumentId = conv.activeDocumentId;
  } else {
    const conv = await prisma.orgConversation.create({
      data: { orgId, userId: user.id },
    });
    conversationId = conv.id;
    isNewConversation = true;
  }

  const userMsg = await prisma.orgMessage.create({
    data: { conversationId, role: "user", content: question },
  });

  const openai = new OpenAI({ apiKey });

  let sessionContextNote = "";
  if (activeDocumentId) {
    const activeDoc = await prisma.document.findUnique({
      where: { id: activeDocumentId },
      select: { filename: true },
    });
    if (activeDoc) {
      sessionContextNote = `The user was previously focused on the document "${activeDoc.filename}". `;
    }
  } else if (activeTopic) {
    sessionContextNote = `The user was previously discussing: "${activeTopic}". `;
  }
  const retrievalQuery = sessionContextNote
    ? `${sessionContextNote}Current question: ${question}`
    : question;

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: retrievalQuery,
  });
  const queryEmbedding = embRes.data[0].embedding;

  const chunks = await orgSearch(queryEmbedding, {
    userId: user.id,
    orgId,
    limit: 8,
    isSuperAdmin: isSuperAdmin(role),
  });

  const confidence = computeConfidence(chunks);

  const grouped = chunks.reduce((acc, c) => {
    const key = c.document_id;
    acc[key] = acc[key] || {
      documentId: c.document_id,
      filename: c.filename,
      filePath: c.filePath,
      department: c.department_name,
      project: c.project_name,
      texts: [],
    };
    acc[key].texts.push(String(c.text || "").slice(0, 600).replace(/\n+/g, " "));
    return acc;
  }, {});

  const groupedDocIds = Object.keys(grouped);
  let nextActiveTopic = activeTopic;
  let nextActiveDocumentId = activeDocumentId;
  if (groupedDocIds.length === 1) {
    nextActiveTopic = null;
    nextActiveDocumentId = groupedDocIds[0];
  } else if (groupedDocIds.length > 1) {
    nextActiveTopic = question.slice(0, 200);
    nextActiveDocumentId = null;
  }

  const sources = await Promise.all(
    Object.values(grouped).map(async (g) => ({
      documentId: g.documentId,
      filename: g.filename,
      department: g.department || null,
      project: g.project || null,
      url: g.filePath ? await generateSignedUrl(g.filePath).catch(() => null) : null,
    }))
  );

  const contextBlocks = Object.values(grouped).map(
    (g) => `Document: ${g.filename}${g.department ? ` (Department: ${g.department})` : ""}${g.project ? ` (Project: ${g.project})` : ""}\n${g.texts.map((t) => `- ${t}`).join("\n")}`
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
    { role: "user", content: `${sessionContextNote}Question: ${question}\n\nContext:\n${context}` },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("meta", { conversationId, sources, confidence });

        const titlePromise = isNewConversation ? generateTitle(openai, question) : null;

        const completionStream = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.3,
          max_tokens: 800,
          stream: true,
        });

        let answer = "";
        for await (const chunk of completionStream) {
          const delta = chunk?.choices?.[0]?.delta?.content || "";
          if (delta) {
            answer += delta;
            send("token", { text: delta });
          }
        }

        await prisma.orgMessage.create({
          data: { conversationId, role: "assistant", content: answer, confidence },
        });

        await prisma.orgConversation.update({
          where: { id: conversationId },
          data: { activeTopic: nextActiveTopic, activeDocumentId: nextActiveDocumentId },
        });

        if (titlePromise) {
          const title = await titlePromise;
          if (title) {
            await prisma.orgConversation.update({
              where: { id: conversationId },
              data: { title },
            });
            send("title", { title });
          }
        }

        send("done", {});
      } catch (err) {
        send("error", { message: err?.message || "Something went wrong while generating a response." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
