'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Loader2, CheckCircle2, AlertCircle, Unplug, KeyRound } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

// EKP A-17: connect a ServiceNow instance (read-only integration user) and
// map each knowledge base to a KMS department.

const inputClass =
  'w-full p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const EMPTY_FORM = { instanceUrl: '', authType: 'basic', username: '', password: '', clientId: '', clientSecret: '' };

export default function ServiceNowIntegrationPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [role, setRole] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [connecting, setConnecting] = useState(false);

  const [available, setAvailable] = useState(null); // the instance's knowledge bases
  const [mapping, setMapping] = useState({}); // { [kbId]: departmentId | '' }
  const [savingMapping, setSavingMapping] = useState(false);

  const [syncRuns, setSyncRuns] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch(`/api/org/${orgId}/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error || data.role !== 'super_admin') {
          router.replace(`/org/${orgId}/settings`);
          return;
        }
        setRole(data.role);
      })
      .catch(() => router.replace(`/org/${orgId}/settings`));

    fetch(`/api/org/${orgId}/department`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setDepartments(data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load connection status.');
      setIntegration(data);
      setMapping(Object.fromEntries((data.knowledgeBases || []).map((kb) => [kb.kbId, kb.departmentId])));
      if (data.connected) await loadKnowledgeBases();
    } catch (err) {
      setError(err.message || 'Failed to load connection status.');
    } finally {
      setLoading(false);
    }
  };

  const loadKnowledgeBases = async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow/knowledge-bases`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to read the knowledge bases.');
      setAvailable(data.knowledgeBases || []);
    } catch (err) {
      setError(err.message || 'Failed to read the knowledge bases.');
      setAvailable([]);
    }
  };

  const loadSyncRuns = async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow/sync-runs`);
      const data = await res.json().catch(() => ({}));
      setSyncRuns(Array.isArray(data.syncRuns) ? data.syncRuns : []);
    } catch {
      setSyncRuns([]);
    }
  };

  useEffect(() => {
    if (role !== 'super_admin') return;
    loadStatus();
    loadSyncRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, orgId]);

  const connect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to connect.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      setNotice('Connected. Now pick which knowledge bases to sync.');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Failed to connect.');
    } finally {
      setConnecting(false);
    }
  };

  const saveMapping = async () => {
    const knowledgeBases = (available || [])
      .filter((kb) => mapping[kb.id])
      .map((kb) => ({ kbId: kb.id, title: kb.title, departmentId: mapping[kb.id] }));
    setSavingMapping(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeBases }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save.');
      setNotice('Saved. Run Sync Now to bring the articles in.');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSavingMapping(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to start sync.');
      await loadSyncRuns();
    } catch (err) {
      setError(err.message || 'Failed to start sync.');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect ServiceNow? Future syncs will stop until you reconnect. Already-published articles stay in the repository.')) return;
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/servicenow`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect.');
      setAvailable(null);
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Failed to disconnect.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (!role) {
    return (
      <Layout orgId={orgId}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  const connected = integration?.connected;
  const mappingChanged =
    JSON.stringify(Object.entries(mapping).filter(([, d]) => d).sort()) !==
    JSON.stringify((integration?.knowledgeBases || []).map((kb) => [kb.kbId, kb.departmentId]).sort());

  const connectForm = (
    <form onSubmit={connect} className="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <label className="block">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Instance address</span>
        <input
          className={inputClass}
          placeholder="https://yourcompany.service-now.com"
          value={form.instanceUrl}
          onChange={(e) => setForm({ ...form, instanceUrl: e.target.value })}
          required
        />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Sign in with</span>
        <select className={inputClass} value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })}>
          <option value="basic">Integration user (user name and password)</option>
          <option value="oauth">OAuth client credentials</option>
        </select>
      </label>
      {form.authType === 'oauth' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputClass} placeholder="Client ID" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required />
          <input className={inputClass} type="password" autoComplete="new-password" placeholder="Client secret" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} required />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={inputClass} autoComplete="off" placeholder="User name" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input className={inputClass} type="password" autoComplete="new-password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Use a read-only integration user (roles <code>knowledge</code> and <code>snc_read_only</code>). KMS only reads
        published Knowledge Base articles and never writes to ServiceNow. The credentials are stored encrypted.
      </p>
      <div className="flex gap-2">
        <button type="submit" disabled={connecting} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm">
          {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
          Test and connect
        </button>
        {connected && (
          <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
            Cancel
          </button>
        )}
      </div>
    </form>
  );

  return (
    <Layout orgId={orgId}>
      <div className="max-w-5xl mx-auto py-8 px-4">
        <button
          onClick={() => router.push(`/org/${orgId}/settings?tab=integrations`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Integrations
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">ServiceNow Knowledge Base</h1>
            <p className="text-sm text-gray-500">Make published ServiceNow knowledge articles searchable in KMS.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            {notice}
          </div>
        )}

        {loading && !integration ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : connected ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Connected to {integration.instanceUrl} as {integration.account}.
              {integration.lastSyncAt && (
                <span className="text-green-700/70 dark:text-green-300/70">
                  &middot; Last synced {new Date(integration.lastSyncAt).toLocaleString()}
                </span>
              )}
            </div>

            {showForm && connectForm}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Knowledge bases</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Each synced knowledge base's articles become documents of the department you pick. Only people with access
                to that department see them.
              </p>
              {available === null ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : available.length === 0 ? (
                <p className="text-sm text-gray-500">No active knowledge bases found on this instance.</p>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Knowledge base</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Department</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {available.map((kb) => (
                        <tr key={kb.id} className="bg-white dark:bg-gray-900">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 dark:text-gray-100">{kb.title}</p>
                            {kb.description && <p className="text-xs text-gray-500 truncate max-w-md">{kb.description}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={mapping[kb.id] || ''}
                              onChange={(e) => setMapping((prev) => ({ ...prev, [kb.id]: e.target.value }))}
                              className={inputClass}
                            >
                              <option value="">Don't sync</option>
                              {departments.map((dept) => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {mappingChanged && (
                <button
                  onClick={saveMapping}
                  disabled={savingMapping}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {savingMapping && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save knowledge bases
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={triggerSync}
                disabled={syncing || mappingChanged || !(integration.knowledgeBases || []).length}
                title={mappingChanged ? 'Save the knowledge bases first' : undefined}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
                Sync Now
              </button>
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                >
                  <KeyRound className="h-4 w-4" /> Change credentials
                </button>
              )}
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm ml-auto"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                Disconnect
              </button>
            </div>

            {syncRuns.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sync History</h3>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                  {syncRuns.map((run) => (
                    <div key={run.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-gray-500">
                          {new Date(run.startedAt).toLocaleString()}
                          {run.trigger === 'scheduled' ? ' · Scheduled' : ' · Manual'}
                        </span>
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                          run.status === 'completed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : run.status === 'failed'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        )}>
                          {run.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {run.filesFound} article{run.filesFound === 1 ? '' : 's'} synced
                        {run.filesFailed > 0 ? `, ${run.filesFailed} failed` : ''}
                      </p>
                      {run.error && <p className="text-xs text-red-600">{run.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {integration?.status === 'disconnected' && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Previously connected, currently disconnected. Connect again to resume syncing.
              </p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connect your ServiceNow instance with a read-only integration user, then pick which knowledge bases to sync
              and map each to a department.
            </p>
            {connectForm}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
