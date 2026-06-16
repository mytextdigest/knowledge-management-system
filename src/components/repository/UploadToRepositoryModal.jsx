"use client";

import { useState } from "react";

const CATEGORIES = [
  "Policies",
  "SOPs",
  "Reports",
  "Meeting Knowledge",
  "Product Knowledge",
  "Historical Documents",
  "Other",
];

export default function UploadToRepositoryModal({
  orgId,
  departments = [],
  open,
  onClose,
  onUploaded,
}) {
  const [file, setFile] = useState(null);
  const [departmentId, setDepartmentId] = useState("");
  const [category, setCategory] = useState("Policies");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleUpload(e) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", "repository");
    formData.append("orgId", orgId);
    formData.append("category", category);

    if (departmentId) {
      formData.append("departmentId", departmentId);
    }

    try {
      setIsUploading(true);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed.");
      }

      setFile(null);
      setDepartmentId("");
      setCategory("Policies");

      onUploaded?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Upload to Repository
            </h2>
            <p className="text-sm text-gray-500">
              Add a document to the organization knowledge repository.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100"
          >
            X
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="file"
            className="w-full rounded-md border p-2"
            accept=".pdf,.txt,.md,.csv,.xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <select
            className="w-full rounded-md border p-2"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">Org-wide document</option>

            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>

          <select
            className="w-full rounded-md border p-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          {error ? (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm"
              disabled={isUploading}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}