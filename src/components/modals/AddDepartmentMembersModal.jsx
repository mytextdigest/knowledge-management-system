'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Modal, ModalHeader, ModalTitle, ModalDescription, ModalContent, ModalFooter } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_admin: 'Dept Admin',
  employee: 'Employee',
  guest: 'Guest',
};

// Lets an org admin bulk-add existing org members to a department, assigning
// each a department role (member/admin) in one pass. Shown once, right after
// a department is created (see department/[deptId]/page.jsx's `?new=1`
// handling), but reusable any time a picker like this is needed.
export default function AddDepartmentMembersModal({
  isOpen,
  onClose,
  orgId,
  deptId,
  departmentName,
  excludeUserId,
  onAdded,
}) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [orgMembers, setOrgMembers] = useState([]);
  const [existingMemberIds, setExistingMemberIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [roles, setRoles] = useState({}); // userId -> "member" | "admin"
  const [submitting, setSubmitting] = useState(false);
  const [rowErrors, setRowErrors] = useState({}); // userId -> message

  useEffect(() => {
    if (!isOpen || !orgId || !deptId) return;

    setLoading(true);
    setLoadError('');
    setSearch('');
    setSelectedIds(new Set());
    setRoles({});
    setRowErrors({});

    Promise.all([
      fetch(`/api/org/${orgId}/members`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/department/${deptId}/members`).then((r) => r.json()),
    ])
      .then(([membersData, deptData]) => {
        setOrgMembers(Array.isArray(membersData) ? membersData : []);
        const existing = new Set([
          ...((deptData.members || []).map((m) => m.userId)),
          ...((deptData.orgLevelAccess || []).map((m) => m.userId)),
        ]);
        setExistingMemberIds(existing);
      })
      .catch(() => setLoadError('Failed to load organization members.'))
      .finally(() => setLoading(false));
  }, [isOpen, orgId, deptId]);

  const pickable = useMemo(
    () => orgMembers.filter((m) => m.userId !== excludeUserId && !existingMemberIds.has(m.userId)),
    [orgMembers, excludeUserId, existingMemberIds]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pickable;
    return pickable.filter(
      (m) => m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
    );
  }, [pickable, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.userId));

  const toggleSelected = (userId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((m) => next.delete(m.userId));
      } else {
        filtered.forEach((m) => next.add(m.userId));
      }
      return next;
    });
  };

  const setRole = (userId, role) => {
    setRoles((prev) => ({ ...prev, [userId]: role }));
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    const targets = orgMembers.filter((m) => selectedIds.has(m.userId));
    if (targets.length === 0 || submitting) return;

    setSubmitting(true);
    setRowErrors({});

    const results = await Promise.allSettled(
      targets.map((m) =>
        fetch(`/api/org/${orgId}/department/${deptId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: m.email, role: roles[m.userId] || 'member' }),
        }).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Failed to add member.');
          return m.userId;
        })
      )
    );

    const succeededIds = new Set();
    const nextRowErrors = {};
    results.forEach((result, i) => {
      const userId = targets[i].userId;
      if (result.status === 'fulfilled') succeededIds.add(userId);
      else nextRowErrors[userId] = result.reason?.message || 'Failed to add member.';
    });

    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeededIds.forEach((id) => next.delete(id));
      return next;
    });
    setExistingMemberIds((prev) => new Set([...prev, ...succeededIds]));
    setRowErrors(nextRowErrors);
    setSubmitting(false);

    if (succeededIds.size > 0) onAdded?.();
    if (Object.keys(nextRowErrors).length === 0) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" closeOnOverlayClick={!submitting}>
      <ModalHeader>
        <ModalTitle>Add members to {departmentName || 'this department'}</ModalTitle>
        <ModalDescription>
          Select existing organization members and assign their role in this department.
        </ModalDescription>
      </ModalHeader>

      <ModalContent>
        {loadError ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
            {loadError}
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-sm text-gray-500 dark:text-gray-400">
            Loading organization members...
          </div>
        ) : pickable.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <Users className="w-6 h-6 text-gray-500 dark:text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No other organization members are available to add.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  className="h-3.5 w-3.5"
                />
                Select all {search ? 'matching' : ''}
              </label>
              <span>{selectedIds.size} selected</span>
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                No members match your search.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700">
                {filtered.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.userId)}
                      onChange={() => toggleSelected(m.userId)}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {m.name || m.email}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {m.email} · {ROLE_LABELS[m.role] || m.role}
                      </p>
                      {rowErrors[m.userId] ? (
                        <p className="text-xs text-red-600 dark:text-red-400">{rowErrors[m.userId]}</p>
                      ) : null}
                    </div>
                    <select
                      value={roles[m.userId] || 'member'}
                      onChange={(e) => setRole(m.userId, e.target.value)}
                      className="shrink-0 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ModalContent>

      <ModalFooter>
        <Button variant="outline" onClick={handleClose} disabled={submitting}>
          Skip for now
        </Button>
        <Button onClick={handleSubmit} disabled={selectedIds.size === 0 || submitting} loading={submitting}>
          Add {selectedIds.size > 0 ? selectedIds.size : ''} Member{selectedIds.size === 1 ? '' : 's'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
