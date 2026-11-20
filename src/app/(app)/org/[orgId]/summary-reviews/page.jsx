'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';

export default function SummaryReviewsPage() {
  const { orgId } = useParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [edits, setEdits] = useState({});
  const [selected, setSelected] = useState([]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/org/${orgId}/summary-reviews`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load reviews');
      setItems(data.items || []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);
  const act = async (doc, action) => {
    setBusy(doc.id); setError('');
    try {
      // Browser SubtleCrypto hashes the exact snapshot currently displayed.
      const bytes = new TextEncoder().encode(doc.summary);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const expectedSummaryHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const response = await fetch(`/api/documents/${doc.id}/summary-review`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedSummaryHash, ...(action === 'edit' ? { summary: edits[doc.id] ?? doc.summary } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Update failed');
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  };
  const bulkApprove = async () => {
    setBusy('bulk'); setError('');
    try {
      const chosen = items.filter(d => selected.includes(d.id) && d.reviewStatus === 'pending');
      const payload = await Promise.all(chosen.map(async d => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d.summary));
        return { id: d.id, expectedSummaryHash: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('') };
      }));
      const response = await fetch(`/api/org/${orgId}/summary-reviews/bulk`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:payload})});
      const data = await response.json();
      if (!response.ok || data.approved !== payload.length) setError(`Approved ${data.approved || 0} of ${payload.length}; refresh and retry failures.`);
      setSelected([]); await load();
    } catch(e) {setError(e.message)} finally {setBusy('')}
  };
  return <Layout><main className="mx-auto max-w-5xl p-6 space-y-5">
    <h1 className="text-2xl font-semibold">Summary Review & Approval</h1>
    <p className="text-sm text-gray-500">Super administrators can edit or approve repository document summaries. Edited summaries require a separate approval.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <div className="flex gap-2"><button className="rounded border px-3 py-1" onClick={load}>Refresh</button><button className="rounded border px-3 py-1" disabled={!selected.length || !!busy} onClick={bulkApprove}>Approve selected ({selected.length})</button></div>
    {loading ? <p>Loading…</p> : items.length === 0 ? <p>No summaries found.</p> :
      items.map((doc) => <section key={doc.id} className="rounded-lg border p-4 space-y-3">
        <div className="flex justify-between gap-3"><label className="flex items-center gap-2"><input type="checkbox" disabled={doc.reviewStatus !== 'pending' || !!busy} checked={selected.includes(doc.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,doc.id]:old.filter(id=>id!==doc.id))}/><strong>{doc.filename || doc.id}</strong></label>
          <span>{doc.reviewStatus === 'approved' ? 'Approved' : 'Pending review'}</span></div>
        <textarea aria-label={`Summary for ${doc.filename || doc.id}`} className="w-full rounded border p-2" rows={5}
          value={edits[doc.id] ?? doc.summary} onChange={(e) => setEdits((prev) => ({ ...prev, [doc.id]: e.target.value }))} />
        <div className="flex gap-2">
          <button className="rounded border px-3 py-1" disabled={busy === doc.id || (edits[doc.id] ?? doc.summary) === doc.summary}
            onClick={() => act(doc, 'edit')}>Save edit</button>
          <button className="rounded border px-3 py-1" disabled={busy === doc.id || doc.reviewStatus === 'approved' || (edits[doc.id] ?? doc.summary) !== doc.summary}
            onClick={() => act(doc, 'approve')}>Approve current summary</button>
        </div>
      </section>)}
  </main></Layout>;
}
