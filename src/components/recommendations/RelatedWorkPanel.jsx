"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FileText, Search, X } from "lucide-react";

const FIELD_CLASS =
  "min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

function ResultList({ items, onSelect }) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-700">
      {items.map((item) => (
        <button
          key={item.documentId}
          type="button"
          onClick={() => onSelect(item.documentId)}
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
  );
}

export default function RelatedWorkPanel({ orgId, departmentId = null, excludeProjectId = null }) {
  const router = useRouter();
  const [ambientItems, setAmbientItems] = useState([]);
  const [ambientLoading, setAmbientLoading] = useState(false);

  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState(null);
  const [searchItems, setSearchItems] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // FR-P3-9: ambient/proactive recommendations, loaded automatically without
  // the user asking for them.
  useEffect(() => {
    if (!orgId) return;
    const controller = new AbortController();

    async function load() {
      setAmbientLoading(true);
      try {
        const params = new URLSearchParams({ limit: "5" });
        if (departmentId) params.set("departmentId", departmentId);
        if (excludeProjectId) params.set("excludeProjectId", excludeProjectId);
        const response = await fetch(`/api/org/${orgId}/recommendations?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        setAmbientItems(Array.isArray(data.recommendations) ? data.recommendations : []);
      } catch (error) {
        if (error?.name !== "AbortError") console.error("Failed to load recommendations:", error);
      } finally {
        if (!controller.signal.aborted) setAmbientLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [orgId, departmentId, excludeProjectId]);

  // FR-P3-4: predictive recommendations, run on request against whatever the
  // user typed — same ranking module as the ambient panel above, just seeded
  // with an explicit query instead of only recent-activity memory.
  async function runSearch(event) {
    event.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed || !orgId) return;

    setSubmittedQuery(trimmed);
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ limit: "5", query: trimmed });
      if (departmentId) params.set("departmentId", departmentId);
      if (excludeProjectId) params.set("excludeProjectId", excludeProjectId);
      const response = await fetch(`/api/org/${orgId}/recommendations?${params}`);
      const data = response.ok ? await response.json() : null;
      setSearchItems(Array.isArray(data?.recommendations) ? data.recommendations : []);
    } catch (error) {
      console.error("Failed to search recommendations:", error);
      setSearchItems([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
    setSubmittedQuery(null);
    setSearchItems([]);
    setQueryInput("");
  }

  const isSearchMode = submittedQuery !== null;
  const showEmptyAmbient = !isSearchMode && !ambientLoading && ambientItems.length === 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-600" />
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Related to your work</h2>
        </div>
        <form onSubmit={runSearch} className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Ask for related documents (e.g. onboarding process, Q1 budget)"
            className={FIELD_CLASS}
          />
          <button
            type="submit"
            disabled={!queryInput.trim()}
            className="flex shrink-0 items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" />
            Find
          </button>
          {isSearchMode && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>

      {isSearchMode ? (
        searchLoading ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
        ) : searchItems.length === 0 ? (
          <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
            No related documents found for &ldquo;{submittedQuery}&rdquo;.
          </p>
        ) : (
          <ResultList items={searchItems} onSelect={(id) => router.push(`/document?id=${id}`)} />
        )
      ) : ambientLoading ? (
        <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">Finding relevant documents...</p>
      ) : showEmptyAmbient ? (
        <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
          Nothing surfaced automatically yet — search above for something specific.
        </p>
      ) : (
        <ResultList items={ambientItems} onSelect={(id) => router.push(`/document?id=${id}`)} />
      )}
    </section>
  );
}
