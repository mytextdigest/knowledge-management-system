'use client';
import { useEffect, useState } from 'react';

export default function AuditEventList({ url, title = 'Governance events', documentMode = false }) {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ entries: [], totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setPage(1); }, [url, action, from, to]);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (action.trim()) params.set('action', action.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    setLoading(true); setError('');
    fetch(`${url}?${params}`, { signal: controller.signal })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Unable to load events'); return data; })
      .then(setResult)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, action, from, to, page]);
  return <section className="space-y-3" aria-label={title}>
    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
    <div className="flex flex-wrap gap-2 text-sm">
      <label className="flex flex-col gap-1">Event type
        <input aria-label="Event type" value={action} onChange={e => setAction(e.target.value)} placeholder="e.g. document.published" className="rounded border px-2 py-1 bg-transparent" />
      </label>
      <label className="flex flex-col gap-1">From (UTC)
        <input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} className="rounded border px-2 py-1 bg-transparent" />
      </label>
      <label className="flex flex-col gap-1">To (UTC)
        <input aria-label="To date" type="date" value={to} onChange={e => setTo(e.target.value)} className="rounded border px-2 py-1 bg-transparent" />
      </label>
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p>Loading events...</p> : !error && result.entries.length === 0 ? <p className="text-sm text-gray-500">No recorded events match these filters.</p> : null}
    {!error && <ol className="divide-y rounded border dark:border-gray-700">
      {result.entries.map(entry => <li key={entry.id} className="p-3 text-sm">
        <div className="font-medium">{entry.action}</div>
        {!documentMode && entry.entityType && <div className="text-xs text-gray-500">{entry.entityType}: {entry.entityId || '—'}</div>}
        <div className="text-xs text-gray-500">{entry.actor?.name || entry.actor?.email || 'System'} · {new Date(entry.createdAt).toLocaleString()}</div>
      </li>)}
    </ol>}
    <div className="flex items-center gap-3 text-sm">
      <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
      <span>Page {page} of {result.totalPages} ({result.total} events)</span>
      <button type="button" disabled={page >= result.totalPages || loading} onClick={() => setPage(p => p + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
    </div>
  </section>;
}
