// A-5: Microsoft sign-in rules (src/lib/sso/entra.js), WS_A A1 step 5.
// DB-backed cases run inside a transaction that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a1:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { resolveEntraSignIn, emailFromClaims, SSO_ERRORS } from "../../src/lib/sso/entra.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");

test("email comes from the email claim, else a non-guest UPN", () => {
  assert.equal(emailFromClaims({ email: "Jane@NYPA.gov" }), "jane@nypa.gov");
  assert.equal(emailFromClaims({ preferred_username: "bob@nypa.gov" }), "bob@nypa.gov");
  assert.equal(emailFromClaims({ preferred_username: "bob_vendor.com#EXT#@nypa.onmicrosoft.com" }), null);
  assert.equal(emailFromClaims({ email: "bob@vendor.com", preferred_username: "bob_vendor.com#EXT#@nypa.onmicrosoft.com" }), "bob@vendor.com");
});

test("Microsoft sign-in rules", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const domain = `sso-${tag}.example.test`;
  const tid = `tenant-${tag}`;
  const events = [];
  const audit = async (entry) => { events.push(entry); };

  try {
    await prisma.$transaction(async (db) => {
      const opts = { db, audit };
      const claims = (n, extra = {}) => ({ tid, oid: `oid-${n}-${tag}`, email: `user${n}@${domain}`, name: `User ${n}`, ...extra });
      const expectCode = (promise, code) => assert.rejects(promise, (err) => err.code === code);

      const org = await db.organization.create({ data: { name: `sso-org-${tag}` } });
      const dept = await db.department.create({ data: { orgId: org.id, name: `SSO Dept ${tag}` } });

      // 1. Tenant not connected.
      await expectCode(resolveEntraSignIn(claims(1), opts), SSO_ERRORS.NOT_CONFIGURED);

      const config = await db.orgSsoConfig.create({ data: { orgId: org.id, tenantId: tid, allowedDomains: [domain] } });

      // 2. New user: created, verified, joins as employee, identity linked.
      const first = await resolveEntraSignIn(claims(1), opts);
      assert.equal(first.created, true);
      assert.equal(first.orgId, org.id);
      assert.equal(first.user.emailVerified, true);
      assert.equal(first.user.password, null);
      const member = await db.organizationMember.findUnique({ where: { orgId_userId: { orgId: org.id, userId: first.user.id } } });
      assert.equal(member.role, "employee");
      const identity = await db.userIdentity.findFirst({ where: { userId: first.user.id } });
      assert.equal(identity.source, "sso");
      assert.equal(events.at(-1).action, "auth.sso_user_created");

      // 3. Second sign-in: same user, no duplicate identity or membership.
      const again = await resolveEntraSignIn(claims(1), opts);
      assert.equal(again.user.id, first.user.id);
      assert.equal(again.created, false);
      assert.equal(await db.userIdentity.count({ where: { userId: first.user.id } }), 1);
      assert.equal(await db.organizationMember.count({ where: { userId: first.user.id } }), 1);
      assert.equal(events.at(-1).action, "auth.sso_login");

      // 4. Existing password user with the same email is linked, not duplicated.
      const existing = await db.user.create({ data: { email: `user2@${domain}`, password: "hash", emailVerified: true } });
      const linked = await resolveEntraSignIn(claims(2), opts);
      assert.equal(linked.user.id, existing.id);
      assert.equal(await db.user.count({ where: { email: `user2@${domain}` } }), 1);

      // 5. Email outside the org's verified domains: refused, never linked.
      const victim = await db.user.create({ data: { email: `victim-${tag}@other.example.test`, password: "hash" } });
      await expectCode(resolveEntraSignIn(claims(3, { email: victim.email }), opts), SSO_ERRORS.DOMAIN_NOT_ALLOWED);
      assert.equal(await db.userIdentity.count({ where: { userId: victim.id } }), 0);

      // 6. No usable email (guest UPN, no email claim).
      await expectCode(resolveEntraSignIn(claims(4, { email: undefined, preferred_username: `x_y.com#EXT#@${domain}` }), opts), SSO_ERRORS.NO_EMAIL);

      // 7. A pending invite sets role and departments, and is accepted.
      const invite = await db.organizationInvite.create({
        data: { orgId: org.id, email: `user5@${domain}`, role: "dept_admin", departmentIds: [dept.id], token: `tok-${tag}`, expiresAt: new Date(Date.now() + 86400000) },
      });
      const invited = await resolveEntraSignIn(claims(5), opts);
      assert.equal((await db.organizationMember.findUnique({ where: { orgId_userId: { orgId: org.id, userId: invited.user.id } } })).role, "dept_admin");
      assert.equal((await db.departmentMember.findUnique({ where: { departmentId_userId: { departmentId: dept.id, userId: invited.user.id } } })).role, "admin");
      assert.ok((await db.organizationInvite.findUnique({ where: { id: invite.id } })).acceptedAt);

      // 8. An email_match identity becomes sso on Microsoft sign-in.
      const matched = await db.user.create({ data: { email: `user6@${domain}`, password: "hash", emailVerified: true } });
      await db.userIdentity.create({ data: { userId: matched.id, provider: "entra", source: "email_match", tenantId: tid, externalId: `oid-6-${tag}` } });
      await resolveEntraSignIn(claims(6), opts);
      assert.equal((await db.userIdentity.findFirst({ where: { userId: matched.id } })).source, "sso");

      // 9. invite_only: strangers refused, existing members still get in.
      await db.orgSsoConfig.update({ where: { id: config.id }, data: { provisioning: "invite_only" } });
      await expectCode(resolveEntraSignIn(claims(7), opts), SSO_ERRORS.NOT_INVITED);
      assert.equal((await resolveEntraSignIn(claims(1), opts)).user.id, first.user.id);

      // 10. Disabled config refuses everyone.
      await db.orgSsoConfig.update({ where: { id: config.id }, data: { enabled: false } });
      await expectCode(resolveEntraSignIn(claims(1), opts), SSO_ERRORS.NOT_CONFIGURED);

      throw ROLLBACK;
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
