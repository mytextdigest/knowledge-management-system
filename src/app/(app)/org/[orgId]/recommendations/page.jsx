"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, Sparkles, Search, TrendingUp } from "lucide-react";

export default function RecommendationsPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("personal");
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [orgRole, setOrgRole] = useState(null);
  const [effectiveness, setEffectiveness] = useState(null);

  const canUseDepartmentMode = orgRole === "super_admin" || orgRole === "dept_admin";

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function loadAccessContext() {
      try {
        const settingsRes = await fetch(`/api/org/${orgId}/settings`);
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        if (cancelled) return;
        const role = settings?.role || null;
        setOrgRole(role);

        if (role !== "super_admin" && role !== "dept_admin") {
          setDepartments([]);
          setDepartmentId("");
          return;
        }

        // A dept_admin should only be offered departments they actually belong
        // to; the API still performs the stronger canManageDepartment check.
        const suffix = role === "dept_admin" ? "?mine=1" : "";
        const departmentsRes = await fetch(`/api/org/${orgId}/department${suffix}`);
        const deps = departmentsRes.ok ? await departmentsRes.json() : [];
        if (cancelled) return;
        const safeDeps = Array.isArray(deps) ? deps : [];
        setDepartments(safeDeps);
        setDepartmentId((current) => safeDeps.some((d) => d.id === current) ? current : (safeDeps[0]?.id || ""));
      } catch {
        if (!cancelled) {
          setDepartments([]);
          setDepartmentId("");
        }
      }
    }

    loadAccessContext();
    return () => { cancelled = true; };
  }, [orgId]);

  async function load(nextQuery = query, nextMode = mode) {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (nextMode === "department") {
        if (!departmentId) { setItems([]); return; }
        params.set("mode", "department");
        params.set("departmentId", departmentId);
      } else {
        if (nextQuery.trim()) params.set("query", nextQuery.trim());
      }
      const res = await fetch(`/api/org/${orgId}/recommendations?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load recommendations");
      setItems(Array.isArray(data.recommendations) ? data.recommendations : []);
    } catch (e) {
      setItems([]);
      setError(e.message || "Unable to load recommendations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load("", mode); }, [orgId, mode, departmentId]);

  useEffect(() => {
    if (!orgId || !departmentId || !canUseDepartmentMode) return;
    fetch(`/api/org/${orgId}/recommendations/effectiveness?departmentId=${departmentId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setEffectiveness(data))
      .catch(() => {});
  }, [orgId, departmentId, canUseDepartmentMode]);

  const impressionCount = useMemo(() => (effectiveness?.items || []).reduce((sum, item) => sum + Number(item.impressions || 0), 0), [effectiveness]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Sparkles className="h-6 w-6 text-primary-600" /><h1 className="text-2xl font-bold">Knowledge Recommendations</h1></div><p className="mt-1 text-sm text-gray-500">Proactive knowledge based on your work, feedback, views, and document relationships.</p></div>
        {canUseDepartmentMode && (
          <div className="flex rounded-lg border border-gray-200 p-1 text-sm dark:border-gray-700">
            <button onClick={() => setMode("personal")} className={`rounded-md px-3 py-1.5 ${mode === "personal" ? "bg-primary-600 text-white" : "text-gray-500"}`}>Personal</button>
            <button onClick={() => setMode("department")} className={`rounded-md px-3 py-1.5 ${mode === "department" ? "bg-primary-600 text-white" : "text-gray-500"}`}>Department</button>
          </div>
        )}
      </div>

      {mode === "personal" ? (
        <form onSubmit={(e) => { e.preventDefault(); load(query, "personal"); }} className="flex gap-2">
          <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900" placeholder="Optional: find recommendations about a topic" /></div>
          <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Find</button>
        </form>
      ) : (
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      )}

      {canUseDepartmentMode && effectiveness && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-4"><p className="text-xs text-gray-500">Recommendation impressions · 30d</p><p className="mt-1 text-2xl font-semibold">{impressionCount}</p></div>
          <div className="rounded-xl border p-4"><p className="text-xs text-gray-500">Documents recommended</p><p className="mt-1 text-2xl font-semibold">{effectiveness.items?.length || 0}</p></div>
          <div className="rounded-xl border p-4"><p className="text-xs text-gray-500">Zero-click documents</p><p className="mt-1 text-2xl font-semibold">{effectiveness.zeroClickThroughCount || 0}</p></div>
        </div>
      )}

      {canUseDepartmentMode && effectiveness?.items?.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="font-semibold">Most recommended documents · 30d</h2>
          <div className="mt-3 space-y-2">
            {effectiveness.items.slice(0, 5).map((item) => (
              <div key={item.documentId} className="flex items-center justify-between gap-3 text-sm">
                <button onClick={() => router.push(`/document?id=${item.documentId}`)} className="min-w-0 truncate text-left font-medium text-primary-700 hover:underline dark:text-primary-300">
                  {item.filename}
                </button>
                <span className="shrink-0 text-xs text-gray-500">{item.impressions} shown · {item.engagements} engaged</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <p className="text-sm text-gray-500">Finding relevant knowledge...</p> : items.length === 0 ? <p className="text-sm text-gray-500">No recommendations surfaced yet.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <button key={item.documentId} onClick={() => router.push(`/document?id=${item.documentId}`)} className="rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-primary-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-primary-500" /><div className="min-w-0"><h2 className="truncate font-semibold">{item.filename}</h2><p className="mt-1 text-sm text-gray-500">{item.reason}</p>{item.relationshipDerived && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-700"><TrendingUp className="h-3 w-3" />Relationship graph</span>}</div></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
