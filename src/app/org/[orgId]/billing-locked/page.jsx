import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BillingLockedPage({ params, searchParams }) {
  const { orgId } = await params;
  const { reason } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const { user, role } = await resolveOrgRole(session.user.email, orgId);
  if (!user || !role) redirect("/welcome-back");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });

  const admins = await prisma.organizationMember.findMany({
    where: { orgId, role: "super_admin" },
    include: { user: { select: { name: true, email: true } } },
  });

  const message = reason === "apikey"
    ? "This organization hasn't configured an OpenAI API key yet."
    : "This organization's subscription is inactive.";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">{org?.name || "This organization"} is locked</h1>
        <p className="text-muted-foreground text-sm mb-6">{message} Contact an admin to restore access.</p>

        {admins.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Admins</p>
            <ul className="space-y-1">
              {admins.map((a) => (
                <li key={a.userId} className="text-sm text-foreground">
                  {a.user.name || a.user.email} <span className="text-gray-400">({a.user.email})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
