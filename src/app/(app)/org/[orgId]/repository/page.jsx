"use client";

import RepositoryDocumentCard from "@/components/repository/RepositoryDocumentCard";
import RepositoryFilters from "@/components/repository/RepositoryFilters";
import UploadToRepositoryModal from "@/components/repository/UploadToRepositoryModal";
import Layout from "@/components/layout/Layout";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

// Keys here are RepositoryFilters' own field names; values are the query
// param names the GET /api/org/[orgId]/repository route actually reads.
const FILTER_PARAM_MAP = {
  departmentId: "dept",
  category: "category",
  lifecycle: "lifecycle",
  fileType: "fileType",
  dateFrom: "dateFrom",
  dateTo: "dateTo",
};

const initialFilters = {
  departmentId: "",
  category: "",
  lifecycle: "",
  fileType: "",
  dateFrom: "",
  dateTo: "",
};

export default function RepositoryPage({ params }) {
  const resolvedParams = use(params);
  const orgId = resolvedParams?.orgId;
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [documents, setDocuments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [orgRole, setOrgRole] = useState(null);
  const latestRequestId = useRef(0);
  const canUpload = orgRole !== null && orgRole !== "guest";

  const queryString = useMemo(() => {
    const search = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) search.set(FILTER_PARAM_MAP[key] || key, value);
    });
    search.set("page", String(page));

    return search.toString();
  }, [filters, page]);

  async function loadRepository() {
    if (!orgId) return;

    // Changing a filter resets the page to 1 in a separate effect, which can
    // fire a second request (new filters + stale page) before this one
    // settles. Only the most recently issued request is allowed to update
    // state, so a slow stale response can't overwrite a newer one.
    const requestId = ++latestRequestId.current;

    setLoading(true);
    setError("");

    try {
      const url = queryString
        ? `/api/org/${orgId}/repository?${queryString}`
        : `/api/org/${orgId}/repository`;

      const res = await fetch(url);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Repository API is not available yet.");
      }

      const data = await res.json();

      if (requestId !== latestRequestId.current) return;

      setDocuments(data.documents || data || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total ?? (Array.isArray(data) ? data.length : 0));
    } catch (err) {
      if (requestId !== latestRequestId.current) return;
      setError(err.message || "Failed to load repository.");
      setDocuments([]);
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }

  async function loadOrgRole() {
    if (!orgId) return;

    try {
      const res = await fetch(`/api/org/${orgId}/settings`);
      if (!res.ok) return;

      const data = await res.json();
      setOrgRole(data.role || null);
    } catch {
      setOrgRole(null);
    }
  }

  async function loadDepartments() {
    if (!orgId) return;

    try {
      const res = await fetch(`/api/org/${orgId}/department`);

      if (!res.ok) return;

      const data = await res.json();
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setDepartments([]);
    }
  }

  useEffect(() => {
    loadDepartments();
    loadOrgRole();
  }, [orgId]);

  // Any filter change should reset back to page 1
  useEffect(() => {
    setPage(1);
  }, [
    filters.departmentId,
    filters.category,
    filters.lifecycle,
    filters.fileType,
    filters.dateFrom,
    filters.dateTo,
  ]);

  useEffect(() => {
    loadRepository();
  }, [orgId, queryString]);

  return (
    <Layout orgId={orgId}>
    <main className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Knowledge Repository
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Browse, filter, and upload organization knowledge documents.
          </p>
        </div>

        {canUpload ? (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Upload Document
          </button>
        ) : null}
      </div>

      <RepositoryFilters
        filters={filters}
        departments={departments}
        onChange={setFilters}
      />

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
          Loading repository documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            No repository documents found
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Upload documents or adjust filters to see organization knowledge.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {documents.map((document) => (
            <RepositoryDocumentCard
              key={document.id}
              document={document}
            />
          ))}
        </div>
      )}

      {!loading && documents.length > 0 && totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <span>
            Page {page} of {totalPages} ({total} documents)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-50 dark:border-gray-600"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-gray-300 px-3 py-1.5 disabled:opacity-50 dark:border-gray-600"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <UploadToRepositoryModal
        orgId={orgId}
        userId={userId}
        departments={departments}
        open={canUpload && uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={loadRepository}
      />
    </main>
    </Layout>
  );
}
