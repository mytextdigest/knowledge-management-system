'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Building2, Users, Key, Eye, EyeOff, Loader2,
  CheckCircle2, ArrowLeft, Mail, Shield,
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

  useEffect(() => {
    Promise.all([
      fetch(`/api/org/${orgId}/settings`).then((r) => r.json()),
      fetch(`/api/org/${orgId}/members`).then((r) => r.json()),
    ]).then(([settingsData, membersData]) => {
      if (settingsData.error) { router.replace('/dashboard'); return; }
      setOrg(settingsData);
      setEditName(settingsData.name);
      setMembers(Array.isArray(membersData) ? membersData : []);
    }).finally(() => setLoading(false));
  }, [orgId]);

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
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'apikey', label: 'API Key', icon: Key },
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
