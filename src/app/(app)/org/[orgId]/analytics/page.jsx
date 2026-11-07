'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';

function ListTable({ title, rows, columns, empty = 'No activity in this period' }) {
  return <section className="rounded-xl border p-4 space-y-3">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="overflow-x-auto"><table className="w-full text-sm text-left">
      <thead><tr>{columns.map(([key, label]) => <th key={key} className="border-b p-2">{label}</th>)}</tr></thead>
      <tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}>{columns.map(([key, , render]) => <td key={key} className="border-b p-2 break-words">{render ? render(row[key], row) : String(row[key] ?? '—')}</td>)}</tr>) : <tr><td colSpan={columns.length} className="p-3 text-gray-500">{empty}</td></tr>}</tbody>
    </table></div>
  </section>;
}

export default function AnalyticsPage() {
  const { orgId } = useParams();
  const [days, setDays] = useState('30');
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ days });
      if (departmentId.trim()) query.set('departmentId', departmentId.trim());
      const response = await fetch(`/api/org/${encodeURIComponent(orgId)}/analytics?${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analytics unavailable');
      setData(payload);
    } catch (err) { setError(err.message); setData(null); }
    finally { setLoading(false); }
  }, [orgId, days, departmentId]);
  useEffect(() => { load(); }, [load]);
  return <Layout><main className="mx-auto max-w-6xl p-6 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Search analytics</h1><p className="text-sm text-gray-500">Search activity and discovery trends. Department administrators see only managed departments.</p></div><Link href={`/org/${orgId}/governance-metrics`} className="underline text-blue-700">Governance metrics</Link></header>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Period<select value={days} onChange={(e) => setDays(e.target.value)} className="block border rounded p-2"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><label className="text-sm">Department ID (optional)<input className="block border rounded p-2" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} placeholder="All permitted" /></label><button className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {data && <><p className="text-sm text-gray-500">Scope: {data.filters.scope === 'organization' ? 'Organization' : 'Managed departments'} · Retrieval latency excludes embedding and response-generation time.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ['Search events', data.summary.total], ['No-result searches', data.summary.noResults], ['No-result rate', `${data.summary.noResultRate}%`],
        ['Average retrieval latency', data.summary.averageLatencyMs === null ? 'N/A' : `${data.summary.averageLatencyMs} ms`], ['Recorded clicks', data.summary.clicks], ['Reformulations', data.summary.reformulations],
      ].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>
      <ListTable title="Top queries" rows={data.topQueries} columns={[["query", "Query"], ["count", "Searches"]]} />
      <ListTable title="No-result queries" rows={data.noResultQueries} columns={[["query", "Query"], ["count", "Searches"]]} />
      <ListTable title="Recent search activity" rows={data.recent} columns={[["createdAt", "When", (v) => new Date(v).toLocaleString()], ["kind", "Source"], ["normalizedQuery", "Query"], ["resultCount", "Results"], ["latencyMs", "Retrieval ms"]]} />
    </>}
  </main></Layout>;
}
