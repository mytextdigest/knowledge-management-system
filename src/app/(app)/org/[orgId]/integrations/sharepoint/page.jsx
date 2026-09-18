'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Cloud, Loader2, CheckCircle2, AlertCircle, Unplug } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { cn } from '@/lib/utils';

export default function SharePointIntegrationPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState(null);
  const [departments, setDepartments] = useState([]);

  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectError, setConnectError] = useState(searchParams.get('error') || '');

  const [sites, setSites] = useState(null); // null = not in picker step
  const [selected, setSelected] = useState({}); // { [siteId]: departmentId | '' }
  const [confirming, setConfirming] = useState(false);

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
      const res = await fetch(`/api/org/${orgId}/integrations/sharepoint`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load connection status.');
      setIntegration(data);
    } catch (err) {
      setError(err.message || 'Failed to load connection status.');
    } finally {
      setLoading(false);
    }
  };

  const loadSites = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/sharepoint/sites`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load SharePoint sites.');
      setSites(data.sites || []);
      setSelected(Object.fromEntries((data.sites || []).map((s) => [s.id, ''])));
    } catch (err) {
      setError(err.message || 'Failed to load SharePoint sites.');
      setSites([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncRuns = async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/sharepoint/sync-runs`);
      const data = await res.json().catch(() => ({}));
      setSyncRuns(Array.isArray(data.syncRuns) ? data.syncRuns : []);
    } catch {
      setSyncRuns([]);
    }
  };

  useEffect(() => {
    if (role !== 'super_admin') return;
    if (searchParams.get('step') === 'picker') {
      loadSites();
    } else {
      loadStatus();
      loadSyncRuns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, orgId]);

  const confirmSelections = async () => {
    const selections = Object.entries(selected)
      .filter(([, departmentId]) => departmentId)
      .map(([siteId, departmentId]) => {
        const site = sites.find((s) => s.id === siteId);
        return { siteId, siteUrl: site?.webUrl, departmentId };
      });
    if (selections.length === 0) {
      setError('Pick a department for at least one site.');
      return;
    }
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/sharepoint/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to connect selected sites.');
      setSites(null);
      router.replace(`/org/${orgId}/integrations/sharepoint`);
      await loadStatus();
      await loadSyncRuns();
    } catch (err) {
      setError(err.message || 'Failed to connect selected sites.');
    } finally {
      setConfirming(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/sharepoint/sync`, { method: 'POST' });
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
    if (!confirm('Disconnect SharePoint? Future syncs will stop until you reconnect. Already-published documents stay in the repository.')) return;
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch(`/api/org/${orgId}/integrations/sharepoint`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect.');
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
            <Cloud className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SharePoint</h1>
            <p className="text-sm text-gray-500">Sync documents from a SharePoint site into this org's repository.</p>
          </div>
        </div>

        {connectError && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Connecting SharePoint failed: {connectError}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading && sites === null && !integration ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : sites !== null ? (
          // Site picker step — arrived here right after the Microsoft consent redirect.
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pick which SharePoint sites to sync, and map each to a KMS department. A site's files will
              become documents in that department once synced.
            </p>
            {sites.length === 0 ? (
              <p className="text-sm text-gray-500">No SharePoint sites found for this Microsoft tenant.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Site</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sites.map((site) => (
                      <tr key={site.id} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{site.name}</p>
                          <p className="text-xs text-gray-500 truncate max-w-xs">{site.webUrl}</p>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={selected[site.id] || ''}
                            onChange={(e) => setSelected((prev) => ({ ...prev, [site.id]: e.target.value }))}
                            className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div className="flex gap-2">
              <button
                onClick={confirmSelections}
                disabled={confirming || sites.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
              <button
                onClick={() => { setSites(null); router.replace(`/org/${orgId}/integrations/sharepoint`); loadStatus(); }}
                disabled={confirming}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : integration?.connected ? (
          // Already connected — show the current site-to-department mapping.
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-800 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              SharePoint is connected.
              {integration.lastSyncAt && (
                <span className="text-green-700/70 dark:text-green-300/70">
                  &middot; Last synced {new Date(integration.lastSyncAt).toLocaleString()}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
              {integration.sites.map((s) => (
                <div key={s.siteId} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.siteUrl}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex-shrink-0">
                    {s.departmentName || 'Unknown department'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={triggerSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
                Sync Now
              </button>
              <a
                href={`/api/org/${orgId}/integrations/sharepoint/connect`}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
              >
                <Cloud className="h-4 w-4" /> Connect another site
              </a>
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
                        {run.filesFound} file{run.filesFound === 1 ? '' : 's'} synced
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
          // Not connected (or previously disconnected).
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {integration?.status === 'disconnected' && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Previously connected, currently disconnected. Reconnecting will resume syncing.
              </p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Connect a SharePoint site to automatically bring its documents into KMS's ingestion pipeline.
              You'll sign in with your Microsoft admin account, then pick which site(s) to sync and map each
              to a department.
            </p>
            <a
              href={`/api/org/${orgId}/integrations/sharepoint/connect`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Cloud className="h-4 w-4" /> Connect SharePoint
            </a>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
