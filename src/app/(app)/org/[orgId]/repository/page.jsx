"use client";

import RepositoryDocumentCard from "@/components/repository/RepositoryDocumentCard";
import RepositoryFilters from "@/components/repository/RepositoryFilters";
import UploadToRepositoryModal from "@/components/repository/UploadToRepositoryModal";
import { use, useEffect, useMemo, useState } from "react";
const initialFilters = {
  departmentId: "",
  category: "",
  lifecycle: "",
  fileType: "",
};

export default function RepositoryPage({ params }) {
  const resolvedParams = use(params);
  const orgId = resolvedParams?.orgId;

  const [documents, setDocuments] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const queryString = useMemo(() => {
    const search = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });

    return search.toString();
  }, [filters]);

  async function loadRepository() {
    if (!orgId) return;

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

      setDocuments(data.documents || data || []);
    } catch (err) {
      setError(err.message || "Failed to load repository.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadDepartments() {
    if (!orgId) return;

    try {
      const res = await fetch(`/api/org/${orgId}/departments`);

      if (!res.ok) return;

      const data = await res.json();
      setDepartments(data.departments || data || []);
    } catch {
      setDepartments([]);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, [orgId]);

  useEffect(() => {
    loadRepository();
  }, [orgId, queryString]);

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Knowledge Repository
          </h1>
          <p className="text-sm text-gray-500">
            Browse, filter, and upload organization knowledge documents.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Upload Document
        </button>
      </div>

      <RepositoryFilters
        filters={filters}
        departments={departments}
        onChange={setFilters}
      />

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-500">
          Loading repository documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900">
            No repository documents found
          </h2>
          <p className="mt-2 text-sm text-gray-500">
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

      <UploadToRepositoryModal
        orgId={orgId}
        departments={departments}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={loadRepository}
      />
    </main>
  );
}
