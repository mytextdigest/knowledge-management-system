'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import AnalyticsTabs from '@/components/analytics/AnalyticsTabs';

// D-7: Usage & adoption dashboard (E29).

const card = 'rounded-xl border border-gray-200 dark:border-gray-700';
const control = 'mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
const heading = 'mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const ROLE_LABELS = { super_admin: 'Super admin', dept_admin: 'Department admin', member: 'Member', guest: 'Guest', unknown: 'Unknown' };
const SERIES_COLORS = ['#2563eb', '#d97706'];

const pct = (n) => `${(100 * (n || 0)).toFixed(1)}%`;
const ms = (n) => (n === null || n === undefined ? '—' : n >= 10000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function StatTile({ label, value, hint }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

// A small dependency-free chart: stacked bars or lines over the daily series.
function TrendChart({ title, data, series, kind = 'bar', format = (v) => v, max }) {
  const width = 600, height = 160, pad = { l: 44, r: 8, t: 8, b: 22 };
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
  const values = data.map((d) => (kind === 'bar'
    ? series.reduce((sum, s) => sum + (Number(d[s.key]) || 0), 0)
    : Math.max(...series.map((s) => Number(d[s.key]) || 0))));
  const top = max ?? Math.max(1, ...values);
  const step = plotW / Math.max(1, data.length);
  const y = (v) => pad.t + plotH - (Math.min(v, top) / top) * plotH;
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <section className={`${card} p-4`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className={heading.replace('mb-3 ', '')}>{title}</h2>
        <div className="flex gap-3 text-xs text-gray-600 dark:text-gray-300">
          {series.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: SERIES_COLORS[i] }} />{s.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={width - pad.r} y1={y(top * f)} y2={y(top * f)} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="1" />
            <text x={pad.l - 6} y={y(top * f) + 4} textAnchor="end" className="fill-gray-500 dark:fill-gray-400" fontSize="10">{format(top * f)}</text>
          </g>
        ))}
        {kind === 'bar' ? data.map((d, i) => {
          let base = 0;
          return series.map((s, j) => {
            const v = Number(d[s.key]) || 0;
            const rect = <rect key={`${d.date}-${s.key}`} x={pad.l + i * step + step * 0.15} width={step * 0.7} y={y(base + v)} height={Math.max(0, y(base) - y(base + v))} fill={SERIES_COLORS[j]}><title>{`${shortDate(d.date)} · ${s.label}: ${format(v)}`}</title></rect>;
            base += v;
            return rect;
          });
        }) : series.map((s, j) => (
          <g key={s.key}>
            <polyline fill="none" stroke={SERIES_COLORS[j]} strokeWidth="2"
              points={data.map((d, i) => `${pad.l + i * step + step / 2},${y(Number(d[s.key]) || 0)}`).join(' ')} />
            {data.map((d, i) => (
              <circle key={d.date} cx={pad.l + i * step + step / 2} cy={y(Number(d[s.key]) || 0)} r="2.5" fill={SERIES_COLORS[j]}>
                <title>{`${shortDate(d.date)} · ${s.label}: ${format(Number(d[s.key]) || 0)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {data.map((d, i) => (i % labelEvery === 0 ? (
          <text key={d.date} x={pad.l + i * step + step / 2} y={height - 6} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" fontSize="10">{shortDate(d.date)}</text>
        ) : null))}
      </svg>
    </section>
  );
}

function Table({ title, columns, rows, empty = 'No activity in this period' }) {
  return (
    <section className={`${card} p-4`}>
      <h2 className={heading}>{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>{columns.map(([key, label]) => <th key={key} className="border-b border-gray-200 p-2 font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={index}>
                {columns.map(([key, , render]) => (
                  <td key={key} className="break-words border-b border-gray-100 p-2 text-gray-800 dark:border-gray-800 dark:text-gray-200">{render ? render(row[key], row) : String(row[key] ?? '—')}</td>
                ))}
              </tr>
            )) : <tr><td colSpan={columns.length} className="p-3 text-gray-500">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function UsageAnalyticsPage() {
  const { orgId } = useParams();
  const [days, setDays] = useState('7');
  const [departmentId, setDepartmentId] = useState('');
  const [role, setRole] = useState('');
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

  const query = useMemo(() => {
    const q = new URLSearchParams({ days });
    if (departmentId) q.set('departmentId', departmentId);
    if (role) q.set('role', role);
    return q.toString();
  }, [days, departmentId, role]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/org/${encodeURIComponent(orgId)}/analytics/usage?${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Usage analytics unavailable');
      setData(payload);
    } catch (err) { setError(err.message); setData(null); }
    finally { setLoading(false); }
  }, [orgId, query]);
  useEffect(() => { load(); }, [load]);

  const departmentName = Object.fromEntries(departments.map((d) => [d.id, d.name]));
  const isOrgScope = data?.filters?.scope === 'organization';
  const permitted = data?.filters?.permittedDepartmentIds;
  const departmentOptions = permitted ? departments.filter((d) => permitted.includes(d.id)) : departments;
  const s = data?.summary;
  const p = data?.performance;

  return (
    <Layout>
      <main className="mx-auto max-w-6xl space-y-6 p-6 text-gray-900 dark:text-gray-100">
        <header>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Usage and adoption: how many people search and ask, whether they find what they need, and how fast.</p>
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
          <label className="text-sm text-gray-700 dark:text-gray-300">Role
            <select value={role} onChange={(e) => setRole(e.target.value)} className={control}>
              <option value="">All roles</option>
              {['super_admin', 'dept_admin', 'member', 'guest'].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
          <a href={`/api/org/${encodeURIComponent(orgId)}/analytics/usage?${query}&format=csv`} className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </div>

        {error && <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:border-red-800 dark:text-red-300">{error}</p>}

        {data && <>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Scope: {isOrgScope ? 'whole organization' : 'departments you manage'}
            {data.filters.departmentId ? ` · ${departmentName[data.filters.departmentId] || 'one department'}` : ''}
            {data.filters.role ? ` · ${ROLE_LABELS[data.filters.role]}` : ''}
            {' '}· Days are UTC. A bounce is a search with no click and no further search or question within 60 seconds.
            {data.liveDays > 1 ? ` ${data.liveDays} days were computed live; turn on the "Usage analytics roll-up" job in Scheduled jobs.` : ''}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile label="Searches" value={s.searches} />
            <StatTile label="Questions" value={s.questions} hint="Chat questions to the org assistant" />
            <StatTile label="Active users" value={s.activeUsers} hint="People who searched or asked" />
            <StatTile label="Click-through rate" value={pct(s.ctr)} hint="Searches with at least one result opened" />
            <StatTile label="Bounce rate" value={pct(s.bounceRate)} hint="No click and no follow-up within 60 s" />
            <StatTile label="Time to answer" value={ms(s.p50TimeToAnswerMs)} hint={`Median; average ${ms(s.avgTimeToAnswerMs)}. To first click or first answer word`} />
          </div>

          <section className={`${card} p-4`}>
            <h2 className={heading}>Performance</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div><p className="text-gray-500 dark:text-gray-400">Search retrieval p50 / p95</p><p className="text-lg font-semibold">{ms(p.p50SearchMs)} / {ms(p.p95SearchMs)}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400">AI answer, first word p50 / p95</p><p className="text-lg font-semibold">{ms(p.p50AnswerMs)} / {ms(p.p95AnswerMs)}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400">Time to answer p95</p><p className="text-lg font-semibold">{ms(p.p95TimeToAnswerMs)}</p></div>
              <div><p className="text-gray-500 dark:text-gray-400">Target</p><p className="text-lg font-semibold">under 10 s</p></div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart title="Searches and questions" data={data.daily} series={[{ key: 'searches', label: 'Searches' }, { key: 'questions', label: 'Questions' }]} format={(v) => Math.round(v)} />
            <TrendChart title="Active users" data={data.daily} series={[{ key: 'activeUsers', label: 'Active users' }]} format={(v) => Math.round(v)} />
            <TrendChart title="Click-through and bounce rate" kind="line" data={data.daily} max={1} series={[{ key: 'ctr', label: 'Click-through' }, { key: 'bounceRate', label: 'Bounce' }]} format={(v) => `${Math.round(v * 100)}%`} />
            <TrendChart title="Average time to answer" data={data.daily} series={[{ key: 'avgTimeToAnswerMs', label: 'Time to answer' }]} format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Table title="Adoption by department and role" rows={data.breakdown} columns={[
              ['departmentId', 'Department', (v) => (v ? departmentName[v] || '—' : 'No department')],
              ['role', 'Role', (v) => ROLE_LABELS[v] || v],
              ['activeUsers', 'Active users'],
              ['searches', 'Searches'],
              ['questions', 'Questions'],
              ['ctr', 'CTR', (v, row) => (row.searches ? pct(v) : '—')],
            ]} />
            <Table title="Top queries" rows={data.topQueries} columns={[['query', 'Query'], ['count', 'Times']]} />
          </div>
        </>}
      </main>
    </Layout>
  );
}
