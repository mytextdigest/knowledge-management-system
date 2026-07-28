"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText } from "lucide-react";

export default function RelatedWorkPanel({ orgId, departmentId = null, excludeProjectId = null }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "5" });
        if (departmentId) params.set("departmentId", departmentId);
        if (excludeProjectId) params.set("excludeProjectId", excludeProjectId);
        const response = await fetch(`/api/org/${orgId}/recommendations?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        setItems(Array.isArray(data.recommendations) ? data.recommendations : []);
      } catch (error) {
        if (error?.name !== "AbortError") console.error("Failed to load recommendations:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [orgId, departmentId, excludeProjectId]);

  if (!loading && items.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <Sparkles className="h-4 w-4 text-primary-600" />
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Related to your work</h2>
      </div>

      {loading ? (
        <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Finding relevant documents...</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((item) => (
            <button
              key={item.documentId}
              type="button"
              onClick={() => router.push(`/document?id=${item.documentId}`)}
              className="flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {item.filename}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {item.reason}
                </span>
                {(item.projectName || item.departmentName) && (
                  <span className="mt-1 block truncate text-xs text-gray-400 dark:text-gray-500">
                    {[item.projectName, item.departmentName].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
