import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveProjectManagementAccess } from "@/lib/projectManagementPolicy";

export async function GET(req) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) return NextResponse.json([], { status: 200 });

    // Resolve project-level management access so project owners, Super Admins,
    // and Dept Admins who administer the project department see the same
    // documents they are authorized to manage through the detail/mutation APIs.
    const { project, canManage } = await resolveProjectManagementAccess(
      session.user.email,
      projectId
    );

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const documents = await prisma.document.findMany({
      where: { projectId },
      select: {
        id: true,
        filename: true,
        createdAt: true,
        projectId: true,
        starred: true,
        selected: true,
        visibility: true,
        status: true,
        content: true,
        topicDocument: {
          select: {
            confidence: true,
            topic: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 🔹 Format for frontend — flatten topic info
    const formatted = documents.map((d) => ({
      ...d,
      created_at:      d.createdAt.toISOString(),
      topicId:         d.topicDocument?.topic?.id ?? null,
      topicName:       d.topicDocument?.topic?.name ?? null,
      topicConfidence: d.topicDocument?.confidence ?? null,
      topicDocument:   undefined, // strip the nested object
      permissions: {
        canManage: true,
        canStar: true,
        canRename: true,
        canDelete: true,
      },
    }));

    return NextResponse.json(formatted);
  } catch (err) {
    console.error("❌ Failed to fetch documents:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
