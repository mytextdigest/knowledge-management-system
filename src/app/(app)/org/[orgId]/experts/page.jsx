"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, Mail, Users, CheckCircle2, XCircle } from "lucide-react";
import Layout from "@/components/layout/Layout";

export default function ExpertsPage() {
  const { orgId } = useParams();
  const [query, setQuery] = useState("");
  const [experts, setExperts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerUserId, setViewerUserId] = useState(null);
  const [canAdminConfirm, setCanAdminConfirm] = useState(false);

  async function load(q = "") {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/org/${orgId}/context/experts?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load experts");
      setExperts(Array.isArray(data.experts) ? data.experts : []);
      setViewerUserId(data.viewerUserId || null);
      setCanAdminConfirm(Boolean(data.canAdminConfirm));
    } catch (e) {
      setError(e.message || "Unable to load experts");
      setExperts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(""); }, [orgId]);

  async function updateExpertise(topicId, source, userId) {
    const res = await fetch(`/api/org/${orgId}/context/experts/${topicId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, userId }),
    });
    if (res.ok) await load(query);
  }

  return (
    <Layout orgId={orgId}>
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2"><Users className="h-6 w-6 text-primary-600" /><h1 className="text-2xl font-bold">Experts</h1></div>
        <p className="mt-1 text-sm text-gray-500">Search who knows about a topic across the knowledge you can access.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(query); }} className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" placeholder="Who knows about onboarding, security, Q1 budget..." /></div>
        <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Search</button>
      </form>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <p className="text-sm text-gray-500">Finding experts...</p> : experts.length === 0 ? <p className="text-sm text-gray-500">No accessible experts found.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {experts.map((expert) => (
            <div key={`${expert.id}-${expert.topicId}`} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold">{expert.name || expert.email}</h2><p className="text-sm text-gray-500">{expert.topic} · {expert.topicScope}</p></div>
                <span className="rounded-full bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">{Number(expert.score || 0).toFixed(2)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <a href={`mailto:${expert.email}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"><Mail className="h-3.5 w-3.5" />Email</a>
                {expert.id === viewerUserId && (<>
                  <button onClick={() => updateExpertise(expert.topicId, "self_confirmed", expert.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"><CheckCircle2 className="h-3.5 w-3.5" />Confirm</button>
                  <button onClick={() => updateExpertise(expert.topicId, "dismissed", expert.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"><XCircle className="h-3.5 w-3.5" />Dismiss</button>
                </>)}
                {canAdminConfirm && expert.id !== viewerUserId && (
                  <button onClick={() => updateExpertise(expert.topicId, "admin_confirmed", expert.id)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"><CheckCircle2 className="h-3.5 w-3.5" />Confirm SME</button>
                )}
                <span className="text-gray-400">{expert.documentCount} linked docs</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </Layout>
  );
}
