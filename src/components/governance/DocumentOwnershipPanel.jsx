"use client";

import { useEffect, useState } from "react";

export default function DocumentOwnershipPanel({ documentId, orgId }) {
  const [allowed, setAllowed] = useState(false);
  const [members, setMembers] = useState([]);
  const [ownerId, setOwnerId] = useState("");
  const [stewardIds, setStewardIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!documentId || !orgId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setAllowed(false);
      setError("");
      setSuccess("");
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/ownership`, { signal: controller.signal });
        if (response.status === 401 || response.status === 403 || response.status === 404) return;
        if (!response.ok) throw new Error("Ownership information is temporarily unavailable");
        const ownership = await response.json();
        const membersResponse = await fetch(`/api/org/${encodeURIComponent(orgId)}/members`, { signal: controller.signal });
        if (!membersResponse.ok) throw new Error("Unable to load organization members");
        const memberList = await membersResponse.json();
        if (!Array.isArray(memberList)) throw new Error("Invalid organization member response");
        if (controller.signal.aborted) return;
        setMembers(memberList);
        setOwnerId(ownership.ownerId || "");
        setStewardIds(ownership.stewardIds || []);
        setSnapshot({ ownerId: ownership.ownerId ?? null, stewardIds: [...(ownership.stewardIds || [])] });
        setAllowed(true);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message || "Unable to load ownership");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [documentId, orgId]);

  async function save() {
    if (!snapshot || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/ownership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: ownerId || null, stewardIds,
          expectedOwnerId: snapshot.ownerId, expectedStewardIds: snapshot.stewardIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error("Ownership changed elsewhere. Reload the page before retrying.");
        throw new Error(payload.error || "Unable to save ownership");
      }
      setOwnerId(payload.ownerId || "");
      setStewardIds(payload.stewardIds || []);
      setSnapshot({ ownerId: payload.ownerId ?? null, stewardIds: [...(payload.stewardIds || [])] });
      setSuccess("Ownership saved.");
    } catch (e) {
      setError(e.message || "Unable to save ownership");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return null;
  const names = new Map(members.map((m) => [m.userId, m.name || m.email || m.userId]));
  const missing = [...new Set([ownerId, ...stewardIds])].filter((id) => id && !names.has(id));
  return (
    <section aria-label="Document ownership" className="rounded-lg border border-gray-200 bg-white p-3 text-left dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Ownership & stewardship</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-gray-700 dark:text-gray-300">
          Accountable owner
          <select className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={saving}>
            <option value="">Unassigned</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email || m.userId}</option>)}
            {missing.map((id) => <option key={id} value={id}>{id} (no longer a member)</option>)}
          </select>
        </label>
        <fieldset className="text-xs text-gray-700 dark:text-gray-300">
          <legend>Stewards (up to 25)</legend>
          <div className="mt-1 max-h-32 space-y-1 overflow-auto rounded border border-gray-300 p-2 dark:border-gray-600">
            {members.map((m) => (
              <label key={m.userId} className="flex items-center gap-2">
                <input type="checkbox" checked={stewardIds.includes(m.userId)} disabled={saving || (!stewardIds.includes(m.userId) && stewardIds.length >= 25)} onChange={(e) => setStewardIds((current) => e.target.checked ? [...current, m.userId] : current.filter((id) => id !== m.userId))} />
                <span>{m.name || m.email || m.userId}</span>
              </label>
            ))}
            {missing.filter((id) => stewardIds.includes(id)).map((id) => <p key={id}>Former member: {id}</p>)}
            {members.length === 0 && <p>No members available</p>}
          </div>
        </fieldset>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={saving || loading || !snapshot} onClick={save} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save ownership"}</button>
        {success && <span role="status" className="text-xs text-green-700 dark:text-green-400">{success}</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
