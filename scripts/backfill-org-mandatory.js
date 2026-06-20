// One-off backfill for the org-mandatory pivot. Run once, manually, after
// Migration A (additive) and before Migration B (constraint tightening).
//
// For every user:
//  - if they belong to zero orgs, create a default org for them (named
//    after their name/email) and make them super_admin
//  - if they belong to exactly one org, that's their "home org"
//  - if they belong to multiple orgs, prefer one where they're super_admin;
//    otherwise skip migrating their orgId-null rows and just log it (none
//    of the current data hits this case)
// Then: migrate their orgId-null Subscription/Projects into the home org,
// and mark hasCompletedOnboarding = true so they never see the celebration
// screen retroactively.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resolveHomeOrgId(user, memberships) {
  if (memberships.length === 0) {
    const orgName = user.name?.trim() || user.email.split('@')[0];
    const org = await prisma.organization.create({ data: { name: orgName } });
    await prisma.organizationMember.create({
      data: { orgId: org.id, userId: user.id, role: 'super_admin' },
    });
    console.log(`  created default org "${orgName}" (${org.id})`);
    return org.id;
  }

  if (memberships.length === 1) return memberships[0].orgId;

  const asSuperAdmin = memberships.find((m) => m.role === 'super_admin');
  if (asSuperAdmin) return asSuperAdmin.orgId;

  console.warn(`  SKIPPING ${user.email}: belongs to ${memberships.length} orgs, none as super_admin — ambiguous home org, resolve manually.`);
  return null;
}

async function run() {
  const users = await prisma.user.findMany({
    include: { orgMembers: true },
  });

  for (const user of users) {
    console.log(`\n${user.email}`);

    const homeOrgId = await resolveHomeOrgId(user, user.orgMembers);
    if (!homeOrgId) continue;

    await prisma.$transaction(async (tx) => {
      const projectResult = await tx.project.updateMany({
        where: { userId: user.id, orgId: null },
        data: { orgId: homeOrgId, scope: 'org' },
      });
      if (projectResult.count > 0) {
        console.log(`  migrated ${projectResult.count} project(s) -> org ${homeOrgId}`);
      }

      // Documents derive org affiliation through their project in normal
      // operation, but backfill any standalone orgId-null rows defensively.
      const docResult = await tx.document.updateMany({
        where: { userId: user.id, orgId: null },
        data: { orgId: homeOrgId },
      });
      if (docResult.count > 0) {
        console.log(`  migrated ${docResult.count} document(s) -> org ${homeOrgId}`);
      }

      const existingSub = await tx.subscription.findFirst({
        where: { managedByUserId: user.id, orgId: null },
      });
      if (existingSub) {
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: { orgId: homeOrgId },
        });
        console.log(`  linked subscription ${existingSub.id} -> org ${homeOrgId}`);
      }

      if (!user.hasCompletedOnboarding) {
        await tx.user.update({
          where: { id: user.id },
          data: { hasCompletedOnboarding: true },
        });
        console.log(`  marked hasCompletedOnboarding = true`);
      }
    });
  }

  console.log('\nDone.');
}

run()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
