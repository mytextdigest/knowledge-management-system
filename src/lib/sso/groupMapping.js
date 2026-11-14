// EKP Workstream A, A1 (A-6): Entra group → KMS role and department mapping.
// An org's OrgSsoConfig.groupRoleMap is a list of
//   { groupId, groupName, role, departmentIds[] }
// applied at every Microsoft sign-in. See WS_A_M365_CONNECTORS.md A1 step 6.
//
// Rules:
// - The highest role among the user's mapped groups wins. It replaces a role
//   the mapping granted before, and raises a hand-set role, but never lowers
//   a hand-set role (so a manual super admin can't be locked out).
// - Departments are the union of the matched entries' departments. A
//   department is joined as "admin" if any matched entry giving it is a
//   dept_admin entry, else as "member".
// - Grants are remembered (UserIdentity.groupGrants) so they can be taken
//   back when the user leaves the group: the role drops to employee if it is
//   still the one we granted; memberships the mapping created are removed;
//   hand-made memberships it raised to admin go back to member. Anything else
//   set by hand is never lowered or removed.

export const MAPPABLE_ROLES = ["super_admin", "dept_admin", "employee", "guest"];
const RANK = { guest: 0, employee: 1, dept_admin: 2, super_admin: 3 };
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the user's groups grant: { role, departments: [{ departmentId, role }] }. */
export function computeGroupGrants(groupIds, groupRoleMap) {
  const mine = new Set((groupIds || []).map((g) => String(g).toLowerCase()));
  const matched = (groupRoleMap || []).filter((entry) => mine.has(String(entry.groupId).toLowerCase()));

  let role = null;
  const departments = new Map();
  for (const entry of matched) {
    if (role === null || RANK[entry.role] > RANK[role]) role = entry.role;
    const departmentRole = entry.role === "dept_admin" ? "admin" : "member";
    for (const departmentId of entry.departmentIds || []) {
      if (departments.get(departmentId) !== "admin") departments.set(departmentId, departmentRole);
    }
  }
  return {
    role,
    departments: [...departments].map(([departmentId, r]) => ({ departmentId, role: r })),
  };
}

/** Validate an admin-submitted map. Returns { map } or { error }. */
export function validateGroupRoleMap(input, { departmentIds }) {
  if (!Array.isArray(input)) return { error: "groupRoleMap must be a list" };
  const validDepartments = new Set(departmentIds);
  const seen = new Set();
  const map = [];
  for (const raw of input) {
    const groupId = String(raw?.groupId || "").trim().toLowerCase();
    if (!GUID.test(groupId)) return { error: "Each mapping needs a Microsoft group" };
    if (seen.has(groupId)) return { error: "Each group can be mapped only once" };
    seen.add(groupId);
    if (!MAPPABLE_ROLES.includes(raw.role)) return { error: "Invalid role in group mapping" };
    const depts = [...new Set((raw.departmentIds || []).map(String))];
    const unknown = depts.filter((id) => !validDepartments.has(id));
    if (unknown.length) return { error: "Group mapping refers to a department that isn't in this org" };
    if (raw.role === "dept_admin" && depts.length === 0) {
      return { error: "A Dept Admin mapping needs at least one department" };
    }
    map.push({
      groupId,
      groupName: String(raw.groupName || "").trim().slice(0, 256) || groupId,
      role: raw.role,
      departmentIds: depts,
    });
  }
  return { map };
}

// Entra omits the groups claim when a user is in too many groups (over 200
// in an ID token) and signals it with _claim_names.groups / hasgroups.
export function hasGroupOverage(claims) {
  return Boolean(claims?._claim_names?.groups || claims?.hasgroups);
}

/**
 * Apply grants to the user's org role and department memberships.
 * `previous` is the identity's last groupGrants. Returns the grants to store.
 */
export async function applyGroupGrants(db, { orgId, userId, grants, previous }) {
  const prev = {
    role: previous?.role ?? null,
    departmentIds: previous?.departmentIds ?? [],
    raisedDepartmentIds: previous?.raisedDepartmentIds ?? [],
  };
  const changes = { roleFrom: null, roleTo: null, joined: [], left: [] };

  // Org role. grantedRole is what we remember as ours: only a role we set.
  let grantedRole = null;
  const member = await db.organizationMember.findUnique({ where: { orgId_userId: { orgId, userId } } });
  if (member) {
    // A role we granted follows the mapping; a hand-set role is only raised.
    const ours = prev.role !== null && member.role === prev.role;
    let target = member.role;
    if (grants.role) {
      if (ours || RANK[grants.role] > (RANK[member.role] ?? -1)) target = grants.role;
    } else if (ours) {
      target = "employee";
    }
    if (target !== member.role) {
      await db.organizationMember.update({ where: { orgId_userId: { orgId, userId } }, data: { role: target } });
      changes.roleFrom = member.role;
      changes.roleTo = target;
    }
    if (grants.role && target === grants.role && (ours || target !== member.role)) grantedRole = grants.role;
  }

  // Departments: only this org's, only rows we manage.
  const wanted = new Map(grants.departments.map((d) => [d.departmentId, d.role]));
  const orgDepartments = await db.department.findMany({
    where: { orgId, id: { in: [...new Set([...wanted.keys(), ...prev.departmentIds, ...prev.raisedDepartmentIds])] } },
    select: { id: true },
  });
  const inOrg = new Set(orgDepartments.map((d) => d.id));
  const created = new Set(prev.departmentIds.filter((id) => inOrg.has(id)));
  const raised = new Set(prev.raisedDepartmentIds.filter((id) => inOrg.has(id)));

  for (const [departmentId, role] of wanted) {
    if (!inOrg.has(departmentId)) continue;
    const key = { departmentId_userId: { departmentId, userId } };
    const existing = await db.departmentMember.findUnique({ where: key });
    if (!existing) {
      await db.departmentMember.create({ data: { departmentId, userId, role } });
      created.add(departmentId);
      changes.joined.push(departmentId);
    } else if (created.has(departmentId)) {
      // Our own rows follow the mapping.
      if (existing.role !== role) await db.departmentMember.update({ where: key, data: { role } });
    } else if (role === "admin" && existing.role !== "admin") {
      // A hand-made row is only raised, and remembered so it can be lowered.
      await db.departmentMember.update({ where: key, data: { role: "admin" } });
      raised.add(departmentId);
    } else if (raised.has(departmentId) && role !== "admin") {
      await db.departmentMember.update({ where: key, data: { role: "member" } });
      raised.delete(departmentId);
    }
  }
  for (const departmentId of [...raised]) {
    if (wanted.has(departmentId)) continue; // handled above
    await db.departmentMember.updateMany({ where: { departmentId, userId, role: "admin" }, data: { role: "member" } });
    raised.delete(departmentId);
  }
  for (const departmentId of [...created]) {
    if (wanted.has(departmentId)) continue;
    await db.departmentMember.deleteMany({ where: { departmentId, userId } });
    created.delete(departmentId);
    changes.left.push(departmentId);
  }

  return {
    stored: { role: grantedRole, departmentIds: [...created], raisedDepartmentIds: [...raised] },
    changes,
  };
}
