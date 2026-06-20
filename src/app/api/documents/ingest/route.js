// src/app/api/documents/ingest/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { resolveOrgRole } from "@/lib/orgGuard";
import { getUserSubscription } from "@/lib/subscription";

export async function POST(req) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const projectId    = formData.get("projectId")    || null;
    const s3Key        = formData.get("s3Key");
    const visibility   = formData.get("visibility")   || "private";
    const scope        = formData.get("scope")        || "private";
    const orgId        = formData.get("orgId")        || null;
    const departmentId = formData.get("departmentId") || null;
    const category     = formData.get("category")     || null;

    if (!s3Key)
      return NextResponse.json({ error: "Missing s3Key" }, { status: 400 });

    if (!["public", "private"].includes(visibility))
      return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });

    if (!["private", "project", "repository"].includes(scope))
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });

    // repository-scoped uploads require an orgId; all others require a projectId
    if (scope === "repository") {
      if (!orgId)
        return NextResponse.json({ error: "orgId is required for repository scope" }, { status: 400 });
    } else {
      if (!projectId)
        return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const filename = s3Key.split("/").pop();

    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!dbUser)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const userSubscription = await getUserSubscription(dbUser.id);

    if (!userSubscription || !userSubscription.plan) {
      return NextResponse.json(
        { error: "No active subscription" },
        { status: 403 }
      );
    }

    // Verify org membership before accepting a repository-scoped upload
    if (scope === "repository") {
      const { role } = await resolveOrgRole(session.user.email, orgId);
      if (!role)
        return NextResponse.json({ error: "Forbidden: not an org member" }, { status: 403 });
    }


    const s3 = new S3Client({ region: process.env.AWS_REGION });

    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
      })
    );

    const fileSizeBytes = head.ContentLength;

    if (!fileSizeBytes) {
      return NextResponse.json(
        { error: "Unable to determine file size" },
        { status: 400 }
      );
    }



    const planLimitBytes =
      userSubscription.plan.storageLimitGb * 1024 * 1024 * 1024;

    const currentUsage = BigInt(dbUser.storageUsedBytes);
    const incomingSize = BigInt(fileSizeBytes);
    const projectedUsage = currentUsage + incomingSize;

    if (projectedUsage > BigInt(planLimitBytes)) {
      return NextResponse.json(
        {
          error: "Storage limit exceeded",
          limitGb: userSubscription.plan.storageLimitGb,
          usedBytes: Number(currentUsage),
          incomingBytes: Number(incomingSize)
        },
        { status: 413 }
      );
    }

    // Document created with "queued" status
    const [doc] = await prisma.$transaction([
      prisma.document.create({
        data: {
          filename,
          filePath: s3Key,
          status: "queued",
          visibility,
          scope,
          ...(projectId    ? { project:      { connect: { id: projectId    } } } : {}),
          ...(orgId        ? { organization: { connect: { id: orgId        } } } : {}),
          ...(departmentId ? { department:   { connect: { id: departmentId } } } : {}),
          ...(category     ? { category }                                         : {}),
          user: { connect: { id: dbUser.id } },
        },
      }),
    
      prisma.user.update({
        where: { id: dbUser.id },
        data: {
          storageUsedBytes: {
            increment: fileSizeBytes
          }
        }
      })
    ]);

    // SQS client
    const sqs = new SQSClient({ region: process.env.AWS_REGION });

    // 🔥 NEW: 3-Stage Pipeline → initial job is ALWAYS "chunk"
    const messageBody = JSON.stringify({
      type: "chunk",      // STEP 1 in pipeline
      docId: doc.id,
      s3Key,
      filename,
      projectId,
      userId: dbUser.id,
      orgId,              // worker uses this to resolve the correct OpenAI API key
      visibility,
      regenerate: false
    });

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MessageBody: messageBody,
      })
    );

    return NextResponse.json({
      success: true,
      id: doc.id,
      status: "queued"
    });

  } catch (err) {
    console.error("❌ File ingestion failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
