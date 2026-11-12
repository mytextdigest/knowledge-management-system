'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import AnalyticsTabs from '@/components/analytics/AnalyticsTabs';

const card = 'rounded-xl border border-gray-200 dark:border-gray-700';
const control = 'mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const SOURCE_LABELS = { search: 'Search', repository: 'Repository', chat: 'Chat' };

function StatTile({ label, value }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function ListTable({ title, rows, columns, empty = 'No activity in this period' }) {
  return (
    <section className={`${card} p-4`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th key={key} className="border-b border-gray-200 p-2 font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={row.id || index}>
                {columns.map(([key, , render]) => (
                  <td key={key} className="break-words border-b border-gray-100 p-2 text-gray-800 dark:border-gray-800 dark:text-gray-200">
                    {render ? render(row[key], row) : String(row[key] ?? 'â€”')}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="p-3 text-gray-500">{empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  const { orgId } = useParams();
  const [days, setDays] = useState('30');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/org/${encodeURIComponent(orgId)}/department`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setDepartments(Array.isArray(list) ? list : []))
      .catch(() => setDepartments([]));
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ days });
      if (departmentId) query.set('departmentId', departmentId);
      const response = await fetch(`/api/org/${encodeURIComponent(orgId)}/analytics?${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analytics unavailable');
      setData(payload);
    } catch (err) { setError(err.message); setData(null); }
    finally { setLoading(false); }
  }, [orgId, days, departmentId]);
  useEffect(() => { load(); }, [load]);

  const departmentName = Object.fromEntries(departments.map((d) => [d.id, d.name]));
  const isOrgScope = data?.filters?.scope === 'organization';
  // Department admins can only filter to the departments they manage.
  const permitted = data?.filters?.permittedDepartmentIds;
  const departmentOptions = permitted ? departments.filter((d) => permitted.includes(d.id)) : departments;

  return (
    <Layout>
      <main className="mx-auto max-w-6xl space-y-6 p-6 text-gray-900 dark:text-gray-100">
        <header>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <Link href={`/org/${orgId}/analytics/usage`} className="text-sm text-blue-700 underline dark:text-blue-400">Usage &amp; Adoption</Link>
          <p className="text-sm text-gray-500 dark:text-gray-400">Search activity and discovery trends. Department administrators see searches by members of the departments they manage.</p>
        </header>
        <AnalyticsTabs orgId={orgId} showGovernance={isOrgScope} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">Period
            <select value={days} onChange={(e) => setDays(e.target.value)} className={control}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">Department
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={control}>
              <option value="">{isOrgScope || !data ? 'All departments' : 'All my departments'}</option>
              {departmentOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
        </div>

        {error && <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:border-red-800 dark:text-red-300">{error}</p>}

        {data && <>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Scope: {isOrgScope ? 'whole organization' : 'departments you manage'}
            {data.filters.departmentId ? ` Â· ${departmentName[data.filters.departmentId] || 'one department'}` : ''}
            {' '}Â· Retrieval latency excludes embedding and answer-generation time.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Searches" value={data.summary.total} />
            <StatTile label="No-result searches" value={data.summary.noResults} />
            <StatTile label="No-result rate" value={`${data.summary.noResultRate}%`} />
            <StatTile label="Average retrieval latency" value={data.summary.averageLatencyMs === null ? 'N/A' : `${data.summary.averageLatencyMs} ms`} />
            <StatTile label="Result clicks" value={data.summary.clicks} />
            <StatTile label="Reformulations" value={data.summary.reformulations} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ListTable title="Top queries" rows={data.topQueries} columns={[['query', 'Query'], ['count', 'Searches']]} />
            <ListTable title="No-result queries" rows={data.noResultQueries} columns={[['query', 'Query'], ['count', 'Searches']]} />
          </div>
          <ListTable
            title="Recent search activity"
            rows={data.recent}
            columns={[
              ['createdAt', 'When', (v) => new Date(v).toLocaleString()],
              ['kind', 'Source', (v) => SOURCE_LABELS[v] || v],
              ['normalizedQuery', 'Query'],
              ['departmentId', 'Department', (v) => (v ? departmentName[v] || 'â€”' : 'â€”')],
              ['resultCount', 'Results'],
              ['latencyMs', 'Retrieval ms', (v) => (v ?? 'â€”')],
            ]}
          />
        </>}
      </main>
    </Layout>
  );
}
