import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { resolveOrgRole } from "@/lib/orgGuard";
import { orgSearch } from "@/lib/vectorSearch";
import { getOrgOpenAIKey } from "@/utils/key_helper";

export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const query = body.query?.trim();
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 8, 1), 20);

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = await getOrgOpenAIKey(orgId);
  if (!apiKey) {
    return NextResponse.json({ error: "ORG_OPENAI_KEY_MISSING" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });
  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embRes.data[0].embedding;

  const rows = await orgSearch(queryEmbedding, { userId: user.id, orgId, limit });

  return NextResponse.json({
    results: rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      text: r.text,
      summary: r.summary,
      chunkIndex: r.chunk_index,
      metadata: r.metadata,
      filename: r.filename,
      category: r.category,
      department: r.department_name,
      scope: r.scope,
      distance: r.distance,
    })),
  });
}
