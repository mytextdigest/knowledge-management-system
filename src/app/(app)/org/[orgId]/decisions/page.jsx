"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Scale, Search, Check, X as XIcon } from "lucide-react";
import Layout from "@/components/layout/Layout";
import DecisionDetailModal from "@/components/decisions/DecisionDetailModal";
import { STATUS_ORDER, STATUS_LABELS, CERTAINTY_LABELS } from "@/lib/decisionStatus";

function DecisionCardsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="mt-2 h-3 w-full rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="mt-2 h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    active: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
    rejected: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    reversed: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    superseded: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.active}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function CertaintyBadge({ certainty, explicitness }) {
  if (!certainty) return null;
  const styles = {
    confirmed: "border-green-200 text-green-700 dark:border-green-800 dark:text-green-300",
    likely: "border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300",
    candidate: "border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400",
  };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${styles[certainty] || styles.candidate}`}>
      {CERTAINTY_LABELS[certainty] || certainty}
      {explicitness === "implicit" ? " · implicit" : ""}
    </span>
  );
}

export default function DecisionsPage() {
  const { orgId } = useParams();
  const [query, setQuery] = useState("");
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [orgRole, setOrgRole] = useState(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState(null);
  const [reviewQueueCount, setReviewQueueCount] = useState(0);
  const [canReview, setCanReview] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const isReviewQueue = status === "pending" || status === "rejected";

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function loadFilters() {
      try {
        const settingsRes = await fetch(`/api/org/${orgId}/settings`);
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        if (cancelled) return;
        const role = settings?.role || null;
        setOrgRole(role);

        const suffix = role === "super_admin" ? "" : "?mine=1";
        const [deptRes, projRes] = await Promise.all([
          fetch(`/api/org/${orgId}/department${suffix}`),
          fetch(`/api/org/${orgId}/projects`),
        ]);
        const deps = deptRes.ok ? await deptRes.json() : [];
        const projs = projRes.ok ? await projRes.json() : [];
        if (cancelled) return;
        setDepartments(Array.isArray(deps) ? deps : []);
        setProjects(Array.isArray(projs) ? projs : []);
      } catch {
        if (!cancelled) {
          setDepartments([]);
          setProjects([]);
        }
      }
    }

    loadFilters();
    return () => { cancelled = true; };
  }, [orgId]);

  async function load() {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (query.trim()) params.set("query", query.trim());
      if (departmentId) params.set("departmentId", departmentId);
      if (projectId) params.set("projectId", projectId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/org/${orgId}/decisions?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load decisions");
      setDecisions(Array.isArray(data.decisions) ? data.decisions : []);
      setReviewQueueCount(Number(data.reviewQueueCount) || 0);
      setCanReview(Boolean(data.canReview));
    } catch (e) {
      setDecisions([]);
      setError(e.message || "Unable to load decisions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId, departmentId, projectId, status]);

  // Decision Extraction v2, FR-6: the review queue groups by source document,
  // ordered confirmed → likely → candidate within each group (the API
  // already returns rows in that order; grouping here just adds headers and
  // per-document bulk actions on top).
  const groupedForReview = useMemo(() => {
    if (!isReviewQueue) return null;
    const groups = new Map();
    for (const d of decisions) {
      if (!groups.has(d.documentId)) groups.set(d.documentId, { filename: d.filename, items: [] });
      groups.get(d.documentId).items.push(d);
    }
    return [...groups.values()];
  }, [decisions, isReviewQueue]);

  async function bulkReview(ids, action) {
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      await fetch(`/api/org/${orgId}/decisions/bulk-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <Layout orgId={orgId}>
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2"><Scale className="h-6 w-6 text-primary-600" /><h1 className="text-2xl font-bold">Decisions</h1></div>
        <p className="mt-1 text-sm text-gray-500">Why past decisions were made, whether they held, and what was learned since.</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
            placeholder="Search decisions by statement or rationale..."
          />
        </div>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="">Any outcome</option>
          {canReview && <option value="pending">Pending review{reviewQueueCount ? ` (${reviewQueueCount})` : ""}</option>}
          {STATUS_ORDER.filter((s) => s !== "pending").map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">Find</button>
      </form>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? <DecisionCardsSkeleton /> : decisions.length === 0 ? (
        <p className="text-sm text-gray-500">
          {isReviewQueue ? "Nothing waiting for review." : "No decisions found for this filter."}
        </p>
      ) : isReviewQueue ? (
        <div className="space-y-5">
          {groupedForReview.map((group) => (
            <div key={group.filename + group.items[0]?.documentId} className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 dark:border-gray-700">
                <span className="min-w-0 truncate text-sm font-medium text-gray-700 dark:text-gray-200">{group.filename}</span>
                {status === "pending" && (
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => bulkReview(group.items.map((i) => i.id), "confirm")}
                    className="shrink-0 rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Confirm all in this document
                  </button>
                )}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {group.items.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-3 p-4">
                    <button
                      type="button"
                      onClick={() => setSelectedDecisionId(d.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <CertaintyBadge certainty={d.certainty} explicitness={d.explicitness} />
                      </div>
                      <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{d.statement}</p>
                      {d.rationale && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{d.rationale}</p>}
                    </button>
                    {status === "pending" && (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={bulkBusy}
                          onClick={() => bulkReview([d.id], "confirm")}
                          title="Confirm"
                          className="rounded-lg border border-green-200 p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:border-green-800 dark:hover:bg-green-950/30"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={bulkBusy}
                          onClick={() => bulkReview([d.id], "reject")}
                          title="Reject"
                          className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDecisionId(d.id)}
              className="block w-full rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-primary-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 font-semibold text-gray-900 dark:text-gray-100">{d.statement}</h2>
                <StatusBadge status={d.status} />
              </div>
              {d.rationale && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{d.rationale}</p>}
              <p className="mt-2 text-xs text-gray-400">
                {d.filename}
                {d.projectName ? ` · ${d.projectName}` : d.departmentName ? ` · ${d.departmentName}` : ""}
                {d.decidedAt ? ` · ${new Date(d.decidedAt).toLocaleDateString()}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedDecisionId && (
        <DecisionDetailModal
          orgId={orgId}
          decisionId={selectedDecisionId}
          onClose={() => setSelectedDecisionId(null)}
          onChanged={load}
        />
      )}
    </div>
    </Layout>
  );
}
