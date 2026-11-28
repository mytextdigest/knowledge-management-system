import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { chunkLocation } from "@/lib/chunkLocation";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { InvalidFacetSelection } from "@/lib/taxonomy/facets.mjs";
import { search } from "@/lib/search/searchService";
import { expandQuery } from "@/lib/queryExpansion";
import { getOrgOpenAIKey } from "@/utils/key_helper";

function normalizeScope(scope) {
  return ["personal", "department", "organization"].includes(scope)
    ? scope
    : "organization";
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
  const query = body.query?.trim();
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 8, 1), 20);
  const scope = normalizeScope(body.scope);
  const departmentId = body.departmentId || null;

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const apiKey = await getOrgOpenAIKey(orgId);
  if (!apiKey) {
    return NextResponse.json({ error: "ORG_OPENAI_KEY_MISSING" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });
  const expandedQueries = await expandQuery(openai, query);

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: expandedQueries,
  });
  const queryEmbeddings = embRes.data.map((item) => item.embedding);

  let response;
  try { response = await search({
    kind: "search",
    facetSelections: body.facetSelections ?? {},
    filters: body.filters && typeof body.filters === "object" ? body.filters : {},
    query,
    queries: expandedQueries,
    embeddings: queryEmbeddings,
    userId: user.id,
    orgId,
    limit,
    scope,
    departmentId,
    isSuperAdmin: isSuperAdmin(role),
    exactTermQuestion: query,
    ontologyEnabled: body.ontologyEnabled === false && isSuperAdmin(role) ? false : true,
  });

  } catch (error) {
    if (error instanceof InvalidFacetSelection) return NextResponse.json({error:error.message},{status:400});
    throw error;
  }
  const {results:rows,searchEventId,facets}=response;
  return NextResponse.json({
    searchEventId,
    facets,
    retrieval: {
      mode: "hybrid",
      scope,
      expandedQueries,
    },
    results: rows.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      text: r.text,
      summary: r.summary,
      chunkIndex: r.chunk_index,
      metadata: r.metadata,
      ...chunkLocation(r), // E-9: locator "slide 7" / "12:34" and viewerUrl
      filename: r.filename,
      category: r.category,
      department: r.department_name,
      scope: r.scope,
      distance: r.distance,
      keywordScore: r.keyword_score,
      hybridScore: r.hybridScore,
      mayBeOutdated: Boolean(r.mayBeOutdated),
    })),
  });
}
