// src/app/api/documents/[id]/regenerate/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveDocumentManagementAccess } from "@/lib/documentManagementPolicy";
import { FILE_PROBLEM_STATUSES, isProcessingStatus } from "@/lib/documentStatus";
import { firstMissingStage, pipelineState, STAGE_LABELS } from "@/lib/documentPipeline";
import { isMediaFile } from "@/lib/fileFormats";
import { queueRepair } from "@/lib/documentReprocess";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: documentId } = await params;

    console.log("Regenerate Document id: ", documentId)


    if (!documentId)
      return NextResponse.json({ error: "Missing document id" }, { status: 400 });

    const access = await resolveDocumentManagementAccess(session.user.email, documentId);
    if (!access.document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (!access.canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    if (isProcessingStatus(doc.status)) {
      return NextResponse.json(
        { error: "Document is currently being processed. Wait until processing completes before regenerating the summary." },
        { status: 409 }
      );
    }

    if (isMediaFile(doc.filename)) {
      return NextResponse.json(
        { error: "A recording's summary comes from its transcript. Regenerate the transcript's summary instead." },
        { status: 400 }
      );
    }

    if (FILE_PROBLEM_STATUSES.has(doc.status)) {
      return NextResponse.json(
        { error: "KMS can't read this file. Fix the file (see the document's status) and upload it again." },
        { status: 400 }
      );
    }

    // The worker's repair job finishes whatever processing is missing (text,
    // search index, summary, topic) from the first missing stage on, or, when
    // nothing is missing, regenerates the summary as before.
    const missing = firstMissingStage(doc, await pipelineState(prisma, doc));
    if (missing === "unrepairable") {
      return NextResponse.json(
        { error: "This document has no extracted text and its original file isn't available, so it can't be reprocessed. Upload it again." },
        { status: 400 }
      );
    }

    if (!(await queueRepair(prisma, doc, { regenerateSummary: true }))) {
      return NextResponse.json(
        { error: "Document is currently being processed. Wait until processing completes before regenerating the summary." },
        { status: 409 }
      );
    }
    console.log(`📄 Queued repair for document ${documentId}: ${missing ? `from ${missing}` : "summary only"}`);

    return NextResponse.json({
      success: true,
      id: documentId,
      status: "queued",
      repairing: missing ? STAGE_LABELS[missing] : null,
    });

  } catch (err) {
    console.error("❌ Regenerate summary failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
