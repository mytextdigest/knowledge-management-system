"use client";
import { useEffect, useState } from "react";
export default function DocumentVersionsPanel({ documentId }) {
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!documentId) return;
    let active = true;
    fetch(`/api/documents/${encodeURIComponent(documentId)}/versions`)
      .then(async (r) => { if (!r.ok) throw new Error("Version history unavailable"); return r.json(); })
      .then((data) => { if (active) setVersions(data.versions || []); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [documentId]);
  async function restore(version) {
    if (!window.confirm(`Restore version ${version.versionNumber}? Current content will be saved as a new version.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(version.id)}/restore`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Restore failed");
      window.location.reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="space-y-3 p-4" aria-label="Document versions">
    <h3 className="font-semibold">Previous versions</h3>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {!versions.length && !error && <p>No previous versions available.</p>}
    {versions.map((v) => <div key={v.id} className="border rounded p-3 space-y-2">
      <div>Version {v.versionNumber}: {v.filename || "Untitled"} — {new Date(v.createdAt).toLocaleString()}</div>
      <details><summary>View saved text and summary</summary><pre className="whitespace-pre-wrap text-sm">{v.content || v.summary || "No saved text"}</pre></details>
      <button type="button" disabled={busy} onClick={() => restore(v)} className="border rounded px-3 py-1">Restore this version</button>
    </div>)}
  </section>;
}
