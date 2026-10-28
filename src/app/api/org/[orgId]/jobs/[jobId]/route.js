import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { serializeJob, validateJobPatch } from "@/lib/jobs/jobAdmin";
import { logAudit } from "@/lib/auditLog";

// EKP F3: turn a scheduled job on/off or change its interval. super_admin only.
export async function PATCH(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId, jobId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const job = await prisma.scheduledJob.findFirst({ where: { id: jobId, orgId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { data, error } = validateJobPatch(await req.json().catch(() => ({})), job);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const updated = await prisma.scheduledJob.update({ where: { id: job.id }, data });
  await logAudit({
    orgId,
    actorUserId: user.id,
    action: "jobs.updated",
    metadata: {
      job: job.name,
      before: { enabled: job.enabled, intervalMinutes: job.intervalMinutes },
      after: { enabled: updated.enabled, intervalMinutes: updated.intervalMinutes },
    },
  });
  return NextResponse.json({ job: serializeJob(updated) });
}
