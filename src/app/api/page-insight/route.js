import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { getUserOpenAIKey } from "@/utils/key_helper";

export async function POST(req) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pageContent, pageNumber } = await req.json();

    if (!pageContent || !pageNumber)
      return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const apiKey = await getUserOpenAIKey(user.id);

    if (!apiKey)
      return NextResponse.json({ error: "OPENAI_KEY_MISSING" }, { status: 400 });

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a reading companion helping a user learn deeply from a document. The user has just finished reading page ${pageNumber}. You are given ONLY the content read so far — do not speculate about or reference anything beyond it. Respond in valid JSON only.`,
        },
        {
          role: "user",
          content: `Here is the document content read so far (up to page ${pageNumber}):\n\n${pageContent.slice(0, 12000)}\n\nProvide:\n1. 3-5 concise key points from what has been read\n2. 2-3 thoughtful questions to help the reader reflect\n\nJSON format: {"keyPoints": ["..."], "questions": ["..."]}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return NextResponse.json({
      success: true,
      keyPoints: parsed.keyPoints || [],
      questions: parsed.questions || [],
    });
  } catch (err) {
    console.error("❌ page-insight error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
