'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Building2, Users, Key, Eye, EyeOff, Loader2,
  CheckCircle2, ArrowLeft, Mail, Shield, Layers,
  Plus, ChevronDown, ChevronUp, UserPlus, Trash2,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_admin: 'Dept Admin',
  employee: 'Employee',
  guest: 'Guest',
};

const INVITE_ROLES = ['dept_admin', 'employee', 'guest'];

export default function OrgSettingsPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');

  // Org name editing
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState(null);

  // API key
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('employee');
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(null);

  // Departments
  const [departments, setDepartments] = useState([]);
  const [deptName, setDeptName] = useState('');
  const [creatingDept, setCreatingDept] = useState(false);
  const [deptError, setDeptError] = useState('');
  const [expandedDeptId, setExpandedDeptId] = useState(null);
  const [deptMembers, setDeptMembers] = useState([]);
  const [loadingDeptMembers, setLoadingDeptMembers] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('member');
  const [addingMember, setAddingMember] = useState(false);
  const [memberActionError, setMemberActionError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/org/${orgId}/settings`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/members`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/department`).then((r) => r.json()),
    ]).then(([settingsData, membersData, departmentsData]) => {
      if (settingsData.error) { router.replace('/dashboard'); return; }
      setOrg(settingsData);
      setEditName(settingsData.name);
      setMembers(Array.isArray(membersData) ? membersData : []);
      setDepartments(Array.isArray(departmentsData) ? departmentsData : []);
      setActiveTab(settingsData.role === 'super_admin' ? 'general' : 'members');
    }).finally(() => setLoading(false));
  }, [orgId]);

  const canManageDepartments = org?.role === 'super_admin' || org?.role === 'dept_admin';

  const createDepartment = async () => {
    if (!deptName.trim()) return;
    setCreatingDept(true);
    setDeptError('');
    try {
      const res = await fetch(`/api/org/${orgId}/department`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deptName }),
      });
      const data = await res.json();
      if (!res.ok) { setDeptError(data.error || 'Failed to create department.'); return; }
      setDepartments((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setDeptName('');
    } catch { setDeptError('Failed to create department.'); }
    finally { setCreatingDept(false); }
  };

  const toggleDepartment = async (deptId) => {
    if (expandedDeptId === deptId) {
      setExpandedDeptId(null);
      setDeptMembers([]);
      return;
    }
    setExpandedDeptId(deptId);
    setMemberActionError('');
    setLoadingDeptMembers(true);
    try {
      const res = await fetch(`/api/org/${orgId}/department/${deptId}/members`);
      const data = await res.json();
      setDeptMembers(Array.isArray(data) ? data : []);
    } catch {
      setDeptMembers([]);
    } finally {
      setLoadingDeptMembers(false);
    }
  };

  const bumpMemberCount = (deptId, delta) => {
    setDepartments((prev) =>
      prev.map((d) =>
        d.id === deptId
          ? { ...d, _count: { ...d._count, members: (d._count?.members || 0) + delta } }
          : d
      )
    );
  };

  const addDeptMember = async (deptId) => {
    if (!addMemberEmail.trim()) return;
    setAddingMember(true);
    setMemberActionError('');
    try {
      const res = await fetch(`/api/org/${orgId}/department/${deptId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addMemberEmail, role: addMemberRole }),
      });
      const data = await res.json();
      if (!res.ok) { setMemberActionError(data.error || 'Failed to add member.'); return; }
      setDeptMembers((prev) => {
        const exists = prev.some((m) => m.userId === data.userId);
        if (exists) return prev.map((m) => (m.userId === data.userId ? data : m));
        bumpMemberCount(deptId, 1);
        return [...prev, data];
      });
      setAddMemberEmail('');
      setAddMemberRole('member');
    } catch { setMemberActionError('Failed to add member.'); }
    finally { setAddingMember(false); }
  };

  const removeDeptMember = async (deptId, userId) => {
    setMemberActionError('');
    try {
      const res = await fetch(`/api/org/${orgId}/department/${deptId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        setMemberActionError(data.error || 'Failed to remove member.');
        return;
      }
      setDeptMembers((prev) => prev.filter((m) => m.userId !== userId));
      bumpMemberCount(deptId, -1);
    } catch { setMemberActionError('Failed to remove member.'); }
  };

  const saveName = async () => {
    if (!editName.trim() || editName === org.name) return;
    setSavingName(true);
    setNameStatus(null);
    try {
      const res = await fetch(`/api/org/${orgId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) { setNameStatus({ type: 'error', msg: data.error }); return; }
      setOrg((o) => ({ ...o, name: data.name }));
      setNameStatus({ type: 'success', msg: 'Name updated.' });
    } catch { setNameStatus({ type: 'error', msg: 'Failed to save.' }); }
    finally { setSavingName(false); }
  };

  const saveApiKey = async () => {
    setSavingKey(true);
    setKeyStatus(null);
    try {
      const res = await fetch(`/api/org/${orgId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openaiApiKey: apiKey }),
      });
      if (!res.ok) { setKeyStatus({ type: 'error', msg: 'Failed to save.' }); return; }
      setOrg((o) => ({ ...o, hasApiKey: !!apiKey }));
      setApiKey('');
      setKeyStatus({ type: 'success', msg: apiKey ? 'API key saved.' : 'API key removed.' });
    } catch { setKeyStatus({ type: 'error', msg: 'Failed to save.' }); }
    finally { setSavingKey(false); }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteStatus(null);
    try {
      const res = await fetch(`/api/org/${orgId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { setInviteStatus({ type: 'error', msg: data.error }); return; }
      setInviteEmail('');
      setInviteStatus({ type: 'success', msg: `Invite sent to ${inviteEmail}.` });
    } catch { setInviteStatus({ type: 'error', msg: 'Failed to send invite.' }); }
    finally { setInviting(false); }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  const tabs = [
    ...(org?.role === 'super_admin' ? [{ id: 'general', label: 'General', icon: Building2 }] : []),
    { id: 'members', label: 'Members', icon: Users },
    { id: 'departments', label: 'Departments', icon: Layers },
    ...(org?.role === 'super_admin' ? [{ id: 'apikey', label: 'API Key', icon: Key }] : []),
  ];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Back link */}
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Personal
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{org?.name}</h1>
            <p className="text-sm text-gray-500">Organization Settings</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* General tab */}
        {activeTab === 'general' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={saveName}
                  disabled={savingName || editName === org?.name || !editName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingName && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
              {nameStatus && (
                <p className={cn('mt-1.5 text-sm', nameStatus.type === 'success' ? 'text-green-600' : 'text-red-600')}>
                  {nameStatus.msg}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Members table */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Member</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {members.map((m) => (
                    <tr key={m.id} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{m.name || m.email}</p>
                        <p className="text-xs text-gray-500">{m.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                          m.role === 'super_admin'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        )}>
                          {m.role === 'super_admin' && <Shield className="h-3 w-3" />}
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invite form */}
            {org?.role === 'super_admin' && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Invite Member
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex-1 min-w-0 p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {INVITE_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  <button
                    onClick={sendInvite}
                    disabled={inviting || !inviteEmail.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send Invite
                  </button>
                </div>
                {inviteStatus && (
                  <p className={cn('mt-2 text-sm', inviteStatus.type === 'success' ? 'text-green-600' : 'text-red-600')}>
                    {inviteStatus.msg}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* Departments tab */}
        {activeTab === 'departments' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {canManageDepartments && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Create Department
                </h3>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="text"
                    placeholder="Example: Engineering"
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    className="flex-1 min-w-0 p-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={createDepartment}
                    disabled={creatingDept || !deptName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {creatingDept && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create
                  </button>
                </div>
                {deptError && <p className="mt-2 text-sm text-red-600">{deptError}</p>}
              </div>
            )}

            {departments.length === 0 ? (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
                No departments yet.
              </div>
            ) : (
              <div className="space-y-3">
                {departments.map((dept) => (
                  <div key={dept.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <button
                      onClick={() => toggleDepartment(dept.id)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">{dept.name}</span>
                        <span className="text-xs text-gray-500">
                          {dept._count?.members || 0} member{dept._count?.members === 1 ? '' : 's'} ·{' '}
                          {dept._count?.documents || 0} doc{dept._count?.documents === 1 ? '' : 's'}
                        </span>
                      </div>
                      {expandedDeptId === dept.id ? (
                        <ChevronUp className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      )}
                    </button>

                    {expandedDeptId === dept.id && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50 space-y-4">
                        {loadingDeptMembers ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                          </div>
                        ) : deptMembers.length === 0 ? (
                          <p className="text-sm text-gray-500">No members in this department yet.</p>
                        ) : (
                          <ul className="space-y-2">
                            {deptMembers.map((m) => (
                              <li
                                key={m.userId}
                                className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2"
                              >
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.name || m.email}</p>
                                  <p className="text-xs text-gray-500">{m.email}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                                    m.role === 'admin'
                                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                  )}>
                                    {m.role === 'admin' && <Shield className="h-3 w-3" />}
                                    {m.role === 'admin' ? 'Admin' : 'Member'}
                                  </span>
                                  {canManageDepartments && (
                                    <button
                                      onClick={() => removeDeptMember(dept.id, m.userId)}
                                      className="text-gray-400 hover:text-red-600"
                                      title="Remove from department"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}

                        {canManageDepartments && (
                          <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-200 dark:border-gray-700">
                            <input
                              type="email"
                              placeholder="email@example.com"
                              value={addMemberEmail}
                              onChange={(e) => setAddMemberEmail(e.target.value)}
                              className="flex-1 min-w-0 p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <select
                              value={addMemberRole}
                              onChange={(e) => setAddMemberRole(e.target.value)}
                              className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              onClick={() => addDeptMember(dept.id)}
                              disabled={addingMember || !addMemberEmail.trim()}
                              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                            >
                              {addingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                              Add
                            </button>
                          </div>
                        )}
                        {memberActionError && <p className="text-sm text-red-600">{memberActionError}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* API Key tab */}
        {activeTab === 'apikey' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {org?.hasApiKey && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-200">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                OpenAI API key is configured for this organization.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {org?.hasApiKey ? 'Replace API Key' : 'Set OpenAI API Key'}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full p-2.5 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Used for Enterprise Chat and org-level document processing. Leave blank to remove.
              </p>
            </div>

            <button
              onClick={saveApiKey}
              disabled={savingKey}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {savingKey && <Loader2 className="h-4 w-4 animate-spin" />}
              {apiKey ? 'Save API Key' : 'Remove API Key'}
            </button>

            {keyStatus && (
              <p className={cn('text-sm', keyStatus.type === 'success' ? 'text-green-600' : 'text-red-600')}>
                {keyStatus.msg}
              </p>
            )}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
