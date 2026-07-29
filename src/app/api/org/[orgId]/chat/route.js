import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { hybridOrgSearch } from "@/lib/hybridSearch";
import { expandQuery } from "@/lib/queryExpansion";
import { extractQuestionEntities } from "@/lib/entityExtraction";
import { getRecentMemory, recordMemoryTopics } from "@/lib/orgMemberMemory";
import { getOrgOpenAIKey } from "@/utils/key_helper";
import { generateSignedUrl } from "@/lib/s3SignedUrl";
import { classifyWorkflowRequest, formatWorkflowInstruction, getWorkflowSteps } from "@/lib/workflowAssistance";
import { isDecisionQuestion, getDecisionEvidence, formatDecisionContext, DECISION_INSTRUCTION } from "@/lib/decisionIntelligence";

const SYSTEM_PROMPT = `
You are an expert assistant that answers questions using only the
organization's knowledge repository context provided below.

Do NOT invent factual information that is not supported by the context.
If the answer cannot be found in the context, say:
"I cannot answer that based on the organization's knowledge repository."

Response format:
- For direct factual questions, answer concisely in a short paragraph or a couple of sentences. Do not force structure onto a simple answer.
- For broader or exploratory questions about a topic, project, or department, structure the answer with markdown headings for whichever of these sections are relevant (skip ones that don't apply): ## Overview, ## Objectives, ## Documents, ## Teams, ## Timeline, ## Related Knowledge.
- When context spans multiple projects or departments, explicitly compare and synthesize the sources. Identify agreements, differences, dependencies, and unresolved gaps without blending unsupported claims together.
- Use markdown (headings, bullet lists, bold) where it improves readability.
`.trim();

function normalizeScope(scope) {
  return ["personal", "department", "organization"].includes(scope)
    ? scope
    : "organization";
}


function shouldDiversifyAcrossProjects(question, scope) {
  if (scope !== "organization") return false;
  const normalized = String(question || "").toLowerCase();
  const crossProjectSignals = [
    /\bacross\b/,
    /\bcompare\b/,
    /\bcombined?\b/,
    /\borganization[- ]wide\b/,
    /\ball projects?\b/,
    /\bmultiple projects?\b/,
    /\bdepartments?\b/,
    /\bportfolio\b/,
    /\bshared knowledge\b/,
    /\bdependencies\b/,
    /\bcommon themes?\b/,
  ];
  return crossProjectSignals.some((pattern) => pattern.test(normalized));
}

