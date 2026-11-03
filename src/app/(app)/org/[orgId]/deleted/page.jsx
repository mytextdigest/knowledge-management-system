'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';

// B-9 (E23): deleted documents stay recoverable until they're purged. Lists
// what the viewer may restore (their own uploads; admins: their departments';
// super admins: all) with the purge date from the retention setting.
const day = (d) => new Date(d).toLocaleDateString();
export default function DeletedDocumentsPage() {
  const { orgId } = useParams();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/org/${encodeURIComponent(orgId)}/deleted-documents`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Unable to load deleted documents');
    setItems(body.items || []);
  }, [orgId]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function restore(doc) {
    setBusyId(doc.id); setError(''); setNotice('');
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/restore`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not restore the document');
      setNotice(`"${doc.filename}" restored${doc.lifecycle === 'in_review' ? ' as a draft (its approval was cancelled when it was deleted)' : ''}.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusyId(null); }
  }

  return <Layout><main className="mx-auto max-w-5xl space-y-6 p-6">
    <header>
      <h1 className="text-2xl font-semibold">Recently deleted</h1>
      <p className="text-sm text-gray-500">Deleted documents are hidden from search, chat and the repository, and can be restored until their purge date. After that they&apos;re removed permanently.</p>
    </header>
    {error && <p role="alert" className="rounded border border-red-300 p-3 text-red-600">{error}</p>}
    {notice && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">{notice}</p>}
    {items === null ? <p>Loading…</p> : items.length === 0 ? <p className="text-sm text-gray-500">No deleted documents you can restore.</p> :
      <ul className="divide-y rounded-xl border">
        {items.map((d) => <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{d.filename}</p>
            <p className="text-sm text-gray-500">
              {d.department?.name || 'No department'} · deleted {day(d.deletedAt)}{d.deletedBy ? ` by ${d.deletedBy.name || d.deletedBy.email}` : ''} · {d.purgeAfter ? `purged after ${day(d.purgeAfter)}` : 'kept until restored (never purged)'}
            </p>
          </div>
          <button type="button" disabled={busyId === d.id} onClick={() => restore(d)} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">{busyId === d.id ? 'Restoring…' : 'Restore'}</button>
        </li>)}
      </ul>}
  </main></Layout>;
}
