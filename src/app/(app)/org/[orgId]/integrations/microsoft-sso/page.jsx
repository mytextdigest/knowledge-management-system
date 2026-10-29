'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, KeyRound, Loader2, CheckCircle2, AlertCircle, Unplug, Search, Trash2, Plus } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

// EKP A-5: Settings → Integrations → Microsoft sign-in (super_admin only).
// Connect runs Microsoft's admin approval for the KMS Sign-in app; the
// tenant's verified domains come back from Microsoft and are the only
// domains that can be enabled.

const PROVISIONING_OPTIONS = [
  { value: 'auto', label: 'Anyone in the Microsoft organization', hint: 'They join this org as Employee on first sign-in (or with their invite\'s role).' },
  { value: 'invite_only', label: 'Invited people only', hint: 'Only existing members and people with a pending invite can get in.' },
];

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'dept_admin', label: 'Dept Admin' },
  { value: 'employee', label: 'Employee' },
  { value: 'guest', label: 'Guest' },
];

const PASSWORD_OPTIONS = [
  { value: 'admins_only', label: 'Super admins only', hint: 'Everyone else on these domains must use Microsoft. Super admins keep a password as an emergency way in.' },
  { value: 'all', label: 'Everyone', hint: 'Users can choose Microsoft or their KMS password.' },
];

