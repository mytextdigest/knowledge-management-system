// One-off backfill for nesting Projects under Departments. Run once,
// manually, after the additive migration and before the tighten migration.
//
// For every Project with a null departmentId: find or create a default
// department ("General") in that project's org, and attach the project
// to it.
//
// Uses raw SQL because the Prisma schema already declares
// Project.departmentId as required (the tighten migration hasn't run
// yet at this point, so the DB column is still nullable, but the
// generated client type isn't).
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.$queryRaw`
    SELECT "id", "name", "orgId" FROM "Project" WHERE "departmentId" IS NULL
  `;

  console.log(`Found ${orphans.length} project(s) with no department.`);

  const defaultDeptByOrg = new Map();

  for (const project of orphans) {
    let dept = defaultDeptByOrg.get(project.orgId);

    if (!dept) {
      dept = await prisma.department.findFirst({
        where: { orgId: project.orgId, name: 'General' },
      });

      if (!dept) {
        dept = await prisma.department.create({
          data: { orgId: project.orgId, name: 'General' },
        });
        console.log(`Created default department "General" for org ${project.orgId}`);
      }

      defaultDeptByOrg.set(project.orgId, dept);
    }

    await prisma.$executeRaw`
      UPDATE "Project" SET "departmentId" = ${dept.id} WHERE "id" = ${project.id}
    `;

    console.log(`Attached project "${project.name}" (${project.id}) -> department "${dept.name}" (${dept.id})`);
  }

  const remaining = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM "Project" WHERE "departmentId" IS NULL
  `;
  console.log(`Remaining projects with no department: ${remaining[0].count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
