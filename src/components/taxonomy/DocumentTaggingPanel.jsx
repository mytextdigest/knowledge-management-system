"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

const control = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";
const SOURCE_LABELS = { auto: "classifier", import: "back-fill", source_system: "SharePoint" };

// Manual taxonomy tags for one document (C-5). People who can manage the
// document edit them; everyone else who can see it reads them.
export default function DocumentTaggingPanel({ orgId, documentId }) {
  const endpoint = useMemo(
    () => `/api/org/${encodeURIComponent(orgId)}/documents/${encodeURIComponent(documentId)}/taxonomy`,
    [orgId, documentId],
  );
  const [fields, setFields] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(endpoint, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Unable to load tags");
    const list = body.fields || [];
    setFields(list);
    setCanEdit(!!body.canEdit);
    setSelected(Object.fromEntries(list.map((f) => [f.id, f.documentTerms.map((t) => t.termId)])));
  }, [endpoint]);

  useEffect(() => {
    load().catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [load]);

  async function save(field) {
    setBusy(field.id); setError(""); setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId: field.id, termIds: selected[field.id] || [] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      await load();
      setMessage(`${field.name} saved.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tags…</p>;
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      {error ? <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {message ? <p role="status" className="text-xs text-green-700 dark:text-green-400">{message}</p> : null}
      {!fields.length ? <p className="text-xs text-gray-500">No metadata fields yet. An admin can add them under Taxonomy.</p> : null}
      {fields.map((field) => {
        const terms = (field.termSet?.terms || []).filter((t) => t.status === "active" || (selected[field.id] || []).includes(t.id));
        const chosen = selected[field.id] || [];
        const other = field.documentTerms.filter((t) => t.source !== "manual");
        const editable = canEdit && !field.termSet?.readOnly;
        return (
          <div key={field.id} className="space-y-1.5">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
              {field.name}{field.required ? <span className="text-red-600"> *</span> : null}
              <span className="ml-1 font-normal text-gray-500">· {field.termSet?.name}</span>
            </p>
            {editable ? (
              <div className="flex items-start gap-2">
                {field.multi ? (
                  <div className="max-h-36 flex-1 space-y-1 overflow-auto rounded-md border border-gray-200 p-2 dark:border-gray-700">
                    {terms.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200" style={{ paddingLeft: `${(t.depth || 0) * 12}px` }}>
                        <input type="checkbox" checked={chosen.includes(t.id)} onChange={(e) => setSelected((prev) => ({ ...prev, [field.id]: e.target.checked ? [...chosen, t.id] : chosen.filter((id) => id !== t.id) }))} />
                        {t.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <select aria-label={field.name} className={control} value={chosen[0] || ""} onChange={(e) => setSelected((prev) => ({ ...prev, [field.id]: e.target.value ? [e.target.value] : [] }))}>
                    <option value="">None</option>
                    {terms.map((t) => <option key={t.id} value={t.id}>{" ".repeat((t.depth || 0) * 2)}{t.label}{t.status !== "active" ? " (deprecated)" : ""}</option>)}
                  </select>
                )}
                <button type="button" disabled={!!busy} onClick={() => save(field)} className="shrink-0 rounded-md bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50">
                  {busy === field.id ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-700 dark:text-gray-300">{field.documentTerms.map((t) => t.term?.label).filter(Boolean).join(", ") || "—"}</p>
            )}
            {editable && other.length ? (
              <p className="text-xs text-gray-500">
                {other.map((t) => `${t.term?.label} (from ${SOURCE_LABELS[t.source] || t.source})`).join(", ")}
                {!field.multi && other.some((t) => t.source !== "source_system") ? " · saving a choice replaces the classifier's tag" : ""}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
