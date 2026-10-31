// Dev tool (until the Settings → Single sign-on page lands in A-5): connect a
// Microsoft tenant to a KMS org for Microsoft sign-in.
//
//   node scripts/ekp/connect-entra-tenant.mjs --org <orgId> --tenant <tenantId> --domains a.com,b.com
//   node scripts/ekp/connect-entra-tenant.mjs --org <orgId> --remove
//
// Only use domains the tenant has verified; the admin page will enforce this.
import { PrismaClient } from "@prisma/client";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]);
    return pairs;
  }, [])
);

const prisma = new PrismaClient();
try {
  if (!args.org) throw new Error("--org is required");
  const org = await prisma.organization.findUnique({ where: { id: args.org }, select: { id: true, name: true } });
  if (!org) throw new Error(`No org ${args.org}`);

  if (args.remove) {
    const { count } = await prisma.orgSsoConfig.deleteMany({ where: { orgId: org.id } });
    console.log(`Removed ${count} SSO config(s) from ${org.name}`);
  } else {
    if (!args.tenant || !args.domains) throw new Error("--tenant and --domains are required");
    const allowedDomains = String(args.domains).split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    const config = await prisma.orgSsoConfig.upsert({
      where: { orgId: org.id },
      update: { tenantId: args.tenant, allowedDomains, enabled: true },
      create: { orgId: org.id, tenantId: args.tenant, allowedDomains },
    });
    console.log(`Connected tenant ${config.tenantId} to ${org.name} (${org.id}); domains: ${config.allowedDomains.join(", ")}`);
  }
} finally {
  await prisma.$disconnect();
}