export default function MicrosoftSignInPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(searchParams.get('error') || '');
  const [notice, setNotice] = useState(searchParams.get('connected') ? 'Microsoft organization connected.' : '');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [departments, setDepartments] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/sso`);
      const data = await res.json();
      if (res.status === 403) { router.replace(`/org/${orgId}/settings`); return; }
      if (!res.ok) throw new Error(data.error || 'Failed to load Microsoft sign-in settings.');
      setConfig(data);
      setDraft(data.connected ? {
        allowedDomains: data.allowedDomains,
        provisioning: data.provisioning,
        passwordLogin: data.passwordLogin,
        enabled: data.enabled,
        groupRoleMap: data.groupRoleMap || [],
      } : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetch(`/api/org/${orgId}/department`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setDepartments(data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const toggleDomain = (domain) => {
    setDraft((prev) => ({
      ...prev,
      allowedDomains: prev.allowedDomains.includes(domain)
        ? prev.allowedDomains.filter((d) => d !== domain)
        : [...prev.allowedDomains, domain],
    }));
  };

  const dirty = config?.connected && draft && (
    draft.provisioning !== config.provisioning ||
    draft.passwordLogin !== config.passwordLogin ||
    draft.enabled !== config.enabled ||
    JSON.stringify(draft.groupRoleMap) !== JSON.stringify(config.groupRoleMap || []) ||
    [...draft.allowedDomains].sort().join() !== [...config.allowedDomains].sort().join()
  );

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/org/${orgId}/sso`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save.');
      setConfig((prev) => ({ ...prev, ...data }));
      setNotice('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Microsoft sign-in? Users can still sign in with a KMS password (or reset one by email).')) return;
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/sso`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to disconnect.');
      setNotice('Microsoft sign-in disconnected.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  };

  const connectHref = `/api/org/${orgId}/sso/connect`;

  return (
    <Layout orgId={orgId}>
      <div className="max-w-3xl mx-auto py-8 px-4">
        <button
          onClick={() => router.push(`/org/${orgId}/settings?tab=integrations`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Integrations
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Microsoft sign-in</h1>
            <p className="text-sm text-gray-500">Let your employees sign in to KMS with their Microsoft work account.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {notice}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : !config?.connected ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Connecting sends you to Microsoft. <strong>An administrator of your Microsoft organization</strong> must
              approve the KMS Sign-in app for the whole organization. If that isn't you, ask your Microsoft admin to
              sign in at that step.
            </p>
            <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc pl-5 space-y-1">
              <li>KMS only asks for basic profile and sign-in access, not files or mail.</li>
              <li>After approval you choose which of your organization's verified email domains may sign in.</li>
            </ul>
            {config?.available === false ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">Microsoft sign-in isn't configured on this KMS deployment.</p>
            ) : (
              <a
                href={connectHref}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
              >
                Connect Microsoft
              </a>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">{config.tenantName || 'Microsoft organization'}</p>
                <p className="text-xs text-gray-500 truncate">Tenant ID {config.tenantId}</p>
              </div>
              <a
                href={connectHref}
                className="text-sm text-primary-600 hover:underline flex-shrink-0"
                title="Re-run Microsoft approval, e.g. after adding a domain in Microsoft"
              >
                Reconnect
              </a>
            </div>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email domains</h2>
              <p className="text-xs text-gray-500">People can sign in with Microsoft only if their email is on a selected domain. Only domains your Microsoft organization has verified are listed.</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                {config.verifiedDomains.map((domain) => (
                  <label key={domain} className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allowedDomains.includes(domain)}
                      onChange={() => toggleDomain(domain)}
                      className="h-4 w-4"
                    />
                    <span className="text-gray-900 dark:text-gray-100">{domain}</span>
                  </label>
                ))}
              </div>
            </section>

            <GroupRoleMapping
              orgId={orgId}
              departments={departments}
              map={draft.groupRoleMap}
              onChange={(groupRoleMap) => setDraft((prev) => ({ ...prev, groupRoleMap }))}
              connectHref={connectHref}
            />

            <OptionGroup
              title="Who can join"
              options={PROVISIONING_OPTIONS}
              value={draft.provisioning}
              onChange={(provisioning) => setDraft((prev) => ({ ...prev, provisioning }))}
            />

            <OptionGroup
              title="Who can still use a KMS password"
              options={PASSWORD_OPTIONS}
              value={draft.passwordLogin}
              onChange={(passwordLogin) => setDraft((prev) => ({ ...prev, passwordLogin }))}
            />

            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4"
              />
              <span className="text-gray-900 dark:text-gray-100">Microsoft sign-in is on</span>
            </label>

            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20 text-sm font-medium disabled:opacity-50"
              >
                <Unplug className="h-4 w-4" />
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
              <button
                onClick={save}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}

function OptionGroup({ title, options, value, onChange }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
        {options.map((option) => (
          <label key={option.value} className={cn('flex items-start gap-3 px-4 py-3 text-sm cursor-pointer')}>
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 mt-0.5"
            />
            <span>
              <span className="block text-gray-900 dark:text-gray-100">{option.label}</span>
              <span className="block text-xs text-gray-500">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

// A-6: Entra security group → KMS role (+ departments), applied at each
// Microsoft sign-in.
function GroupRoleMapping({ orgId, departments, map, onChange, connectHref }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const runSearch = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/sso/groups?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'Search failed.'), { needsReconnect: data.needsReconnect });
      setResults(data.groups);
    } catch (err) {
      setSearchError({ message: err.message, needsReconnect: err.needsReconnect });
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const mapped = new Set(map.map((m) => m.groupId));
  const update = (groupId, patch) => onChange(map.map((m) => (m.groupId === groupId ? { ...m, ...patch } : m)));
  const toggleDept = (entry, deptId) =>
    update(entry.groupId, {
      departmentIds: entry.departmentIds.includes(deptId)
        ? entry.departmentIds.filter((d) => d !== deptId)
        : [...entry.departmentIds, deptId],
    });

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Roles from Microsoft groups</h2>
      <p className="text-xs text-gray-500">
        Members of these Microsoft security groups get the role and departments below each time they sign in with
        Microsoft. The highest role wins. Leaving a group takes back what it gave; roles you set by hand are never lowered.
      </p>

      {map.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          {map.map((entry) => (
            <div key={entry.groupId} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{entry.groupName}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    value={entry.role}
                    onChange={(e) => update(entry.groupId, { role: e.target.value })}
                    className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button
                    onClick={() => onChange(map.filter((m) => m.groupId !== entry.groupId))}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                    title="Remove mapping"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {departments.length > 0 && entry.role !== 'super_admin' && (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {departments.map((dept) => (
                    <label key={dept.id} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry.departmentIds.includes(dept.id)}
                        onChange={() => toggleDept(entry, dept.id)}
                        className="h-3.5 w-3.5"
                      />
                      {dept.name}
                    </label>
                  ))}
                </div>
              )}
              {entry.role === 'dept_admin' && entry.departmentIds.length === 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Choose at least one department for Dept Admin.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="Find a Microsoft security group"
            className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
          />
        </div>
        <button
          onClick={runSearch}
          disabled={searching}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium disabled:opacity-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {searchError && (
        <p className="text-xs text-red-700 dark:text-red-300">
          {searchError.message}{' '}
          {searchError.needsReconnect && <a href={connectHref} className="underline">Reconnect</a>}
        </p>
      )}
      {results && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-500">No security groups found.</p>
          ) : results.map((group) => (
            <div key={group.id} className="px-4 py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{group.name}</p>
                {group.description && <p className="text-xs text-gray-500 truncate">{group.description}</p>}
              </div>
              <button
                disabled={mapped.has(group.id)}
                onClick={() => onChange([...map, { groupId: group.id, groupName: group.name, role: 'employee', departmentIds: [] }])}
                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline disabled:text-gray-400 disabled:no-underline flex-shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                {mapped.has(group.id) ? 'Added' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
