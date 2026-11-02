'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import Picker, { CATEGORIES } from '@/components/governance/ScopePicker';

// B-18 (E25): periodic review policies. A policy says how often documents
// must be re-confirmed, who reviews them and when an overdue review is
// escalated. Without a policy no periodic reviews are created. The
// "Periodic review scan" scheduled job applies them.
const EMPTY = { name: '', intervalDays: 365, reviewerType: 'owner', escalateAfterDays: 7, departmentIds: [], categories: [] };
const FIELD = 'mt-1 w-full rounded border bg-transparent p-2';

export default function ReviewPoliciesPage() {
  const { orgId } = useParams();
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/org/${orgId}/review-policies`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Unable to load policies');
    setItems(d.items || []);
  }, [orgId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
    fetch(`/api/org/${orgId}/department`).then((r) => r.json()).then((d) => Array.isArray(d) && setDepartments(d)).catch(() => {});
  }, [load, orgId]);

  const deptName = (id) => departments.find((d) => d.id === id)?.name || 'Unknown department';
  const scope = (p) => [
    p.departmentIds.length ? p.departmentIds.map(deptName).join(', ') : 'All departments',
    p.categories.length ? p.categories.join(', ') : 'all categories',
  ].join(' · ');

  async function send(url, method, body, done) {
    setError(''); setNotice(''); setSaving(true);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to save policy');
      setNotice(done); await load();
      return true;
    } catch (e) { setError(e.message); return false; } finally { setSaving(false); }
  }

  async function submit(e) {
    e.preventDefault();
    const body = { ...form, intervalDays: Number(form.intervalDays), escalateAfterDays: Number(form.escalateAfterDays) };
    const ok = editingId
      ? await send(`/api/org/${orgId}/review-policies/${editingId}`, 'PATCH', body, 'Policy updated.')
      : await send(`/api/org/${orgId}/review-policies`, 'POST', body, 'Policy created. The next periodic review scan applies it.');
    if (ok) { setForm(EMPTY); setEditingId(null); }
  }
  const edit = (p) => { setEditingId(p.id); setForm({ name: p.name, intervalDays: p.intervalDays, reviewerType: p.reviewerType, escalateAfterDays: p.escalateAfterDays, departmentIds: p.departmentIds, categories: p.categories }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  return <Layout><main className="mx-auto max-w-4xl space-y-6 p-6">
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold">Periodic review policies</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">A policy says how often published documents must be re-confirmed and who confirms them. Documents due under a policy get a review in their reviewer&apos;s <Link className="underline" href={`/org/${orgId}/workflow-tasks`}>My Tasks</Link> when the <em>Periodic review scan</em> runs (Org Settings → Scheduled Jobs). When several policies match a document, the oldest one applies.</p>
    </header>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {notice && <p role="status" className="text-green-700">{notice}</p>}

    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">{editingId ? 'Edit policy' : 'New policy'}</h2>
      <label className="block text-sm">Policy name<input required maxLength={120} className={FIELD} value={form.name} onChange={set('name')} /></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">Review every (days)<input type="number" min="1" max="3650" required className={FIELD} value={form.intervalDays} onChange={set('intervalDays')} /></label>
        <label className="block text-sm">Reviewer<select className={FIELD} value={form.reviewerType} onChange={set('reviewerType')}><option value="owner">Document owner</option><option value="steward">Document steward (owner if none)</option></select></label>
        <label className="block text-sm">Escalate when overdue by (days)<input type="number" min="1" max="365" required className={FIELD} value={form.escalateAfterDays} onChange={set('escalateAfterDays')} /></label>
      </div>
      <Picker legend="Departments" hint="Leave empty to cover every department." options={departments.map((d) => ({ value: d.id, label: d.name }))} selected={form.departmentIds} onChange={set('departmentIds')} />
      <Picker legend="Categories" hint="Leave empty to cover every category." options={CATEGORIES.map((c) => ({ value: c, label: c }))} selected={form.categories} onChange={set('categories')} />
      <div className="flex gap-2">
        <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create policy'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="rounded border px-4 py-2">Cancel</button>}
      </div>
    </form>

    <section className="space-y-2">
      <h2 className="font-semibold">Policies</h2>
      {items.length === 0 ? <p className="text-sm text-gray-500">No policies yet, so no periodic reviews are created.</p> : items.map((p) => <article key={p.id} className={`flex flex-wrap items-center justify-between gap-3 rounded border p-3 ${p.active ? '' : 'opacity-60'}`}>
        <div className="min-w-0">
          <p className="font-medium">{p.name} {!p.active && <span className="ml-1 rounded-full border px-2 text-xs">Off</span>}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">Every {p.intervalDays} days · reviewer: {p.reviewerType === 'owner' ? 'owner' : 'steward'} · escalate after {p.escalateAfterDays} days overdue</p>
          <p className="text-xs text-gray-500">{scope(p)}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={() => edit(p)} className="rounded border px-3 py-1 text-sm">Edit</button>
          <button type="button" disabled={saving} onClick={() => send(`/api/org/${orgId}/review-policies/${p.id}`, 'PATCH', { active: !p.active }, p.active ? 'Policy turned off.' : 'Policy turned on.')} className="rounded border px-3 py-1 text-sm">{p.active ? 'Turn off' : 'Turn on'}</button>
        </div>
      </article>)}
    </section>
  </main></Layout>;
}
