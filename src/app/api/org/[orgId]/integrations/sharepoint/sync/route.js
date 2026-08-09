import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// "Sync Now" (FR-3 MVP slice — manual trigger only, no cron scheduler yet).
// Per the NFR that sync jobs never run inline with a user-facing request,
// this route only creates a SyncRun row and enqueues a job — the actual
// Graph delta walk + ingest happens in worker/index.js's sharepoint_sync
// handler (Task 7-C).
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "sharepoint" } },
    select: { id: true, status: true },
  });
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ error: "SharePoint is not connected for this org" }, { status: 409 });
  }

  const syncRun = await prisma.syncRun.create({
    data: { integrationId: integration.id, status: "running" },
  });

  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({
        type: "sharepoint_sync",
        integrationId: integration.id,
        syncRunId: syncRun.id,
      }),
    })
  );

  return NextResponse.json({ syncRun });
}
