"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";

export default function NotificationCenter({ orgId }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async (signal) => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/org/${encodeURIComponent(orgId)}/notifications?limit=30`, { signal, cache: "no-store" });
      if (!res.ok) throw new Error("Notifications unavailable");
      const data = await res.json();
      if (signal?.aborted) return;
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(Number(data.unreadCount) || 0);
      setError("");
    } catch (err) {
      if (!signal?.aborted) setError(err.message || "Unable to load notifications");
    }
  }, [orgId]);

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setUnreadCount(0);
    setError("");
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function markRead(id) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/org/${encodeURIComponent(orgId)}/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" });
      if (!res.ok) throw new Error("Unable to mark notification as read");
      await refresh();
    } catch (err) { setError(err.message || "Unable to update notification"); }
    finally { setBusyId(null); }
  }

  if (!orgId) return null;
  return (
    <section className="relative px-3 pb-2" aria-label="Notifications">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(v => !v); void refresh(); }}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800">
        <Bell className="h-4 w-4" /> Notifications
        {unreadCount > 0 && <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 p-2 text-sm text-gray-100">
        {error && <p role="alert" className="mb-2 text-red-300">{error}</p>}
        <a className="mb-2 block px-2 text-xs text-blue-300 underline" href={`/org/${encodeURIComponent(orgId)}/notifications`}>View all & preferences</a>
        {!items.length && !error && <p className="p-2 text-gray-300">No notifications</p>}
        {items.map(item => (
          <div key={item.id} className="border-b border-gray-700 p-2 last:border-b-0">
            <p className={item.readAt ? "text-gray-300" : "font-semibold"}>{item.title}</p>
            {item.body && <p className="mt-1 text-xs text-gray-300">{item.body}</p>}
            <div className="mt-2 flex gap-3 text-xs">
              {typeof item.link === "string" && item.link.startsWith("/") && !item.link.startsWith("//") &&
                <a className="text-blue-300 underline" href={item.link}>Open</a>}
              {!item.readAt && <button type="button" disabled={busyId === item.id} onClick={() => markRead(item.id)} className="text-blue-300 underline disabled:opacity-50">Mark read</button>}
            </div>
          </div>
        ))}
      </div>}
    </section>
  );
}
