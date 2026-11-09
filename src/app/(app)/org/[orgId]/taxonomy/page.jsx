"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import Layout from "@/components/layout/Layout";

const card = "rounded-xl border border-gray-200 dark:border-gray-700";
const control = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
const primaryBtn = "inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50";
const secondaryBtn = "rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800";
const badge = "rounded-full px-2 py-0.5 text-xs font-medium";

const splitSynonyms = (text) => text.split(",").map((s) => s.trim()).filter(Boolean);

// Children by parent id, each list in display order.
function buildTree(terms) {
  const byParent = new Map();
  for (const term of terms) {
    const key = term.parentId || "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(term);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }
  return byParent;
}

// Ids of terms matching `query` (label or synonym) plus all their ancestors.
function visibleIds(terms, query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const byId = new Map(terms.map((t) => [t.id, t]));
  const ids = new Set();
  for (const term of terms) {
    const hit = term.label.toLowerCase().includes(q) || term.synonyms?.some((s) => s.label.toLowerCase().includes(q));
    if (!hit) continue;
    for (let node = term; node; node = node.parentId ? byId.get(node.parentId) : null) ids.add(node.id);
  }
  return ids;
}

function TermEditor({ term, onSave, onCancel, busy }) {
  const [label, setLabel] = useState(term.label);
  const [synonyms, setSynonyms] = useState((term.synonyms || []).map((s) => s.label).join(", "));
  const [description, setDescription] = useState(term.description || "");
  return (
    <form
      className="mt-2 grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-2 dark:bg-gray-800/60"
      onSubmit={(e) => { e.preventDefault(); onSave({ label, synonyms: splitSynonyms(synonyms), description }); }}
    >
      <label className="text-xs text-gray-600 dark:text-gray-300">Name
        <input className={`${control} mt-1 w-full`} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={120} />
      </label>
      <label className="text-xs text-gray-600 dark:text-gray-300">Synonyms (comma separated)
        <input className={`${control} mt-1 w-full`} value={synonyms} onChange={(e) => setSynonyms(e.target.value)} placeholder="e.g. xfmr, power transformer" />
      </label>
      <label className="text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Description
        <input className={`${control} mt-1 w-full`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy} className={primaryBtn}>Save</button>
        <button type="button" onClick={onCancel} className={secondaryBtn}>Cancel</button>
      </div>
    </form>
  );
}

function AddTermForm({ placeholder, onAdd, busy, onCancel }) {
  const [label, setLabel] = useState("");
  const [synonyms, setSynonyms] = useState("");
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => { e.preventDefault(); if (await onAdd({ label, synonyms: splitSynonyms(synonyms) })) { setLabel(""); setSynonyms(""); } }}
    >
      <input aria-label="New term name" className={control} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} required maxLength={120} />
      <input aria-label="Synonyms" className={control} value={synonyms} onChange={(e) => setSynonyms(e.target.value)} placeholder="Synonyms (optional, comma separated)" />
      <button type="submit" disabled={busy} className={primaryBtn}><Plus className="h-4 w-4" /> Add term</button>
      {onCancel ? <button type="button" onClick={onCancel} className={secondaryBtn}>Cancel</button> : null}
    </form>
  );
}

