import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveOpenAIKey } from "@/utils/key_helper";
import { createPageInsight } from "../../../../worker/summarize.js";

export async function POST(req) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pageContent, pageNumber, orgId } = await req.json();

    if (!pageContent || !pageNumber) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const apiKey = await resolveOpenAIKey({
      userId: user.id,
      orgId,
    });

    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_KEY_MISSING" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const insight = await createPageInsight(openai, pageContent, pageNumber);

    return NextResponse.json({
      success: true,
      keyPoints: insight.keyPoints,
      questions: insight.questions,
    });
  } catch (err) {
    console.error("Page insight failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate page insight" },
      { status: 500 }
    );
  }
}
