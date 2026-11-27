import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { serializeJob } from "@/lib/jobs/jobAdmin";
import { logAudit } from "@/lib/auditLog";
import { wakeScheduler } from "@/lib/jobs/wakeScheduler";

// EKP F3: "Run now". The app wakes the worker's scheduler, which runs it
// within seconds, even if the job is turned off. super_admin only.
export async function POST(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId, jobId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const job = await prisma.scheduledJob.findFirst({ where: { id: jobId, orgId } });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const updated = await prisma.scheduledJob.update({ where: { id: job.id }, data: { runRequestedAt: new Date() } });
  await wakeScheduler();
  await logAudit({ orgId, actorUserId: user.id, action: "jobs.run_requested", metadata: { job: job.name } });
  return NextResponse.json({ job: serializeJob(updated) });
}
