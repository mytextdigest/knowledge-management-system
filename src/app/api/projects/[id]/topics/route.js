import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { resolveOrgRole } from "@/lib/orgGuard";

export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, orgId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify the requesting user is a member of the project's org
  const { role } = await resolveOrgRole(session.user.email, project.orgId);
  if (!role) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const topics = await prisma.topic.findMany({
    where: { projectId },
    select: {
      id:            true,
      name:          true,
      documentCount: true,
      createdAt:     true,
      updatedAt:     true,
    },
    orderBy: [{ documentCount: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(topics);
}
