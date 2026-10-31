"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Network, RefreshCw, Search, Sparkles } from "lucide-react";
import Layout from "@/components/layout/Layout";
import ProgressiveKnowledgeGraph from "@/components/knowledge-graph/ProgressiveKnowledgeGraph";

export default function KnowledgeGraphPage() {
  const { orgId } = useParams();
  const router = useRouter();
  const [scope, setScope] = useState("org");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState("");
  const [data, setData] = useState({ nodes: [], edges: [], sourceVersion: null });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [includeSuggested, setIncludeSuggested] = useState(false);
  const [relationshipType, setRelationshipType] = useState("");
  const [knowledgeChanged, setKnowledgeChanged] = useState(false);

  useEffect(() => {
    fetch(`/api/org/${orgId}/department?mine=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setDepartments(Array.isArray(rows) ? rows : []))
      .catch(() => setDepartments([]));
  }, [orgId]);

  const visibleNodes = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data.nodes;
    const matches = new Set(data.nodes.filter((n) => n.label?.toLowerCase().includes(term)).map((n) => n.id));
    if (!matches.size) return data.nodes;
    data.edges.forEach((edge) => {
      if (matches.has(edge.source)) matches.add(edge.target);
      if (matches.has(edge.target)) matches.add(edge.source);
    });
    return data.nodes.filter((n) => matches.has(n.id));
  }, [data, q]);

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => data.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [data.edges, visibleIds]
  );

  async function generateGraph({ start = null } = {}) {
    if (scope === "department" && !departmentId) {
      setError("Choose a department before generating the graph.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const sp = new URLSearchParams();
      if (start) {
        sp.set("start", start);
        sp.set("depth", "2");
      } else {
        sp.set("overview", "1");
      }
      if (scope === "department") sp.set("departmentId", departmentId);
      if (includeSuggested) sp.set("includeSuggested", "1");
      if (relationshipType) sp.set("relationshipType", relationshipType);
      const response = await fetch(`/api/org/${orgId}/knowledge-graph?${sp}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to generate knowledge graph");
      setData({ nodes: json.nodes || [], edges: json.edges || [], sourceVersion: json.sourceVersion || null });
      setGenerated(true);
      setKnowledgeChanged(false);
      setSelectedNodeId(start && (json.nodes || []).some((n) => n.id === start) ? start : json.nodes?.[0]?.id || null);
    } catch (e) {
      setError(e.message || "Unable to generate knowledge graph");
    } finally {
      setLoading(false);
    }
  }

  async function checkForNewKnowledge() {
    if (!generated || !data.sourceVersion) return;
    try {
      const response = await fetch(`/api/org/${orgId}/knowledge-graph?meta=1`);
      if (!response.ok) return;
      const json = await response.json();
      if (json.sourceVersion && json.sourceVersion !== data.sourceVersion) setKnowledgeChanged(true);
    } catch {
      // This check is intentionally best-effort and never blocks graph use.
    }
  }

  useEffect(() => {
    if (!generated) return undefined;
    const id = window.setInterval(checkForNewKnowledge, 60000);
    return () => window.clearInterval(id);
  }, [generated, data.sourceVersion, orgId]);

  function selectNode(node) {
    setSelectedNodeId(node.id);
  }

  function searchGraph(e) {
    e?.preventDefault();
    const first = data.nodes.find((n) => n.label?.toLowerCase().includes(q.trim().toLowerCase()));
    if (first) setSelectedNodeId(first.id);
  }

  return (
    <Layout orgId={orgId}>
      <div className="mx-auto max-w-[1500px] space-y-5 p-6">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold">Organizational Knowledge Graph</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">Generate a readable map of connected organizational knowledge, then inspect a node before choosing to open it.</p>
        </div>

        <section className="rounded-2xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="inline-flex rounded-xl border p-1 dark:border-gray-700">
              <button onClick={() => setScope("org")} className={`rounded-lg px-4 py-2 text-sm font-medium ${scope === "org" ? "bg-primary-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>Org-wide</button>
              <button onClick={() => setScope("department")} className={`rounded-lg px-4 py-2 text-sm font-medium ${scope === "department" ? "bg-primary-600 text-white" : "text-gray-600 dark:text-gray-300"}`}>Dept-wise</button>
            </div>

            {scope === "department" && (
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="min-w-56 rounded-lg border bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
                <option value="">Choose department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center"><input type="checkbox" checked={includeSuggested} onChange={(e) => setIncludeSuggested(e.target.checked)} className="mr-2" />Suggested links</label>
              <select value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)} className="rounded-lg border bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                <option value="">All relationships</option>
                <option value="shares_topic">Shares topic</option>
                <option value="shares_entity">Shares entity</option>
                <option value="related_to_project">Related to project</option>
                <option value="related_to_lesson">Related to lesson</option>
                <option value="conflict">Conflict</option>
              </select>
            </div>
          </div>
        </section>

        {!generated ? (
          <section className="flex min-h-[520px] flex-col items-center justify-center rounded-2xl border bg-white text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="rounded-full bg-primary-50 p-4 text-primary-600 dark:bg-primary-950/40"><Network className="h-9 w-9" /></div>
            <h2 className="mt-4 text-xl font-semibold">Build your knowledge map</h2>
            <p className="mt-2 max-w-lg text-sm text-gray-500">The graph uses relationships, projects, topics, experts, decisions and lessons already stored in KMS. Generating this view does not call an LLM.</p>
            <button disabled={loading} onClick={() => generateGraph()} className="mt-6 rounded-xl bg-primary-600 px-6 py-3 font-medium text-white disabled:opacity-60">
              {loading ? "Generating…" : "Generate Graph"}
            </button>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </section>
        ) : (
          <>
            {knowledgeChanged && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <span>New knowledge has been ingested. Refresh the graph and insights when you are ready.</span>
                <button onClick={() => generateGraph()} className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-medium dark:border-amber-800 dark:bg-gray-900"><RefreshCw className="h-4 w-4" />Regenerate</button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <form onSubmit={searchGraph} className="flex min-w-[300px] flex-1 gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 dark:border-gray-700 dark:bg-gray-900" placeholder="Find a node in this graph" />
                </div>
                <button className="rounded-lg border px-4 text-sm font-medium">Find</button>
              </form>
              <button onClick={() => generateGraph()} disabled={loading} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm font-medium dark:border-gray-700 dark:bg-gray-900"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Regenerate</button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading && <p className="text-sm text-gray-500">Refreshing graph…</p>}
            {!loading && visibleNodes.length === 0 ? (
              <div className="rounded-2xl border bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900">No graph nodes match the current scope and filters.</div>
            ) : (
              <ProgressiveKnowledgeGraph
                nodes={visibleNodes}
                edges={visibleEdges}
                selectedNodeId={selectedNodeId}
                onSelect={selectNode}
                onExplore={(node) => generateGraph({ start: node.id })}
                onOpenDocument={(node) => router.push(`/document?id=${node.entityId}`)}
              />
            )}

            <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-gray-500 dark:bg-slate-900">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              Insights on this page are derived from stored graph relationships and evidence. No LLM request is made when selecting nodes, searching, filtering, or generating/regenerating the visualization.
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
