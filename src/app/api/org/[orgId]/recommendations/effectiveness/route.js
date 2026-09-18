import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin, canManageDepartment } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const departmentId = new URL(req.url).searchParams.get("departmentId") || null;
  if (departmentId) {
    const allowed = isSuperAdmin(role) || (
      role === "dept_admin" && await canManageDepartment(role, departmentId, user.id)
    );
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (!isSuperAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await prisma.$queryRaw`
    WITH impressions AS (
      SELECT di."documentId",
        COUNT(*)::int AS impressions,
        MIN(di."created_at") AS "firstImpressionAt"
      FROM "DocumentInteraction" di
      JOIN "Document" d ON d.id = di."documentId"
      LEFT JOIN "Project" p ON p.id = d."projectId"
      WHERE di."orgId" = ${orgId}
        AND di.type = 'recommendation_impression'
        AND di."created_at" >= ${since}
        AND (${departmentId}::text IS NULL OR COALESCE(d."departmentId", p."departmentId") = ${departmentId})
        AND d.lifecycle = 'published'
        AND (
          d.scope = 'repository'
          OR (d."projectId" IS NOT NULL AND p.scope = 'org' AND p."orgId" = ${orgId})
        )
      GROUP BY di."documentId"
    ), engagements AS (
      SELECT di."documentId", COUNT(*)::int AS engagements
      FROM "DocumentInteraction" di
      JOIN impressions i ON i."documentId" = di."documentId"
      WHERE di."orgId" = ${orgId}
        AND di.type IN ('view','download')
        AND di."created_at" >= i."firstImpressionAt"
      GROUP BY di."documentId"
    )
    SELECT d.id, d.filename, i.impressions, COALESCE(e.engagements, 0)::int AS engagements
    FROM impressions i
    JOIN "Document" d ON d.id = i."documentId"
    LEFT JOIN engagements e ON e."documentId" = i."documentId"
    ORDER BY i.impressions DESC
    LIMIT 10
  `;

  const items = rows.map((row) => ({
    documentId: row.id,
    filename: row.filename || "Untitled document",
    impressions: Number(row.impressions || 0),
    engagements: Number(row.engagements || 0),
    zeroClickThrough: Number(row.engagements || 0) === 0,
  }));

  // Org-wide totals across every recommended document in the window, not just
  // the top 10 shown above - the top-10 list is for "what's popular", these
  // totals are for "how much recommendation activity happened overall".
  const [totals] = await prisma.$queryRaw`
    WITH impressions AS (
      SELECT di."documentId",
        COUNT(*)::int AS impressions,
        MIN(di."created_at") AS "firstImpressionAt"
      FROM "DocumentInteraction" di
      JOIN "Document" d ON d.id = di."documentId"
      LEFT JOIN "Project" p ON p.id = d."projectId"
      WHERE di."orgId" = ${orgId}
        AND di.type = 'recommendation_impression'
        AND di."created_at" >= ${since}
        AND (${departmentId}::text IS NULL OR COALESCE(d."departmentId", p."departmentId") = ${departmentId})
        AND d.lifecycle = 'published'
        AND (
          d.scope = 'repository'
          OR (d."projectId" IS NOT NULL AND p.scope = 'org' AND p."orgId" = ${orgId})
        )
      GROUP BY di."documentId"
    ), engagements AS (
      SELECT di."documentId", COUNT(*)::int AS engagements
      FROM "DocumentInteraction" di
      JOIN impressions i ON i."documentId" = di."documentId"
      WHERE di."orgId" = ${orgId}
        AND di.type IN ('view','download')
        AND di."created_at" >= i."firstImpressionAt"
      GROUP BY di."documentId"
    )
    SELECT
      COALESCE(SUM(i.impressions), 0)::int AS "totalImpressions",
      COUNT(*)::int AS "totalDocuments",
      COUNT(*) FILTER (WHERE COALESCE(e.engagements, 0) = 0)::int AS "totalZeroClick"
    FROM impressions i
    LEFT JOIN engagements e ON e."documentId" = i."documentId"
  `;

  return NextResponse.json({
    periodDays: 30,
    items,
    totalImpressions: Number(totals?.totalImpressions || 0),
    totalDocumentsRecommended: Number(totals?.totalDocuments || 0),
    zeroClickThroughCount: Number(totals?.totalZeroClick || 0),
  });
}
