"use client";

import { useMemo } from "react";
import {
  Building2,
  CircleDot,
  FileText,
  FolderKanban,
  Lightbulb,
  Tag,
  UserRound,
  BookOpenCheck,
  ExternalLink,
  Network,
  Sparkles,
} from "lucide-react";

const typeConfig = {
  document: { icon: FileText, label: "Document", fill: "#2563eb", ring: 1 },
  project: { icon: FolderKanban, label: "Project", fill: "#7c3aed", ring: 1 },
  topic: { icon: Tag, label: "Topic", fill: "#0891b2", ring: 2 },
  entity: { icon: CircleDot, label: "Entity", fill: "#0f766e", ring: 2 },
  expert: { icon: UserRound, label: "Expert", fill: "#c2410c", ring: 2 },
  decision: { icon: Lightbulb, label: "Decision", fill: "#a16207", ring: 2 },
  lesson: { icon: BookOpenCheck, label: "Lesson", fill: "#4d7c0f", ring: 2 },
  department: { icon: Building2, label: "Department", fill: "#475569", ring: 1 },
};

const edgeLabel = (edge) => edge.type?.replaceAll("_", " ") || "connected to";
const isExpertEdge = (e) => e.type==="expert_in";
const confidenceLabel = (edge) => {
  if (edge.weight == null) return null;
  if (isExpertEdge(edge)) return `expertise score ${Number(edge.weight).toFixed(2)}`;
  return `${Math.round(Number(edge.weight) * 100)}% confidence`;
};

function layoutGraph(nodes, edges, selectedId) {
  const width = 980;
  const height = 600;
  const cx = width / 2;
  const cy = height / 2;
  const selected = nodes.find((n) => n.id === selectedId) || nodes[0];
  const positions = new Map();
  if (!selected) return { width, height, positions };
  positions.set(selected.id, { x: cx, y: cy });

  const neighbors = new Set();
  edges.forEach((edge) => {
    if (edge.source === selected.id) neighbors.add(edge.target);
    if (edge.target === selected.id) neighbors.add(edge.source);
  });

  const firstRing = nodes.filter((n) => n.id !== selected.id && neighbors.has(n.id));
  const secondRing = nodes.filter((n) => n.id !== selected.id && !neighbors.has(n.id));

  const placeRing = (items, radiusX, radiusY, offset = 0) => {
    items.forEach((node, index) => {
      const angle = offset + (Math.PI * 2 * index) / Math.max(items.length, 1);
      positions.set(node.id, {
        x: cx + Math.cos(angle) * radiusX,
        y: cy + Math.sin(angle) * radiusY,
      });
    });
  };

  placeRing(firstRing, 245, 185, -Math.PI / 2);
  placeRing(secondRing, 410, 255, -Math.PI / 2 + 0.35);
  return { width, height, positions };
}

