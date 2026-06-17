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
  userId,
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

    if (!userId) {
      setError("You must be signed in to upload.");
      return;
    }

    try {
      setIsUploading(true);

      const presignRes = await fetch("/api/s3/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          userId,
          orgId,
        }),
      });
      const presignData = await presignRes.json().catch(() => ({}));

      if (!presignRes.ok) {
        throw new Error(presignData.error || "Failed to prepare upload.");
      }

      const { url, fields, key } = presignData;

      const s3Form = new FormData();
      Object.entries(fields).forEach(([k, v]) => s3Form.append(k, v));
      s3Form.append("file", file);

      const s3Res = await fetch(url, { method: "POST", body: s3Form });
      if (!s3Res.ok) {
        throw new Error("S3 upload failed.");
      }

      const ingestForm = new FormData();
      ingestForm.append("s3Key", key);
      ingestForm.append("scope", "repository");
      ingestForm.append("orgId", orgId);
      ingestForm.append("category", category);
      if (departmentId) ingestForm.append("departmentId", departmentId);

      const ingestRes = await fetch("/api/documents/ingest", {
        method: "POST",
        body: ingestForm,
      });

      if (!ingestRes.ok) {
        const data = await ingestRes.json().catch(() => ({}));
        throw new Error(data.error || "Ingestion failed.");
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