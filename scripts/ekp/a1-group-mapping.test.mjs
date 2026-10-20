// A-6: Entra group → role/department mapping (src/lib/sso/groupMapping.js),
// pure rules plus full Microsoft sign-ins in a rolled-back transaction.
// Run: EKP_DB_TESTS=1 npm run ekp:a1:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { computeGroupGrants, validateGroupRoleMap, hasGroupOverage } from "../../src/lib/sso/groupMapping.js";
import { resolveEntraSignIn } from "../../src/lib/sso/entra.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const G = (n) => `0000000${n}-0000-4000-8000-000000000000`;

test("highest role wins; departments are unioned, admin beats member", () => {
  const map = [
    { groupId: G(1), role: "employee", departmentIds: ["d1"] },
    { groupId: G(2), role: "dept_admin", departmentIds: ["d1", "d2"] },
    { groupId: G(3), role: "guest", departmentIds: ["d3"] },
  ];
  assert.deepEqual(computeGroupGrants([G(1), G(3)], map), {
    role: "employee",
    departments: [{ departmentId: "d1", role: "member" }, { departmentId: "d3", role: "member" }],
  });
  const both = computeGroupGrants([G(1).toUpperCase(), G(2)], map);
  assert.equal(both.role, "dept_admin");
  assert.deepEqual(both.departments, [{ departmentId: "d1", role: "admin" }, { departmentId: "d2", role: "admin" }]);
  assert.deepEqual(computeGroupGrants(["unmapped"], map), { role: null, departments: [] });
});

test("validation", () => {
  const ok = validateGroupRoleMap([{ groupId: G(1).toUpperCase(), groupName: " Admins ", role: "super_admin" }], { departmentIds: [] });
  assert.deepEqual(ok.map, [{ groupId: G(1), groupName: "Admins", role: "super_admin", departmentIds: [] }]);
  assert.match(validateGroupRoleMap([{ groupId: "nope", role: "employee" }], { departmentIds: [] }).error, /group/);
  assert.match(validateGroupRoleMap([{ groupId: G(1), role: "owner" }], { departmentIds: [] }).error, /role/);
  assert.match(validateGroupRoleMap([{ groupId: G(1), role: "employee" }, { groupId: G(1), role: "guest" }], { departmentIds: [] }).error, /once/);
  assert.match(validateGroupRoleMap([{ groupId: G(1), role: "employee", departmentIds: ["x"] }], { departmentIds: ["d1"] }).error, /department/);
  assert.match(validateGroupRoleMap([{ groupId: G(1), role: "dept_admin", departmentIds: [] }], { departmentIds: ["d1"] }).error, /at least one/);
});

test("group overage is detected", () => {
  assert.equal(hasGroupOverage({ _claim_names: { groups: "src1" } }), true);
  assert.equal(hasGroupOverage({ hasgroups: true }), true);
  assert.equal(hasGroupOverage({ groups: [G(1)] }), false);
});

test("mapping applied at each sign-in, taken back on leaving, never lowers hand-set roles", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const domain = `grp-${tag}.example.test`;
  const tid = `tenant-${tag}`;
  try {
    await prisma.$transaction(async (db) => {
      const audit = async () => {};
      let overageGroups = [];
      const opts = { db, audit, fetchGroupIds: async () => overageGroups };
      const signIn = (n, groups, extra = {}) =>
        resolveEntraSignIn({ tid, oid: `oid-${n}-${tag}`, email: `u${n}@${domain}`, name: `U${n}`, groups, ...extra }, opts);
      const role = async (userId) => (await db.organizationMember.findUnique({ where: { orgId_userId: { orgId: org.id, userId } } })).role;
      const dept = async (departmentId, userId) => (await db.departmentMember.findUnique({ where: { departmentId_userId: { departmentId, userId } } }))?.role ?? null;

      const org = await db.organization.create({ data: { name: `grp-${tag}` } });
      const [eng, fin] = await Promise.all(["Eng", "Fin"].map((n) => db.department.create({ data: { orgId: org.id, name: `${n} ${tag}` } })));
      await db.orgSsoConfig.create({
        data: {
          orgId: org.id, tenantId: tid, allowedDomains: [domain],
          groupRoleMap: [
            { groupId: G(1), groupName: "KMS-Admins", role: "super_admin", departmentIds: [] },
            { groupId: G(2), groupName: "KMS-Engineering", role: "dept_admin", departmentIds: [eng.id] },
            { groupId: G(3), groupName: "KMS-Finance", role: "employee", departmentIds: [fin.id] },
          ],
        },
      });

      // 1. New user in Engineering group: dept_admin + admin of Eng.
      const { user: u1 } = await signIn(1, [G(2)]);
      assert.equal(await role(u1.id), "dept_admin");
      assert.equal(await dept(eng.id, u1.id), "admin");

      // 2. Moved from Engineering to Finance: role back to employee, Eng membership removed, Fin added.
      await signIn(1, [G(3)]);
      assert.equal(await role(u1.id), "employee");
      assert.equal(await dept(eng.id, u1.id), null);
      assert.equal(await dept(fin.id, u1.id), "member");

      // 3. Out of every group: Fin membership (ours) removed.
      await signIn(1, []);
      assert.equal(await dept(fin.id, u1.id), null);

      // 4. Hand-set super admin in a group mapped to employee keeps super_admin.
      const { user: u2 } = await signIn(2, []);
      await db.organizationMember.update({ where: { orgId_userId: { orgId: org.id, userId: u2.id } }, data: { role: "super_admin" } });
      await signIn(2, [G(3)]);
      assert.equal(await role(u2.id), "super_admin");
      await signIn(2, []);
      assert.equal(await role(u2.id), "super_admin", "leaving the group doesn't touch a hand-set role");

      // 5. Hand-made Eng membership raised to admin by the group, lowered back (not removed) on leaving.
      const { user: u3 } = await signIn(3, []);
      await db.departmentMember.create({ data: { departmentId: eng.id, userId: u3.id, role: "member" } });
      await signIn(3, [G(2)]);
      assert.equal(await dept(eng.id, u3.id), "admin");
      await signIn(3, []);
      assert.equal(await dept(eng.id, u3.id), "member");
      assert.equal(await role(u3.id), "employee");

      // 6. A hand-set dept_admin equal to the mapped role isn't claimed by the mapping.
      const { user: u4 } = await signIn(4, []);
      await db.organizationMember.update({ where: { orgId_userId: { orgId: org.id, userId: u4.id } }, data: { role: "dept_admin" } });
      await signIn(4, [G(2)]);
      await signIn(4, []);
      assert.equal(await role(u4.id), "dept_admin");

      // 7. Group overage: groups read from Microsoft instead of the token.
      overageGroups = [G(1)];
      const { user: u5 } = await signIn(5, undefined, { _claim_names: { groups: "src1" } });
      assert.equal(await role(u5.id), "super_admin");

      // 8. Overage lookup fails: sign-in still works, previous grants kept.
      opts.fetchGroupIds = async () => { throw new Error("403"); };
      const again = await signIn(5, undefined, { _claim_names: { groups: "src1" } });
      assert.equal(again.user.id, u5.id);
      assert.equal(await role(u5.id), "super_admin");

      // 9. Mapping removed by the admin: earlier grants taken back at next sign-in.
      opts.fetchGroupIds = async () => overageGroups;
      await db.orgSsoConfig.update({ where: { orgId: org.id }, data: { groupRoleMap: [] } });
      await signIn(5, [G(1)]);
      assert.equal(await role(u5.id), "employee");

      throw ROLLBACK;
    }, { timeout: 120_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
