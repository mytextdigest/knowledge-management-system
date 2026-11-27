"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// E23 on the document page: "Mark as replaced" (supersede, B-7) for
// department admins, and a recoverable Delete (B-9) for whoever may manage
// the document. Deleted documents are restored from Recently deleted.
export default function DocumentLifecycleActions({ doc, onChanged }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSupersede = doc.permissions?.canSupersede && doc.lifecycle === "published" && !doc.supersededById;
  const canDelete = doc.permissions?.canDelete;

  useEffect(() => {
    if (!picking) return;
    const t = setTimeout(() => {
      fetch(`/api/documents/${encodeURIComponent(doc.id)}/supersede?q=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then((r) => r.json().then((b) => (r.ok ? setCandidates(b.items || []) : setError(b.error || "Could not load documents"))))
        .catch(() => setError("Could not load documents"));
    }, 250);
    return () => clearTimeout(t);
  }, [picking, query, doc.id]);

  if (doc.scope !== "repository" || (!canSupersede && !canDelete)) return null;

  async function supersede(successor) {
    if (!window.confirm(`Mark "${doc.filename}" as replaced by "${successor.filename}"? Readers will be sent to the replacement and this document stops appearing in answers.`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/supersede`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ successorDocumentId: successor.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not mark the document as replaced");
      setPicking(false);
      onChanged?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Delete "${doc.filename}"? It disappears from search, chat and the repository, and can be restored from Recently deleted until it's purged.`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not delete the document");
      router.push(`/org/${encodeURIComponent(doc.orgId)}/deleted`);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap justify-center gap-2">
      {canSupersede && <button type="button" disabled={busy} onClick={() => { setPicking((p) => !p); setError(""); }} className="rounded border px-3 py-1 text-sm disabled:opacity-50">Mark as replaced…</button>}
      {canDelete && <button type="button" disabled={busy} onClick={remove} className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 disabled:opacity-50 dark:text-red-300">Delete</button>}
    </div>
    {error && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}
    {picking && <div className="space-y-2 rounded-lg border p-3">
      <label className="block text-sm">Replacement document (published, same department)
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" className="mt-1 w-full rounded border bg-transparent p-2" />
      </label>
      <ul className="max-h-56 divide-y overflow-y-auto rounded border">
        {candidates.map((c) => <li key={c.id}><button type="button" disabled={busy} onClick={() => supersede(c)} className="w-full p-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-800">{c.filename}</button></li>)}
        {!candidates.length && <li className="p-2 text-sm text-gray-500">No published documents in this department match.</li>}
      </ul>
    </div>}
  </div>;
}
