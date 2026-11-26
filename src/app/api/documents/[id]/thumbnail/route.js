import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import s3Client from "@/lib/s3.mjs";
import { resolveOrgRole } from "@/lib/orgGuard";
import { canViewDocument } from "@/lib/access/documentAccess";
import { canStreamFromSource } from "@/lib/documentSource";
import { fetchDriveItemThumbnail, getCachedAppOnlyToken } from "@/lib/msGraph";
import { resolveDriveId } from "@/lib/connectors/sharepointLocate";
import { thumbnailKind } from "@/lib/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// EKP E13.3 (E-15): a document's card thumbnail (src/lib/thumbnails.js).
// The worker's JPEG for a stored file; SharePoint's own for a no-copy file.
// Same access rule as the document's file. 404 when there is none: the card
// shows its file-type icon instead.
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
const CACHE = "private, max-age=300";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true, userId: true, orgId: true, departmentId: true, lifecycle: true, filename: true, filePath: true, thumbnailPath: true,
      sourceProvider: true, contentType: true, externalId: true, externalUrl: true, scope: true, visibility: true, projectId: true, deletedAt: true,
      project: { select: { orgId: true, departmentId: true, scope: true } },
    },
  });
  if (!doc || doc.deletedAt) return notFound();

  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return notFound();
  const orgId = doc.orgId || doc.project?.orgId;
  if (doc.userId !== user.id) {
    if (!orgId) return notFound();
    const { role } = await resolveOrgRole(session.user.email, orgId);
    if (!role || !(await canViewDocument(doc, { userId: user.id, role }))) return notFound();
  }

  if (doc.thumbnailPath) {
    try {
      const object = await s3Client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: doc.thumbnailPath }));
      return new Response(object.Body.transformToWebStream(), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE, ...(object.ContentLength ? { "Content-Length": String(object.ContentLength) } : {}) },
      });
    } catch (err) {
      if (err?.name !== "NoSuchKey") console.error("Reading the thumbnail failed:", err.message);
      return notFound();
    }
  }

  // No-copy SharePoint file: SharePoint's thumbnail, passed through.
  if (!canStreamFromSource(doc) || !thumbnailKind(doc.filename) || !orgId) return notFound();
  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "sharepoint" } },
    select: { status: true, scopeConfig: true },
  });
  if (integration?.status !== "connected") return notFound();
  try {
    const accessToken = await getCachedAppOnlyToken(integration.scopeConfig?.tenantId);
    const driveId = await resolveDriveId(doc, { scopeConfig: integration.scopeConfig, accessToken });
    if (!driveId) return notFound();
    const upstream = await fetchDriveItemThumbnail({ accessToken, driveId, itemId: doc.externalId });
    return new Response(upstream.body, {
      headers: { "Content-Type": upstream.headers.get("content-type") || "image/jpeg", "Cache-Control": CACHE },
    });
  } catch (err) {
    if (err.status !== 404) console.error("SharePoint thumbnail failed:", err.message);
    return notFound();
  }
}
