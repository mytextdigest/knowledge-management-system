import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { ensureOrgJobs, INTERVAL_CHOICES } from "@/lib/jobs/registry";
import { serializeJob } from "@/lib/jobs/jobAdmin";

// EKP F3: Settings → Scheduled jobs. super_admin only.
export async function GET(req, { params }) {
  const session = await getServerSession();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await params;
  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!isSuperAdmin(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureOrgJobs(prisma, orgId);
  const jobs = await prisma.scheduledJob.findMany({ where: { orgId }, orderBy: { name: "asc" } });
  return NextResponse.json({ jobs: jobs.map((j) => serializeJob(j)), intervalChoices: INTERVAL_CHOICES });
}
