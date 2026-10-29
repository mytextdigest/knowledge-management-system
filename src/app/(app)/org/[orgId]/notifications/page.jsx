"use client";
import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";

export default function NotificationsPage({ params }) {
  const { orgId } = use(params);
  const base = `/api/org/${encodeURIComponent(orgId)}/notifications`;
  const [items, setItems] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (signal) => {
    try {
      const [messages, prefs] = await Promise.all([
        fetch(`${base}?limit=100`, { cache: "no-store", signal }),
        fetch(`${base}/preferences`, { cache: "no-store", signal }),
      ]);
      if (!messages.ok || !prefs.ok) throw new Error("Unable to load notification settings");
      const [messagesJson, prefsJson] = await Promise.all([messages.json(), prefs.json()]);
      if (!signal?.aborted) { setItems(messagesJson.items || []); setPreferences(prefsJson); setError(""); }
    } catch (err) { if (!signal?.aborted) setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [base]);
  useEffect(() => { const c = new AbortController(); void refresh(c.signal); return () => c.abort(); }, [refresh]);
  async function markRead(id) {
    try {
      const res = await fetch(`${base}/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      if (!res.ok) throw new Error("Could not mark notification as read");
      await refresh();
    } catch (err) { setError(err.message); }
  }
  async function updatePreference(pref, field, checked) {
    try {
      const next = { ...pref, [field]: checked };
      const res = await fetch(`${base}/preferences`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!res.ok) throw new Error("Could not save preference");
      setPreferences(prev => prev.map(p => p.type === pref.type ? next : p));
      setError("");
    } catch (err) { setError(err.message); }
  }
  return <main className="mx-auto max-w-4xl space-y-8 p-6">
    <h1 className="text-2xl font-semibold">Notifications</h1>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p>Loading…</p> : <section className="space-y-3" aria-label="Recent notifications">
      <h2 className="text-lg font-medium">Recent notifications</h2>
      {!items.length && <p>No notifications yet.</p>}
      {items.map(item => <article key={item.id} className="rounded border p-3">
        <p className={item.readAt ? "" : "font-semibold"}>{item.title}</p>
        {item.body && <p className="text-sm">{item.body}</p>}
        <div className="mt-2 flex gap-4 text-sm">
          {item.link?.startsWith("/") && !item.link.startsWith("//") && <Link href={item.link} className="underline">Open</Link>}
          {!item.readAt && <button type="button" className="underline" onClick={() => markRead(item.id)}>Mark read</button>}
        </div>
      </article>)}
    </section>}
    <section className="space-y-3" aria-label="Notification preferences">
      <h2 className="text-lg font-medium">Preferences</h2>
      <p className="text-sm text-gray-500">Email delivery also requires the administrator to enable SMTP notifications.</p>
      {preferences.map(pref => <div key={pref.type} className="flex flex-wrap items-center gap-5 rounded border p-3">
        <span className="min-w-48 flex-1">{pref.type.replaceAll(".", " · ").replaceAll("_", " ")}</span>
        {(["inApp", "email"]).map(field => <label key={field} className="flex items-center gap-2">
          <input type="checkbox" checked={pref[field]} onChange={e => updatePreference(pref, field, e.target.checked)} />
          {field === "inApp" ? "In-app" : "Email"}
        </label>)}
      </div>)}
    </section>
  </main>;
}
