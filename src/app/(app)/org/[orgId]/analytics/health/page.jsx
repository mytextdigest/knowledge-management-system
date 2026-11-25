'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Download, Loader2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import AnalyticsTabs from '@/components/analytics/AnalyticsTabs';

const control = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const measures = [
  ['stale','Stale documents'], ['unowned','Missing owners'], ['reviewDue','Reviews due'],
  ['reviewOverdue','Overdue reviews'], ['broken','Documents with broken links'],
  ['duplicate','Open duplicate flags'], ['incomplete','Missing required metadata'],
];
export default function ContentHealthPage() {
  const { orgId } = useParams();
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [knowledge, setKnowledge] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [departmentId, setDepartmentId] = useState('');
  const [sourceSystem, setSourceSystem] = useState('');
  const [metric, setMetric] = useState('');
  const [page, setPage] = useState(1);
  const params = useMemo(() => {
    const q = new URLSearchParams();
    if (departmentId) q.set('departmentId', departmentId);
    if (sourceSystem) q.set('sourceSystem', sourceSystem);
    if (metric) q.set('metric', metric);
    q.set('page', String(page));
    return q.toString();
  }, [departmentId, sourceSystem, metric, page]);
  const path = `/api/org/${encodeURIComponent(orgId)}/analytics/health?${params}`;
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/org/${encodeURIComponent(orgId)}/health`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(setKnowledge).catch(() => setKnowledge(null));
    fetch(`/api/org/${encodeURIComponent(orgId)}/department`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : []).then(rows => setDepartments(Array.isArray(rows) ? rows : []))
      .catch(() => setDepartments([]));
  }, [orgId]);
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    setLoading(true); setError('');
    fetch(path, { cache: 'no-store' })
      .then(async r => { const body = await r.json(); if (!r.ok) throw Error(body.error || 'Content health unavailable'); return body; })
      .then(body => { if (active) setData(body); })
      .catch(e => { if (active) { setError(e.message); setData(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orgId, path]);
  const total = data?.counts?.total || 0;
  const orgScope = data?.filters?.scope === 'organization';
  const allowed = data?.filters?.permittedDepartmentIds;
  const departmentOptions = allowed ? departments.filter(d => allowed.includes(d.id)) : departments;
  const metricLabel = measures.find(([key]) => key === metric)?.[1];
  const value = key => key === 'broken' ? data.counts.brokenLinks : key === 'duplicate' ? data.counts.duplicates : key === 'unowned' ? total - data.counts.owned : key === 'incomplete' ? total - data.counts.complete : data.counts[key];
  return <Layout><main className="mx-auto max-w-6xl space-y-6 p-6 text-gray-900 dark:text-gray-100">
    <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Analytics</h1>
    <AnalyticsTabs orgId={orgId} showGovernance={orgScope}/>
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">Department
        <select className={control} value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPage(1); }}>
          <option value="">{orgScope ? 'All departments' : 'All my departments'}</option>
          {departmentOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">Source
        <select className={control} value={sourceSystem} onChange={e => { setSourceSystem(e.target.value); setPage(1); }}>
          <option value="">All sources</option><option value="manual">Manual</option><option value="sharepoint">SharePoint</option><option value="servicenow">ServiceNow</option>
        </select>
      </label>
      <a className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800" href={`${path}&format=csv`}><Download size={16}/>Export CSV</a>
    </div>
    {error && <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:border-red-800 dark:text-red-300">{error}</p>}
    {loading && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="animate-spin" size={18}/>Loading content health…</div>}
    {!loading && data && <>
      <p className="text-sm text-gray-600 dark:text-gray-400">{total} accessible documents · {orgScope ? 'whole organization' : 'departments you manage'}. Stale documents use the governance scan&apos;s archived lifecycle suggestion.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{measures.map(([key,label]) => <button type="button" key={key} onClick={() => { setMetric(metric === key ? '' : key); setPage(1); }} aria-pressed={metric === key} className={`rounded-lg border p-4 text-left dark:border-gray-700 ${metric === key ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30' : 'border-gray-200'}`}>
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
        <strong className="mt-1 block text-2xl font-bold text-gray-900 dark:text-gray-100">{value(key)}</strong>
      </button>)}</div>
      {knowledge && <section className="space-y-3"><h2 className="text-lg font-semibold">Knowledge health</h2><div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Answer confidence</span><strong className="mt-1 block text-2xl font-bold text-gray-900 dark:text-gray-100">{knowledge.confidence.avgScore === null ? '—' : `${Math.round(knowledge.confidence.avgScore * 100)}%`}</strong><p className="text-xs text-gray-500 dark:text-gray-400">Last {knowledge.confidence.sampleSize} answers</p></div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Open conflicts</span><strong className="mt-1 block text-2xl font-bold text-gray-900 dark:text-gray-100">{knowledge.conflicts.openCount}</strong><ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">{knowledge.conflicts.items.slice(0,3).map(c => <li key={c.id}>{c.summary}</li>)}</ul></div>
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"><span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Knowledge gaps</span><strong className="mt-1 block text-2xl font-bold text-gray-900 dark:text-gray-100">{knowledge.gaps.length}</strong><ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">{knowledge.gaps.slice(0,3).map(g => <li key={g.topic}>{g.topic}</li>)}</ul></div>
      </div></section>}
      <section className="space-y-2"><h2 className="text-lg font-semibold">Content recency</h2><div className="grid grid-cols-3 gap-3">{[['under30','Under 30 days'],['days30to90','30–89 days'],['over90','90+ days']].map(([key,label]) => <div key={key} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span><strong className="mt-1 block text-2xl font-bold text-gray-900 dark:text-gray-100">{data.buckets[key]}</strong></div>)}</div></section>
      <section className="space-y-3"><h2 className="text-lg font-semibold">Document drill-through{metricLabel ? ` — ${metricLabel}` : ''}</h2>
        {data.documents.length === 0 ? <p className="rounded-md border border-gray-200 p-6 text-sm text-gray-500 dark:border-gray-700">No documents match these filters.</p> :
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-600 dark:bg-gray-900 dark:text-gray-300"><tr>{['Document','Age (days)','Broken links','Missing metadata'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{data.documents.map(d => <tr key={d.id} className="border-t border-gray-200 dark:border-gray-700"><td className="p-3"><Link className="text-blue-600 underline dark:text-blue-400" href={`/document?id=${encodeURIComponent(d.id)}`}>{d.filename}</Link></td><td className="p-3">{d.ageDays}</td><td className="p-3">{d.brokenLinks}</td><td className="p-3">{d.missing.join(', ') || '—'}</td></tr>)}</tbody></table></div>}
        <div className="flex items-center justify-between text-sm"><span>{data.pagination?.matching ?? data.documents.length} matching documents</span><div className="flex items-center gap-3"><button className={control} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className={control} disabled={!data.pagination?.hasMore} onClick={() => setPage(page + 1)}>Next</button></div></div>
      </section>
    </>}
  </main></Layout>;
}
