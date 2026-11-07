import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import WelcomeBackClient from "@/components/welcome/WelcomeBackClient";
import { ACTIVE_ORG_COOKIE } from "@/lib/activeOrgCookie";

export const dynamic = "force-dynamic";

export default async function WelcomeBackPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) redirect("/onboarding/start");

  // If the browser already remembers an active org from a previous visit,
  // skip the picker and go straight there (as long as still a member).
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  if (activeOrgId && memberships.some((m) => m.orgId === activeOrgId)) {
    redirect(`/org/${activeOrgId}`);
  }

  // Slack doesn't show a workspace picker if you're only in one workspace —
  // skip straight in (and remember it for next time via /api/org/enter).
  if (memberships.length === 1) redirect(`/api/org/enter/${memberships[0].orgId}`);

  const orgs = memberships.map((m) => ({
    id: m.orgId,
    name: m.organization.name,
    role: m.role,
  }));

  return <WelcomeBackClient orgs={orgs} />;
}