function TermNode({ term, tree, byId, editable, busy, filterIds, showDeprecated, actions, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState(null); // "edit" | "child" | "merge"
  const [mergeTarget, setMergeTarget] = useState("");
  const children = (tree.get(term.id) || []).filter((c) => (showDeprecated || c.status === "active") && (!filterIds || filterIds.has(c.id)));
  const expanded = open || !!filterIds;
  const deprecated = term.status !== "active";
  const mergeOptions = [...byId.values()].filter((t) => t.id !== term.id && t.status === "active" && !t.ancestorIds?.includes(term.id));

  return (
    <li>
      <div className="group flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60" style={{ paddingLeft: `${8 + depth * 20}px` }}>
        {children.length ? (
          <button type="button" aria-label={expanded ? "Collapse" : "Expand"} onClick={() => setOpen((v) => !v)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : <span className="inline-block w-4" />}
        <span className={`text-sm font-medium ${deprecated ? "text-gray-400 line-through" : "text-gray-900 dark:text-gray-100"}`}>{term.label}</span>
        {term.synonyms?.map((s) => (
          <span key={s.id} className={`${badge} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300`}>{s.label}</span>
        ))}
        {term._count?.documentTerms ? <span className="text-xs text-gray-500">{term._count.documentTerms} tagged</span> : null}
        {term.mergedIntoId ? (
          <span className={`${badge} bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`}>merged into {byId.get(term.mergedIntoId)?.label || "another term"}</span>
        ) : deprecated ? (
          <span className={`${badge} bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`}>deprecated</span>
        ) : null}
        {editable && !term.mergedIntoId ? (
          <span className="ml-auto flex flex-wrap gap-1.5">
            {!deprecated ? <>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setMode(mode === "edit" ? null : "edit")}>Edit</button>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setMode(mode === "child" ? null : "child")}>Add child</button>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setMode(mode === "merge" ? null : "merge")}>Merge</button>
            </> : null}
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => actions.update(term.id, { status: deprecated ? "active" : "deprecated" })}>
              {deprecated ? "Reactivate" : "Deprecate"}
            </button>
          </span>
        ) : null}
      </div>
      {mode === "edit" ? (
        <div style={{ paddingLeft: `${28 + depth * 20}px` }}>
          <TermEditor term={term} busy={busy} onCancel={() => setMode(null)} onSave={async (patch) => { if (await actions.update(term.id, patch)) setMode(null); }} />
        </div>
      ) : null}
      {mode === "child" ? (
        <div style={{ paddingLeft: `${28 + depth * 20}px` }}>
          <AddTermForm placeholder={`New term under ${term.label}`} busy={busy} onCancel={() => setMode(null)} onAdd={async (t) => { const ok = await actions.create({ ...t, parentId: term.id }); if (ok) setMode(null); return ok; }} />
        </div>
      ) : null}
      {mode === "merge" ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          style={{ paddingLeft: `${28 + depth * 20}px` }}
          onSubmit={async (e) => { e.preventDefault(); if (await actions.merge(term, byId.get(mergeTarget))) setMode(null); }}
        >
          <span className="text-sm text-gray-600 dark:text-gray-300">Merge “{term.label}” into</span>
          <select aria-label="Merge target" className={control} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} required>
            <option value="">Choose a term</option>
            {mergeOptions.map((t) => <option key={t.id} value={t.id}>{" ".repeat(t.depth * 2)}{t.label}</option>)}
          </select>
          <button type="submit" disabled={busy || !mergeTarget} className={primaryBtn}>Merge</button>
          <button type="button" onClick={() => setMode(null)} className={secondaryBtn}>Cancel</button>
        </form>
      ) : null}
      {expanded && children.length ? (
        <ul>
          {children.map((child) => (
            <TermNode key={child.id} term={child} tree={tree} byId={byId} editable={editable} busy={busy} filterIds={filterIds} showDeprecated={showDeprecated} actions={actions} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function TermSetCard({ set, canEdit, busy, actions }) {
  const [query, setQuery] = useState("");
  const [showDeprecated, setShowDeprecated] = useState(false);
  const tree = useMemo(() => buildTree(set.terms), [set.terms]);
  const byId = useMemo(() => new Map(set.terms.map((t) => [t.id, t])), [set.terms]);
  const filterIds = useMemo(() => visibleIds(set.terms, query), [set.terms, query]);
  const editable = canEdit && !set.readOnly;
  const roots = (tree.get("root") || []).filter((t) => (showDeprecated || t.status === "active") && (!filterIds || filterIds.has(t.id)));
  const activeCount = set.terms.filter((t) => t.status === "active").length;
  const setActions = {
    create: (t) => actions.createTerm({ ...t, termSetId: set.id }),
    update: actions.updateTerm,
    merge: actions.mergeTerm,
  };

  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {set.name}
            {set.readOnly ? <span className={`${badge} ml-2 bg-gray-100 align-middle text-gray-600 dark:bg-gray-800 dark:text-gray-300`}>Managed outside KMS</span> : null}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{activeCount} active term{activeCount === 1 ? "" : "s"}{set.description ? ` · ${set.description}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input aria-label={`Search ${set.name}`} className={`${control} pl-8`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search terms and synonyms" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={showDeprecated} onChange={(e) => setShowDeprecated(e.target.checked)} /> Show deprecated
          </label>
        </div>
      </div>
      <ul className="mt-3">
        {roots.map((term) => (
          <TermNode key={term.id} term={term} tree={tree} byId={byId} editable={editable} busy={busy} filterIds={filterIds} showDeprecated={showDeprecated} actions={setActions} />
        ))}
      </ul>
      {!roots.length ? <p className="mt-3 text-sm text-gray-500">{query ? "No terms match." : "No terms yet."}</p> : null}
      {editable ? <AddTermForm placeholder="New top-level term" busy={busy} onAdd={setActions.create} /> : null}
    </section>
  );
}

function MetadataFields({ fields, sets, canEdit, busy, onCreate, onRename }) {
  const [form, setForm] = useState({ name: "", key: "", termSetId: "", multi: false, required: false, facet: false });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <section className={`${card} space-y-4 p-5`}>
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Metadata fields</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">A field lets documents be tagged from one term set. Keys can't be changed after creation.</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {fields.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{f.name} <span className="font-mono text-xs text-gray-500">{f.key}</span></p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {f.termSet?.name} · {f.multi ? "Multiple terms" : "One term"} · {f.required ? "Required" : "Optional"} · {f.facet ? "Search facet" : "Not a facet"} · {f._count?.documentTerms || 0} tags
              </p>
            </div>
            {canEdit && !f.termSet?.readOnly ? <button type="button" className={secondaryBtn} disabled={busy} onClick={() => onRename(f)}>Rename</button> : null}
          </div>
        ))}
        {!fields.length ? <p className="py-3 text-sm text-gray-500">No metadata fields yet.</p> : null}
      </div>
      {canEdit ? (
        <form
          className="grid gap-3 border-t border-gray-200 pt-4 sm:grid-cols-3 dark:border-gray-700"
          onSubmit={async (e) => { e.preventDefault(); if (await onCreate(form)) setForm({ name: "", key: "", termSetId: "", multi: false, required: false, facet: false }); }}
        >
          <input className={control} aria-label="Field name" placeholder="Field name, e.g. Asset Type" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <input className={`${control} font-mono`} aria-label="Field key" placeholder="field_key" required pattern="[a-z][a-z0-9_]{1,63}" title="Lower-case letters, digits and _; starts with a letter" value={form.key} onChange={(e) => set({ key: e.target.value })} />
          <select className={control} aria-label="Term set" required value={form.termSetId} onChange={(e) => set({ termSetId: e.target.value })}>
            <option value="">Term set</option>
            {sets.filter((s) => !s.readOnly).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 sm:col-span-2 dark:text-gray-300">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.multi} onChange={(e) => set({ multi: e.target.checked })} /> Multiple terms</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.required} onChange={(e) => set({ required: e.target.checked })} /> Required</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.facet} onChange={(e) => set({ facet: e.target.checked })} /> Search facet</label>
          </div>
          <div className="sm:text-right"><button type="submit" disabled={busy} className={primaryBtn}>Create field</button></div>
        </form>
      ) : null}
    </section>
  );
}

export default function TaxonomyPage() {
  const { orgId } = useParams();
  const base = `/api/org/${encodeURIComponent(orgId)}/taxonomy`;
  const [sets, setSets] = useState([]);
  const [fields, setFields] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newSet, setNewSet] = useState("");

  const refresh = useCallback(async () => {
    const [setsRes, fieldsRes] = await Promise.all([fetch(base, { cache: "no-store" }), fetch(`${base}/fields`, { cache: "no-store" })]);
    const [setsBody, fieldsBody] = await Promise.all([setsRes.json(), fieldsRes.json()]);
    if (!setsRes.ok) throw new Error(setsBody.error || "Unable to load taxonomy");
    if (!fieldsRes.ok) throw new Error(fieldsBody.error || "Unable to load metadata fields");
    setSets(setsBody.sets || []);
    setCanEdit(!!setsBody.canEdit);
    setFields(fieldsBody.fields || []);
  }, [base]);

  useEffect(() => {
    if (!orgId) return;
    refresh().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [orgId, refresh]);

  // Run one write, then reload. Returns true on success.
  const run = useCallback(async (url, method, body, success) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Save failed");
      await refresh();
      if (success) setNotice(typeof success === "function" ? success(json) : success);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const actions = {
    createTerm: (t) => run(`${base}/terms`, "POST", t),
    updateTerm: (id, patch) => run(`${base}/terms`, "PATCH", { id, ...patch }),
    mergeTerm: (source, target) => {
      if (!target) return false;
      const tagged = source._count?.documentTerms || 0;
      const ok = window.confirm(`Merge "${source.label}" into "${target.label}"?\n\n${tagged} tagged document(s) will be re-tagged, child terms move under "${target.label}", and "${source.label}" becomes a synonym. This can't be undone.`);
      if (!ok) return false;
      return run(`${base}/terms/merge`, "POST", { sourceId: source.id, targetId: target.id },
        (r) => `Merged "${source.label}" into "${target.label}": ${r.retagged + r.duplicatesRemoved} document tag(s) moved.`);
    },
  };

  return (
    <Layout>
      <main className="mx-auto max-w-5xl space-y-6 p-6 text-gray-900 dark:text-gray-100">
        <header>
          <h1 className="text-2xl font-semibold">Taxonomy</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Term sets and the metadata fields documents are tagged with. {canEdit ? "Every change is recorded in the audit log." : "Only organization admins can change the taxonomy."}
          </p>
        </header>

        {error ? <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:border-red-800 dark:text-red-300">{error}</p> : null}
        {notice ? <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200">{notice}</p> : null}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading taxonomy…</p>
        ) : (
          <>
            {canEdit ? (
              <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run(base, "POST", { name: newSet }, `Term set "${newSet}" created.`)) setNewSet(""); }}>
                <input aria-label="Term set name" className={control} value={newSet} onChange={(e) => setNewSet(e.target.value)} placeholder="New term set, e.g. Asset Type" required maxLength={120} />
                <button type="submit" disabled={busy} className={primaryBtn}><Plus className="h-4 w-4" /> Create term set</button>
              </form>
            ) : null}
            {sets.map((s) => <TermSetCard key={s.id} set={s} canEdit={canEdit} busy={busy} actions={actions} />)}
            {!sets.length ? <p className={`${card} p-6 text-center text-sm text-gray-500`}>No term sets yet.</p> : null}
            <MetadataFields
              fields={fields}
              sets={sets}
              canEdit={canEdit}
              busy={busy}
              onCreate={(f) => run(`${base}/fields`, "POST", f, `Field "${f.name}" created.`)}
              onRename={(f) => {
                const name = window.prompt("Field name", f.name);
                if (name === null || name.trim() === f.name) return;
                run(`${base}/fields`, "PATCH", { id: f.id, name }, "Field renamed.");
              }}
            />
          </>
        )}
      </main>
    </Layout>
  );
}
