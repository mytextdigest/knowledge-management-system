import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { listKnowledgeBases } from "@/lib/connectors/servicenowApi";
import { serviceNowConnection } from "@/lib/connectors/servicenow";

// EKP A-17: the instance's active knowledge bases, read with the stored
// credentials, for editing the knowledge-base → department mapping.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const integration = await prisma.orgIntegration.findUnique({
    where: { orgId_provider: { orgId, provider: "servicenow" } },
  });
  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ error: "ServiceNow is not connected for this org" }, { status: 409 });
  }

  try {
    return NextResponse.json({ knowledgeBases: await listKnowledgeBases(serviceNowConnection(integration)) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
