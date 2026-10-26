import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { canViewDocument } from "@/lib/access/documentAccess";
import { canStreamFromSource } from "@/lib/documentSource";
import { fetchDriveItemContent, getCachedAppOnlyToken } from "@/lib/msGraph";
import { resolveDriveId } from "@/lib/connectors/sharepointLocate";

// EKP A-14: stream a no-copy document's file from SharePoint, so preview and
// download work without KMS storing the original. Same access rule as the
// document page (uploader, or the F1 browse policy including the file's
// SharePoint permissions). ?download=1 sends it as an attachment.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true, userId: true, orgId: true, departmentId: true, lifecycle: true, filename: true, filePath: true,
      sourceProvider: true, contentType: true, externalId: true, externalUrl: true,
      project: { select: { orgId: true, departmentId: true, scope: true } },
    },
  });
  if (!doc?.orgId || !canStreamFromSource(doc)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { user, role } = await resolveOrgRole(session.user.email, doc.orgId);
  if (!user || !role) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.userId !== user.id && !(await canViewDocument(doc, { userId: user.id, role }))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId: doc.orgId, provider: "sharepoint" } },
    select: { status: true, scopeConfig: true },
  });
  if (integration?.status !== "connected") {
    return NextResponse.json({ error: "SharePoint isn't connected" }, { status: 409 });
  }

  let upstream;
  try {
    const accessToken = await getCachedAppOnlyToken(integration.scopeConfig?.tenantId);
    const driveId = await resolveDriveId(doc, { scopeConfig: integration.scopeConfig, accessToken });
    if (!driveId) return NextResponse.json({ error: "This file's SharePoint site is no longer connected" }, { status: 404 });
    upstream = await fetchDriveItemContent({ accessToken, driveId, itemId: doc.externalId });
  } catch (err) {
    console.error("SharePoint preview failed:", err.message);
    const status = err.status === 404 ? 404 : 502;
    return NextResponse.json({ error: status === 404 ? "The file no longer exists in SharePoint" : "Couldn't read the file from SharePoint" }, { status });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  const filename = (doc.filename || "document").replace(/["\r\n]/g, "");
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
