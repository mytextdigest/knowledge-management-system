import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isOrgAdmin } from "@/lib/orgGuard";
import { orgSearch } from "@/lib/vectorSearch";
import { resolveOpenAIKey } from "@/utils/key_helper";

const PAGE_SIZE = 20;

const FILE_TYPE_EXTS = {
  pdf: [".pdf"],
  spreadsheet: [".xlsx", ".xls", ".csv"],
  doc: [".docx", ".doc"],
  text: [".txt", ".md"],
};

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const deptFilter =
  searchParams.get("departmentId") ||
  searchParams.get("dept") ||
  null;
  const category    = searchParams.get("category")  || null;
  const lifecycle   = searchParams.get("lifecycle") || null;
  const fileType    = searchParams.get("fileType")  || null;
  const dateFrom    = searchParams.get("dateFrom")  || null;
  const dateTo      = searchParams.get("dateTo")    || null;
  const search      = searchParams.get("search")    || null;
  const page        = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // Resolve user's department memberships for RBAC
  const memberships = await prisma.departmentMember.findMany({
    where: { userId: user.id },
    select: { departmentId: true },
  });
  const userDeptIds = memberships.map((m) => m.departmentId);

  // Source A: documents directly scoped to the org repository
  // Org admins can see every department's docs; everyone else only sees
  // org-wide docs (no dept) or docs in their own depts
  const sourceA = isOrgAdmin(role)
    ? { scope: "repository", orgId }
    : {
        scope: "repository",
        orgId,
        OR: [
          { departmentId: null },
          { departmentId: { in: userDeptIds } },
        ],
      };

  // Source B: documents from projects promoted to org scope.
  // Keep listing visibility aligned with the document detail route: for
  // non-admins, org promotion does not bypass the project's department gate.
  const sourceB = isOrgAdmin(role)
    ? { project: { scope: "org", orgId } }
    : {
        project: {
          scope: "org",
          orgId,
          departmentId: { in: userDeptIds },
        },
      };

  const andConditions = [{ OR: [sourceA, sourceB] }];

  // Non-admins cannot see draft docs
  if (lifecycle === "suggested_review") {
    andConditions.push({ lifecycleSuggestion: { not: null } });
    if (!isOrgAdmin(role)) andConditions.push({ lifecycle: { not: "draft" } });
  } else if (lifecycle) {
    andConditions.push({ lifecycle });
  } else if (!isOrgAdmin(role)) {
    andConditions.push({ lifecycle: { not: "draft" } });
  }

  if (category) andConditions.push({ category });
  if (deptFilter) {
    // A document's department can come directly (repository-scoped docs) or
    // only via its project (project-scoped docs have Document.departmentId
    // = null; the department lives on Project.departmentId instead) — match
    // both, or every project-scoped document silently vanishes from this
    // department's listing. Same root cause/fix as scopeSql in vectorSearch.js.
    andConditions.push({
      OR: [
        { departmentId: deptFilter },
        { project: { departmentId: deptFilter } },
      ],
    });
  }

  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.gte = new Date(dateFrom);
    if (dateTo) {
      // dateTo is a date-only string (e.g. "2026-06-29"); new Date() parses it
      // as UTC midnight, which would exclude same-day uploads made later that
      // day. Push the bound to the end of that calendar day instead.
      const end = new Date(dateTo);
      end.setUTCHours(23, 59, 59, 999);
      range.lte = end;
    }
    andConditions.push({ createdAt: range });
  }

  const extList = fileType && fileType !== "all" ? FILE_TYPE_EXTS[fileType] : null;
  if (extList) {
    andConditions.push({
      OR: extList.map((ext) => ({
        filename: { endsWith: ext, mode: "insensitive" },
      })),
    });
  }

  // Semantic search: rank candidate documents by chunk-embedding similarity
  // to the query, scoped by the same RBAC rules as chat/recommendations, then
  // restrict the listing to that candidate set. If no embedding key is
  // configured or the embedding call fails, fall back to a plain substring
  // match so search still returns something rather than erroring out.
  let rankMap = null;
  const trimmedSearch = search?.trim() || null;

  if (trimmedSearch) {
    let candidateIds = null;

    try {
      const apiKey = await resolveOpenAIKey({ userId: user.id, orgId });
      if (apiKey) {
        const openai = new OpenAI({ apiKey });
        const embRes = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: trimmedSearch,
        });
        const queryEmbedding = embRes.data[0].embedding;

        const rows = await orgSearch(queryEmbedding, {
          userId: user.id,
          orgId,
          limit: 200,
          isSuperAdmin: isOrgAdmin(role),
          scope: deptFilter ? "department" : "organization",
          departmentId: deptFilter,
        });

        const seen = new Set();
        candidateIds = [];
        for (const row of rows) {
          if (seen.has(row.document_id)) continue;
          seen.add(row.document_id);
          candidateIds.push(row.document_id);
        }
      }
    } catch (err) {
      console.error("Semantic search embedding failed, falling back to text search:", err);
    }

    if (candidateIds) {
      rankMap = new Map(candidateIds.map((id, idx) => [id, idx]));
      andConditions.push({ id: { in: candidateIds.length ? candidateIds : ["__no_match__"] } });
    } else {
      andConditions.push({
        OR: [
          { filename: { contains: trimmedSearch, mode: "insensitive" } },
          { content: { contains: trimmedSearch, mode: "insensitive" } },
          { summary: { contains: trimmedSearch, mode: "insensitive" } },
        ],
      });
    }
  }

  const where = { AND: andConditions };

  const documentSelect = {
    id: true,
    filename: true,
    status: true,
    scope: true,
    lifecycle: true,
    category: true,
    categoryConfidence: true,
    classificationStatus: true,
    suggestedDepartmentId: true,
    departmentSuggestionConfidence: true,
    lifecycleSuggestion: true,
    lifecycleSuggestionReason: true,
    lifecycleSuggestedAt: true,
    orgId: true,
    departmentId: true,
    createdAt: true,
    user:       { select: { id: true, name: true, email: true } },
    department: { select: { id: true, name: true } },
    project:    { select: { id: true, name: true, scope: true } },
    suggestedDepartment: { select: { id: true, name: true } },
    projectLinks: {
      where: { status: "suggested" },
      select: {
        id: true,
        confidence: true,
        evidence: true,
        status: true,
        project: { select: { id: true, name: true, departmentId: true } },
      },
      orderBy: { confidence: "desc" },
    },
    duplicatesAsDocument: {
      where: { status: "pending" },
      select: {
        id: true, similarity: true, status: true,
        duplicateOf: { select: { id: true, filename: true } },
      },
      orderBy: { similarity: "desc" },
    },
    _count: { select: { relationshipsFrom: true, relationshipsTo: true } },
  };

  let docs, total;

  if (rankMap) {
    // Prisma can't ORDER BY an arbitrary id list, so rank in memory. The
    // candidate set is already bounded (limit: 200 above), so fetching it in
    // full before paginating is cheap.
    const allMatches = await prisma.document.findMany({ where, select: documentSelect });
    allMatches.sort((a, b) => rankMap.get(a.id) - rankMap.get(b.id));
    total = allMatches.length;
    docs = allMatches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    [docs, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: documentSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.document.count({ where }),
    ]);
  }

  return NextResponse.json({
    documents: docs.map((d) => ({
      ...d,
      relatedDocumentCount: (d._count?.relationshipsFrom || 0) + (d._count?.relationshipsTo || 0),
      _count: undefined,
      createdAt: d.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  });
}