function computeConfidence(chunks) {
  if (!chunks.length) return "low";
  const top = chunks.slice(0, 5);
  const avgDistance = top.reduce((sum, c) => {
    const vectorDistance = Number(c.distance ?? 1);
    // Chunks surfaced only by keyword search carry a placeholder distance
    // of 1 (no cosine distance exists for a keyword-only hit), which would
    // otherwise score a genuine keyword match as if it were unrelated. A
    // real keyword hit (keywordScore > 0) is treated as at least as strong
    // as a solid vector match instead.
    const hasKeywordMatch = Number(c.keywordScore ?? c.keyword_score ?? 0) > 0;
    const effectiveDistance = hasKeywordMatch ? Math.min(vectorDistance, 0.15) : vectorDistance;
    return sum + effectiveDistance;
  }, 0) / top.length;
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
  const body = await req.json().catch(() => ({}));
  const question = body.question?.trim();
  const scope = normalizeScope(body.scope);
  const departmentId = body.departmentId || null;
  let conversationId = body.conversationId || null;

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) {
    // Authenticated user, but not a member of this org — log the denied
    // attempt so the audit trail can surface access-denied probing, not
    // just successfully-answered queries. Best-effort: a logging failure
    // (e.g. bad orgId) must not prevent the 403 from being returned.
    await prisma.chatAuditLog
      .create({
        data: {
          orgId,
          userId: user.id,
          question: question || "",
          citedDocIds: [],
          outcome: "denied",
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  let activeWorkflowDocumentId = null;
  let activeWorkflowStep = null;

  if (conversationId) {
    const conv = await prisma.orgConversation.findFirst({
      where: { id: conversationId, orgId, userId: user.id },
    });
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    activeTopic = conv.activeTopic;
    activeDocumentId = conv.activeDocumentId;
    activeWorkflowDocumentId = conv.activeWorkflowDocumentId;
    activeWorkflowStep = conv.activeWorkflowStep;
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

  // FR-P2-2 (query-time): entities named in the question itself, used below
  // as both extra retrieval signal and prompt context.
  const questionEntities = await extractQuestionEntities(openai, question);

  // FR-P2-5: recent topics this user has discussed in *other* conversations
  // (OrgMemberMemory is scoped by orgId+userId, not conversationId) — the
  // cross-conversation counterpart to activeTopic/activeDocumentId below.
  const recentMemory = await getRecentMemory(orgId, user.id);
  const memoryTopics = recentMemory
    .map((m) => m.topic)
    .filter((topic) => topic !== activeTopic);

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
  if (questionEntities.length > 0) {
    sessionContextNote += `Entities mentioned in this question: ${questionEntities.map((e) => `${e.name} (${e.type})`).join(", ")}. `;
  }
  if (memoryTopics.length > 0) {
    sessionContextNote += `The user has previously asked about these topics in other conversations: ${memoryTopics.join(", ")}. `;
  }
  const retrievalQuery = sessionContextNote
    ? `${sessionContextNote}Current question: ${question}`
    : question;

  const expandedQueries = await expandQuery(openai, retrievalQuery);

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: expandedQueries,
  });
  const queryEmbeddings = embRes.data.map((item) => item.embedding);

  // Entity names + recalled memory topics widen the keyword-search leg of
  // retrieval (RBAC stays enforced in orgKeywordSearch's SQL WHERE, same as
  // every other query in `queries`) — they don't get their own embeddings,
  // just ride along as extra keyword candidates.
  const extraKeywordQueries = [...new Set([...questionEntities.map((e) => e.name), ...memoryTopics])].filter(
    (q) => !expandedQueries.includes(q)
  );

  const requestedDiversify = shouldDiversifyAcrossProjects(question, scope);
  const workflowRequest = classifyWorkflowRequest(question, Boolean(activeWorkflowDocumentId));
  let workflowInstruction = "";
  let nextWorkflowDocumentId = activeWorkflowDocumentId;
  let nextWorkflowStep = activeWorkflowStep;
  let chunks = [];

  // FR-P3-2: decision-oriented questions get past `Decision` rows as grounding
  // evidence, same RBAC-scoped-retrieval pattern as the chunk search below.
  const decisionEvidence = isDecisionQuestion(question)
    ? await getDecisionEvidence({
        question,
        orgId,
        userId: user.id,
        isSuperAdmin: isSuperAdmin(role),
        scope,
        departmentId,
      })
    : [];
  const decisionContext = formatDecisionContext(decisionEvidence);

  if (activeWorkflowDocumentId && workflowRequest.action !== "none") {
    const workflowDocument = await prisma.document.findFirst({
      where: {
        id: activeWorkflowDocumentId,
        orgId,
        OR: [
          {
            scope: "repository",
            lifecycle: "published",
            ...(isSuperAdmin(role)
              ? {}
              : { OR: [{ departmentId: null }, { department: { members: { some: { userId: user.id } } } }] }),
          },
          {
            project: {
              scope: "org",
              orgId,
              ...(isSuperAdmin(role)
                ? {}
                : { department: { members: { some: { userId: user.id } } } }),
            },
          },
        ],
      },
      select: { id: true, filename: true, filePath: true, summary: true, content: true },
    });
    const steps = getWorkflowSteps(workflowDocument?.summary);

    if (workflowRequest.action === "stop") {
      workflowInstruction = "Acknowledge that the guided workflow has stopped. Do not provide another step unless the user asks to restart it.";
      nextWorkflowDocumentId = null;
      nextWorkflowStep = null;
    } else if (workflowDocument && steps.length >= 3) {
      let stepIndex = Number.isInteger(activeWorkflowStep) ? activeWorkflowStep : 0;
      if (workflowRequest.action === "next") stepIndex = Math.min(stepIndex + 1, steps.length - 1);
      if (workflowRequest.action === "previous") stepIndex = Math.max(stepIndex - 1, 0);
      if (workflowRequest.action === "restart") stepIndex = 0;
      nextWorkflowStep = stepIndex;
      workflowInstruction = formatWorkflowInstruction({
        filename: workflowDocument.filename || "workflow document",
        steps,
        stepIndex,
      });
      chunks = [{
        id: `workflow:${workflowDocument.id}:${stepIndex}`,
        document_id: workflowDocument.id,
        filename: workflowDocument.filename,
        filePath: workflowDocument.filePath,
        text: steps[stepIndex],
        distance: 0,
        keywordScore: 1,
        hybridScore: 1,
      }];
    } else {
      nextWorkflowDocumentId = null;
      nextWorkflowStep = null;
    }
  }

  if (chunks.length === 0 && workflowRequest.action !== "stop") {
    chunks = await hybridOrgSearch({
      queries: [...expandedQueries, ...extraKeywordQueries],
      embeddings: queryEmbeddings,
      userId: user.id,
      orgId,
      limit: 8,
      scope,
      departmentId,
      isSuperAdmin: isSuperAdmin(role),
      diversify: requestedDiversify,
      feedbackQuestion: question,
    });

    if (workflowRequest.action === "start") {
      const candidateIds = [...new Set(chunks.map((chunk) => chunk.document_id).filter(Boolean))];
      const candidates = await prisma.document.findMany({
        where: { id: { in: candidateIds }, orgId, lifecycle: "published" },
        select: { id: true, filename: true, summary: true },
      });
      const byId = new Map(candidates.map((document) => [document.id, document]));
      for (const chunk of chunks) {
        const document = byId.get(chunk.document_id);
        const steps = getWorkflowSteps(document?.summary);
        if (document && steps.length >= 3) {
          nextWorkflowDocumentId = document.id;
          nextWorkflowStep = 0;
          workflowInstruction = formatWorkflowInstruction({
            filename: document.filename || "workflow document",
            steps,
            stepIndex: 0,
          });
          break;
        }
      }
    }
  }

  // Reflects what actually happened, not just the keyword-based request above
  // — hybridOrgSearch can also diversify on its own when the retrieved
  // context is naturally multi-source, even without a keyword match here.
  const crossProjectSynthesis =
    scope === "organization" &&
    new Set(chunks.map((c) => c.projectId || c.departmentId || c.document_id)).size >= 2;

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

  const documentSources = await Promise.all(
    Object.values(grouped).map(async (g) => ({
      documentId: g.documentId,
      filename: g.filename,
      department: g.department || null,
      project: g.project || null,
      preview: g.texts.join(" ").slice(0, 900),
      url: g.filePath ? await generateSignedUrl(g.filePath).catch(() => null) : null,
    }))
  );

  // FR-P3-2: surface decision evidence as its own citation type so the UI can
  // visually distinguish "grounded in a tracked Decision" from a regular
  // document citation, instead of it only being readable in the prose.
  const decisionSources = decisionEvidence.map((d) => ({
    type: "decision",
    documentId: d.documentId,
    filename: d.filename,
    department: d.departmentName || null,
    project: d.projectName || null,
    statement: d.statement,
    rationale: d.rationale || null,
  }));

  const sources = [...decisionSources, ...documentSources];

  const contextBlocks = Object.values(grouped).map(
    (g) => `Document: ${g.filename}${g.department ? ` (Department: ${g.department})` : ""}${g.project ? ` (Project: ${g.project})` : ""}\n${g.texts.map((t) => `- ${t}`).join("\n")}`
  );
  const context = [
    ...(decisionContext ? [decisionContext] : []),
    ...(contextBlocks.length > 0
      ? contextBlocks
      : ["No relevant organization documents were found for this question."]),
  ].join("\n\n");

  const prevMsgs = await prisma.orgMessage.findMany({
    where: { conversationId, createdAt: { lt: userMsg.createdAt } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  prevMsgs.reverse();

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...prevMsgs.map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `${sessionContextNote}${workflowInstruction ? `${workflowInstruction}\n\n` : ""}${decisionContext ? `${DECISION_INSTRUCTION}\n\n` : ""}Question: ${question}\n\nContext:\n${context}`,
    },
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("meta", { conversationId, sources, confidence, crossProjectSynthesis });

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

        const assistantMessage = await prisma.orgMessage.create({
          data: { conversationId, role: "assistant", content: answer, sources, confidence },
        });

        await prisma.chatAuditLog.create({
          data: {
            orgId,
            userId: user.id,
            question,
            citedDocIds: [...new Set(sources.map((s) => s.documentId).filter(Boolean))],
            outcome: "answered",
          },
        });

        await prisma.orgConversation.update({
          where: { id: conversationId },
          data: {
            activeTopic: nextActiveTopic,
            activeDocumentId: nextActiveDocumentId,
            activeWorkflowDocumentId: nextWorkflowDocumentId,
            activeWorkflowStep: nextWorkflowStep,
          },
        });

        if (questionEntities.length > 0) {
          await prisma.entity.createMany({
            data: questionEntities.map((e) => ({ conversationId, name: e.name, type: e.type })),
          });
        }

        // FR-P2-5: remember the entities from this question for cross-conversation
        // recall on a future, different conversation.
        await recordMemoryTopics(orgId, user.id, questionEntities.map((e) => e.name));

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

        send("done", { messageId: assistantMessage.id });
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
