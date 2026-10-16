import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveOpenAIKey } from "@/utils/key_helper";
import { resolveOrgRole } from "@/lib/orgGuard";
import { createPageInsight } from "../../../../worker/summarize.js";

export async function POST(req) {
  try {
    const session = await getServerSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pageContent, pageNumber, documentId } = await req.json();

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

    // Resolve the document's org from the DB rather than trusting a
    // client-supplied orgId, so we bill the correct org's OpenAI key (and a
    // caller can't point this at an org they don't belong to).
    let orgId = null;
    if (documentId) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { userId: true, orgId: true, project: { select: { orgId: true } } },
      });

      const candidateOrgId = doc?.orgId || doc?.project?.orgId || null;
      if (doc && candidateOrgId) {
        const { role } = await resolveOrgRole(session.user.email, candidateOrgId);
        if (role) orgId = candidateOrgId;
      }
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
