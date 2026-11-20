import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";

// EKP A-17: ServiceNow "Sync Now". Like SharePoint's, this route only creates
// a SyncRun row and enqueues a job; worker/index.js's servicenow_sync handler
// reads the articles.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "servicenow" } },
    select: { id: true, status: true },
  });
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ error: "ServiceNow is not connected for this org" }, { status: 409 });
  }

  const syncRun = await prisma.syncRun.create({
    data: { integrationId: integration.id, status: "running" },
  });

  const sqs = new SQSClient({ region: process.env.AWS_REGION });
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({
        type: "servicenow_sync",
        integrationId: integration.id,
        syncRunId: syncRun.id,
      }),
    })
  );

  return NextResponse.json({ syncRun });
}
