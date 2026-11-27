// Slide previews for PowerPoint decks (src/lib/slidePreview.js): the deck as
// designed, as a PDF with one page per slide.
//   GET  → { status: "ready", url } | { status: "missing" } (stored deck, not rendered yet)
//          | { status: "unavailable" } (no file to render)
//   POST → asks the worker to render a stored deck → { status: "rendering" }
// Same access rule as the document's file (uploader, or the F1 browse policy).
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";
import s3Client from "@/lib/s3.mjs";
import { generateSignedUrl } from "@/lib/s3SignedUrl";
import { resolveOrgRole } from "@/lib/orgGuard";
import { canViewDocument } from "@/lib/access/documentAccess";
import { canStreamFromSource, sourcePreviewUrl } from "@/lib/documentSource";
import { isSlideDeck, slidePreviewKey } from "@/lib/slidePreview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function viewableDeck(req, params) {
  const session = await getServerSession();
  if (!session?.user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true, userId: true, orgId: true, departmentId: true, lifecycle: true, filename: true, filePath: true,
      sourceProvider: true, contentType: true, externalId: true, externalUrl: true, scope: true, visibility: true, projectId: true,
      project: { select: { orgId: true, departmentId: true, scope: true } },
    },
  });
  const notFound = { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!doc || !isSlideDeck(doc.filename)) return notFound;

  const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!user) return notFound;
  if (doc.userId !== user.id) {
    const orgId = doc.orgId || doc.project?.orgId;
    if (!orgId) return notFound;
    const { role } = await resolveOrgRole(session.user.email, orgId);
    if (!role || !(await canViewDocument(doc, { userId: user.id, role }))) return notFound;
  }
  return { doc };
}

export async function GET(req, { params }) {
  const { doc, error } = await viewableDeck(req, params);
  if (error) return error;

  if (doc.filePath) {
    const key = slidePreviewKey(doc.id);
    const exists = await s3Client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })).then(() => true, () => false);
    return NextResponse.json(exists ? { status: "ready", url: await generateSignedUrl(key) } : { status: "missing" });
  }
  // No-copy SharePoint deck: SharePoint converts it to PDF on request.
  if (canStreamFromSource(doc)) return NextResponse.json({ status: "ready", url: `${sourcePreviewUrl(doc.id)}?format=pdf` });
  return NextResponse.json({ status: "unavailable" });
}

export async function POST(req, { params }) {
  const { doc, error } = await viewableDeck(req, params);
  if (error) return error;
  if (!doc.filePath) return NextResponse.json({ status: "unavailable" });

  // The worker skips decks that already have a preview, so a repeat is harmless.
  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify({ type: "slide_preview", docId: doc.id }),
  }));
  return NextResponse.json({ status: "rendering" });
}
