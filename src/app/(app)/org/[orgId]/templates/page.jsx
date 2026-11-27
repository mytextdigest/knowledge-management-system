'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { TEMPLATE_FIELDS } from '@/lib/templates/assetTemplates';

// EKP E14.1 (E-16): asset templates (How-To, FAQ, SOP, Key Takeaways…).
// Super admins define each template's sections, guidance and required
// fields. Saving a change makes a new version; assets keep the version they
// were written from. Members use them from the repository: "New from template".
const FIELD = 'mt-1 w-full rounded border bg-transparent p-2';
const blankSection = () => ({ key: '', title: '', guidance: '', required: false });
const EMPTY = { name: '', sections: [{ ...blankSection(), required: true }], requiredFields: [] };

export default function TemplatesPage() {
  const { orgId } = useParams();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/org/${orgId}/templates?all=1`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Unable to load templates');
    setItems(d.templates || []);
    setLoaded(true);
  }, [orgId]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function send(url, method, body, done) {
    setError(''); setNotice(''); setSaving(true);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Unable to save the template');
      setNotice(typeof done === 'function' ? done(d) : done); await load();
      return true;
    } catch (e) { setError(e.message); return false; } finally { setSaving(false); }
  }

  async function submit(e) {
    e.preventDefault();
    const ok = editingId
      ? await send(`/api/org/${orgId}/templates/${editingId}`, 'PATCH', form, (d) => d.newVersion
        ? `Saved as version ${d.template.version}. Assets written from earlier versions keep theirs.`
        : 'Saved.')
      : await send(`/api/org/${orgId}/templates`, 'POST', form, 'Template created. Members can now use it from the repository.');
    if (ok) { setForm(EMPTY); setEditingId(null); }
  }

  const edit = (t) => {
    setEditingId(t.id);
    setForm({ name: t.name, sections: t.sections.map((s) => ({ ...s })), requiredFields: [...t.requiredFields] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setSection = (i, key, value) => setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }));
  const moveSection = (i, by) => setForm((f) => {
    const sections = [...f.sections];
    const j = i + by;
    if (j < 0 || j >= sections.length) return f;
    [sections[i], sections[j]] = [sections[j], sections[i]];
    return { ...f, sections };
  });
  const removeSection = (i) => setForm((f) => ({ ...f, sections: f.sections.filter((_, j) => j !== i) }));
  const toggleField = (key) => setForm((f) => ({
    ...f,
    requiredFields: f.requiredFields.includes(key) ? f.requiredFields.filter((k) => k !== key) : [...f.requiredFields, key],
  }));

  return <Layout><main className="mx-auto max-w-4xl space-y-6 p-6">
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold">Asset templates</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Templates give common knowledge assets a standard shape: the sections to fill, guidance for each, and the fields that must be set.
        Members write from them in the <Link className="underline" href={`/org/${orgId}/repository`}>Knowledge Repository</Link> (New from template).
        The asset starts as a draft and goes through your <Link className="underline" href={`/org/${orgId}/workflows`}>approval workflow</Link> before it&apos;s published.
        Changing a template saves a new version; assets already written keep the version they were written from.
      </p>
    </header>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {notice && <p role="status" className="text-green-700">{notice}</p>}

    <form onSubmit={submit} className="space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">{editingId ? 'Edit template' : 'New template'}</h2>
      <label className="block text-sm">Template name<input required maxLength={80} className={FIELD} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="How-To Guide" /></label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Sections</legend>
        {form.sections.map((s, i) => (
          <div key={i} className="space-y-2 rounded border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{i + 1}.</span>
              <input aria-label={`Section ${i + 1} title`} required maxLength={120} className="flex-1 rounded border bg-transparent p-2 text-sm" value={s.title} onChange={(e) => setSection(i, 'title', e.target.value)} placeholder="Section title, e.g. Steps" />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={s.required} onChange={(e) => setSection(i, 'required', e.target.checked)} /> Required</label>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveSection(i, -1)} className="rounded border p-1 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Move down" disabled={i === form.sections.length - 1} onClick={() => moveSection(i, 1)} className="rounded border p-1 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" aria-label="Remove section" disabled={form.sections.length === 1} onClick={() => removeSection(i)} className="rounded border p-1 text-red-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
            <textarea aria-label={`Section ${i + 1} guidance`} maxLength={1000} rows={2} className="w-full rounded border bg-transparent p-2 text-sm" value={s.guidance} onChange={(e) => setSection(i, 'guidance', e.target.value)} placeholder="Guidance shown to the writer, e.g. Numbered steps, one action each." />
          </div>
        ))}
        <button type="button" disabled={form.sections.length >= 20} onClick={() => setForm((f) => ({ ...f, sections: [...f.sections, blankSection()] }))} className="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm disabled:opacity-50"><Plus className="h-4 w-4" /> Add section</button>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Required fields</legend>
        <p className="text-xs text-gray-500">An asset can&apos;t be saved without these.</p>
        <div className="mt-1 flex gap-4">
          {TEMPLATE_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.requiredFields.includes(f.key)} onChange={() => toggleField(f.key)} /> {f.label}</label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}</button>
        {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }} className="rounded border px-4 py-2">Cancel</button>}
      </div>
    </form>

    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Templates</h2>
        <button type="button" disabled={saving} onClick={() => send(`/api/org/${orgId}/templates`, 'POST', { starters: true }, (d) => d.created?.length ? `Added: ${d.created.join(', ')}.` : 'You already have all the starter templates.')} className="rounded border px-3 py-1 text-sm">Add starter templates</button>
      </div>
      {loaded && items.length === 0 ? <p className="text-sm text-gray-500">No templates yet. Create one above, or add the starter templates (How-To Guide, FAQ, SOP, Key Takeaways) and adjust them.</p> : items.map((t) => (
        <article key={t.id} className={`flex flex-wrap items-center justify-between gap-3 rounded border p-3 ${t.status === 'active' ? '' : 'opacity-60'}`}>
          <div className="min-w-0">
            <p className="font-medium">{t.name} <span className="ml-1 text-xs text-gray-500">v{t.version}</span> {t.status !== 'active' && <span className="ml-1 rounded-full border px-2 text-xs">Retired</span>}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t.sections.map((s) => s.title + (s.required ? '*' : '')).join(' · ')}</p>
            <p className="text-xs text-gray-500">
              {t.assetCount} asset{t.assetCount === 1 ? '' : 's'} written from it
              {t.requiredFields.length ? ` · requires ${t.requiredFields.map((k) => TEMPLATE_FIELDS.find((f) => f.key === k)?.label || k).join(', ').toLowerCase()}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => edit(t)} className="rounded border px-3 py-1 text-sm">Edit</button>
            <button type="button" disabled={saving} onClick={() => send(`/api/org/${orgId}/templates/${t.id}`, 'PATCH', { status: t.status === 'active' ? 'retired' : 'active' }, t.status === 'active' ? 'Template retired: it is no longer offered. Its assets are unchanged.' : 'Template is offered again.')} className="rounded border px-3 py-1 text-sm">{t.status === 'active' ? 'Retire' : 'Restore'}</button>
          </div>
        </article>
      ))}
    </section>
  </main></Layout>;
}
