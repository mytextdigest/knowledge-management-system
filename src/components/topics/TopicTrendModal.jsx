"use client";

import { useEffect, useState } from "react";
import { X, Archive } from "lucide-react";
import TopicTrendChart from "@/components/topics/TopicTrendChart";

function formatPeriod(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-[120px] w-full rounded bg-gray-100 dark:bg-gray-700/60" />
    </div>
  );
}

export default function TopicTrendModal({ orgId, topicRef, onClose }) {
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orgId || !topicRef) return;
    setLoading(true);
    setError("");
    setTrend(null);
    fetch(`/api/org/${orgId}/topics/trend/${topicRef}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to load this topic's trend");
        setTrend(data);
      })
      .catch((e) => setError(e.message || "Unable to load this topic's trend"))
      .finally(() => setLoading(false));
  }, [orgId, topicRef]);

  if (!topicRef) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {loading ? "Loading..." : trend?.topicName || "Topic"}
            </h2>
            {trend?.retired && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                <Archive className="h-3 w-3" />Retired — this topic no longer exists, but its history is preserved
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="space-y-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : !trend ? (
          !error && <p className="text-sm text-gray-500">Not found, or you don't have access to this topic's history.</p>
        ) : !trend.hasEnoughHistory ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900">
            Not enough history yet — only {trend.snapshotCount} snapshot{trend.snapshotCount === 1 ? "" : "s"} captured so far. Trend data appears once at least two weekly snapshots exist.
          </p>
        ) : (
          <div className="space-y-6">
            <TopicTrendChart title="Knowledge volume" series={trend.series} valueKey="documentCount" formatPeriod={formatPeriod} />
            <TopicTrendChart title="Contributor (expert) count" series={trend.series} valueKey="expertCount" formatPeriod={formatPeriod} />
          </div>
        )}
      </div>
    </div>
  );
}
