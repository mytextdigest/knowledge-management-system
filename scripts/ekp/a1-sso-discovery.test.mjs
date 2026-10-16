// A-5: which emails must use Microsoft, and who keeps password login
// (src/lib/sso/discovery.js). Runs inside a transaction that is rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a1:test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { findSsoConfigForEmail, isPasswordLoginAllowed } from "../../src/lib/sso/discovery.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("password and one-time-code providers and sign-up apply the rule", () => {
  const auth = read("src/lib/auth.js");
  assert.equal(auth.match(/isPasswordLoginAllowed\(user\)/g)?.length, 2, "both credentials providers check it");
  assert.match(read("src/app/api/auth/register/route.js"), /findSsoConfigForEmail\(email\)[\s\S]*useMicrosoft: true/);
});

test("domain lookup and password rule", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const domain = `disc-${tag}.example.test`;
  try {
    await prisma.$transaction(async (db) => {
      const opts = { db };
      const org = await db.organization.create({ data: { name: `disc-${tag}` } });
      const config = await db.orgSsoConfig.create({
        data: { orgId: org.id, tenantId: `t-${tag}`, allowedDomains: [domain], verifiedDomains: [domain, `other-${tag}.example.test`] },
      });
      const mkUser = async (name, role) => {
        const user = await db.user.create({ data: { email: `${name}@${domain}`, password: "hash", emailVerified: true } });
        if (role) await db.organizationMember.create({ data: { orgId: org.id, userId: user.id, role } });
        return user;
      };
      const admin = await mkUser("admin", "super_admin");
      const deptAdmin = await mkUser("deptadmin", "dept_admin");
      const employee = await mkUser("employee", "employee");
      const outsider = await mkUser("outsider", null);
      const gmail = await db.user.create({ data: { email: `someone-${tag}@gmail-test.example`, password: "hash" } });

      // Lookup: case-insensitive, only allowed domains, only when enabled.
      assert.equal((await findSsoConfigForEmail(`Jane@${domain.toUpperCase()}`, opts))?.id, config.id);
      assert.equal(await findSsoConfigForEmail(`jane@other-${tag}.example.test`, opts), null, "verified but not allowed");
      assert.equal(await findSsoConfigForEmail("not-an-email", opts), null);

      // admins_only: only the org's super admins keep a password.
      assert.equal(await isPasswordLoginAllowed(admin, opts), true);
      assert.equal(await isPasswordLoginAllowed(deptAdmin, opts), false);
      assert.equal(await isPasswordLoginAllowed(employee, opts), false);
      assert.equal(await isPasswordLoginAllowed(outsider, opts), false);
      assert.equal(await isPasswordLoginAllowed(gmail, opts), true, "other domains are unaffected");

      // "all": everyone keeps a password.
      await db.orgSsoConfig.update({ where: { id: config.id }, data: { passwordLogin: "all" } });
      assert.equal(await isPasswordLoginAllowed(employee, opts), true);

      // Sign-in turned off: back to passwords, no Microsoft redirect.
      await db.orgSsoConfig.update({ where: { id: config.id }, data: { passwordLogin: "admins_only", enabled: false } });
      assert.equal(await findSsoConfigForEmail(employee.email, opts), null);
      assert.equal(await isPasswordLoginAllowed(employee, opts), true);

      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