export default function ProgressiveKnowledgeGraph({
  nodes,
  edges,
  selectedNodeId,
  onSelect,
  onExplore,
  onOpenDocument,
}) {
  const selected = nodes.find((n) => n.id === selectedNodeId) || nodes[0] || null;
  const selectedId = selected?.id || null;
  const { width, height, positions } = useMemo(
    () => layoutGraph(nodes, edges, selectedId),
    [nodes, edges, selectedId]
  );

  const connectedEdges = useMemo(
    () => edges.filter((e) => e.source === selectedId || e.target === selectedId),
    [edges, selectedId]
  );

  const connectedNodes = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return connectedEdges
      .map((edge) => byId.get(edge.source === selectedId ? edge.target : edge.source))
      .filter(Boolean);
  }, [nodes, connectedEdges, selectedId]);

  const counts = useMemo(
    () => nodes.reduce((acc, node) => ({ ...acc, [node.type]: (acc[node.type] || 0) + 1 }), {}),
    [nodes]
  );

  if (!nodes.length) return null;

  return (
    <div className="grid min-h-[650px] gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Network className="h-4 w-4 text-primary-600" />
            Knowledge connections
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
            {Object.entries(counts).map(([type, count]) => (
              <span key={type} className="rounded-full border px-2 py-1 dark:border-gray-700">
                {count} {type}
              </span>
            ))}
          </div>
        </div>

        <div className="relative min-h-[600px] overflow-auto bg-slate-50/70 dark:bg-slate-950/40">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[600px] min-w-[760px] w-full" role="img" aria-label="Interactive organizational knowledge graph">
            <defs>
              <marker id="kg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>

            {edges.map((edge, index) => {
              const a = positions.get(edge.source);
              const b = positions.get(edge.target);
              if (!a || !b) return null;
              const active = edge.source === selectedId || edge.target === selectedId;
              return (
                <line
                  key={`${edge.source}-${edge.target}-${edge.type}-${index}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={active ? "#64748b" : "#cbd5e1"}
                  strokeWidth={active ? 2.2 : 1.25}
                  strokeDasharray={edge.provenance === "suggested" ? "6 5" : undefined}
                  markerEnd="url(#kg-arrow)"
                />
              );
            })}

            {nodes.map((node) => {
              const p = positions.get(node.id);
              if (!p) return null;
              const config = typeConfig[node.type] || { fill: "#64748b", label: node.type };
              const active = node.id === selectedId;
              const shortLabel = node.label?.length > 30 ? `${node.label.slice(0, 28)}…` : node.label;
              return (
                <g
                  key={node.id}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => onSelect(node)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex="0"
                  aria-label={`Select ${node.label}`}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(node)}
                >
                  <circle r={active ? 34 : 27} fill="white" stroke={config.fill} strokeWidth={active ? 5 : 3} />
                  <circle r={active ? 23 : 18} fill={config.fill} opacity="0.14" />
                  <circle r={active ? 9 : 7} fill={config.fill} />
                  <rect x="-76" y={active ? 42 : 36} width="152" height="42" rx="9" fill="white" stroke={active ? config.fill : "#cbd5e1"} strokeWidth={active ? 2 : 1} />
                  <text x="0" y={active ? 58 : 52} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">
                    {shortLabel}
                  </text>
                  <text x="0" y={active ? 72 : 66} textAnchor="middle" fontSize="9" fill="#64748b">
                    {config.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <aside className="rounded-2xl border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-primary-600" />
            Insights
          </div>
          <p className="mt-1 text-xs text-gray-500">Built from stored graph evidence. Selecting a node does not open a document.</p>
        </div>

        {selected ? (
          <div className="space-y-5 p-4">
            <div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {typeConfig[selected.type]?.label || selected.type}
              </span>
              <h2 className="mt-2 break-words text-base font-semibold">{selected.label}</h2>
              <p className="mt-1 text-sm text-gray-500">{connectedEdges.length} direct connection{connectedEdges.length === 1 ? "" : "s"} in this view</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Why it is connected</h3>
              <div className="mt-2 space-y-2">
                {connectedEdges.length ? connectedEdges.slice(0, 8).map((edge, index) => {
                  const otherId = edge.source === selectedId ? edge.target : edge.source;
                  const other = nodes.find((n) => n.id === otherId);
                  return (
                    <button key={`${edge.type}-${index}`} onClick={() => other && onSelect(other)} className="w-full rounded-xl border p-3 text-left hover:border-primary-300 dark:border-gray-700">
                      <div className="text-sm font-medium">{other?.label || "Connected knowledge"}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {edgeLabel(edge)} · {edge.provenance}
                        {confidenceLabel(edge) ? ` · ${confidenceLabel(edge)}` : ""}
                      </div>
                      {edge.evidence?.sharedEntities?.length > 0 && (
                        <div className="mt-1 text-xs text-gray-500">Shared entities: {edge.evidence.sharedEntities.slice(0, 3).join(", ")}</div>
                      )}
                      {edge.evidence?.projectContext ? <div className="mt-1 text-xs text-gray-500">Same project context</div> : null}
                    </button>
                  );
                }) : <p className="text-sm text-gray-500">No direct connections in the current filtered view.</p>}
              </div>
            </div>

            {connectedNodes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Connected knowledge</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {connectedNodes.slice(0, 5).map((n) => n.label).join(" • ")}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t pt-4 dark:border-gray-700">
              <button onClick={() => onExplore(selected)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:border-primary-400">
                Explore this node
              </button>
              {selected.type === "document" && (
                <button onClick={() => onOpenDocument(selected)} className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                  <ExternalLink className="h-4 w-4" />
                  Open document
                </button>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
