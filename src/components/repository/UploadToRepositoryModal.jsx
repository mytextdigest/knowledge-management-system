"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X, AlertCircle, CheckCircle } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";

const CATEGORIES = [
  "Policies",
  "SOPs",
  "Reports",
  "Meeting Knowledge",
  "Product Knowledge",
  "Historical Documents",
  "Other",
];

// Kept in sync with the extraction branches in worker/index.js — .doc (legacy
// binary Word) and .md are NOT handled there, so they're deliberately left
// out here rather than accepted client-side and failing ingestion silently.
const ACCEPTED_TYPES = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt"];
const MAX_FILES = 10;

function makeFileEntry(file) {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  const errors = [];
  if (!ACCEPTED_TYPES.includes(ext)) {
    errors.push(`File type ${ext} is not supported`);
  }
  return {
    id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 9)}`,
    file,
    name: file.name,
    size: file.size,
    status: errors.length > 0 ? "error" : "pending",
    error: errors[0] || "",
  };
}

export default function UploadToRepositoryModal({
  orgId,
  userId,
  departments = [],
  fixedDepartmentId,
  open,
  onClose,
  onUploaded,
}) {
  const [files, setFiles] = useState([]);
  const [departmentId, setDepartmentId] = useState(fixedDepartmentId || "");
  const [category, setCategory] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const resetForm = useCallback(() => {
    setFiles([]);
    setDepartmentId(fixedDepartmentId || "");
    setCategory("");
    setFormError("");
  }, [fixedDepartmentId]);

  if (!open) return null;

  function addFiles(fileList) {
    setFormError("");
    const incoming = Array.from(fileList);
    setFiles((prev) => {
      const room = MAX_FILES - prev.length;
      if (room <= 0) {
        setFormError(`You can upload up to ${MAX_FILES} files at once.`);
        return prev;
      }
      const accepted = incoming.slice(0, room).map(makeFileEntry);
      if (incoming.length > room) {
        setFormError(`Only ${MAX_FILES} files can be uploaded at once — the rest were skipped.`);
      }
      return [...prev, ...accepted];
    });
  }

  function removeFile(id) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  async function uploadOne(fileItem) {
    const presignRes = await fetch("/api/s3/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: fileItem.file.name,
        fileType: fileItem.file.type,
        userId,
        orgId,
      }),
    });
    const presignData = await presignRes.json().catch(() => ({}));
    if (!presignRes.ok) throw new Error(presignData.error || "Failed to prepare upload.");

    const { url, fields, key } = presignData;
    const s3Form = new FormData();
    Object.entries(fields).forEach(([k, v]) => s3Form.append(k, v));
    s3Form.append("file", fileItem.file);

    const s3Res = await fetch(url, { method: "POST", body: s3Form });
    if (!s3Res.ok) throw new Error("S3 upload failed.");

    const ingestForm = new FormData();
    ingestForm.append("s3Key", key);
    ingestForm.append("scope", "repository");
    ingestForm.append("orgId", orgId);
    ingestForm.append("category", category);
    if (departmentId) ingestForm.append("departmentId", departmentId);

    const ingestRes = await fetch("/api/documents/ingest", { method: "POST", body: ingestForm });
    if (!ingestRes.ok) {
      const data = await ingestRes.json().catch(() => ({}));
      throw new Error(data.error || "Ingestion failed.");
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    setFormError("");

    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) {
      setFormError("Please add at least one supported file.");
      return;
    }
    if (!category) {
      setFormError("Please select a document type.");
      return;
    }
    if (!userId) {
      setFormError("You must be signed in to upload.");
      return;
    }

    setIsUploading(true);
    let hadErrors = false;

    for (const fileItem of pending) {
      setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? { ...f, status: "uploading" } : f)));
      try {
        await uploadOne(fileItem);
        setFiles((prev) => prev.map((f) => (f.id === fileItem.id ? { ...f, status: "success" } : f)));
      } catch (err) {
        hadErrors = true;
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id ? { ...f, status: "error", error: err.message || "Upload failed." } : f
          )
        );
      }
    }

    setIsUploading(false);
    onUploaded?.();

    if (!hadErrors) {
      resetForm();
      onClose?.();
    }
  }

  function handleClose() {
    if (isUploading) return;
    resetForm();
    onClose?.();
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Upload to Repository
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add up to {MAX_FILES} documents to the organization knowledge repository.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            X
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              dragActive
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(",")}
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />
            <Upload className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Drop files here or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Supports PDF, Word (.docx), Excel (.xlsx, .xls), CSV, and TXT — up to {MAX_FILES} files at once
            </p>
          </div>

          {files.length > 0 && (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto">
              {files.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border p-2 text-sm",
                    f.status === "error"
                      ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                      : f.status === "success"
                      ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                      : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {f.status === "success" ? (
                      <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600" />
                    ) : f.status === "error" ? (
                      <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
                    ) : (
                      <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-gray-900 dark:text-gray-100">{f.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(f.size)}
                        {f.status === "uploading" ? " · Uploading..." : ""}
                        {f.error ? ` · ${f.error}` : ""}
                      </p>
                    </div>
                  </div>
                  {f.status !== "uploading" && f.status !== "success" && (
                    <button
                      type="button"
                      onClick={() => removeFile(f.id)}
                      className="flex-shrink-0 text-gray-400 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {fixedDepartmentId ? null : (
            <select
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Document type <span className="text-red-600">*</span>
            </label>
            <select
              required
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="" disabled>
                Select a document type
              </option>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {formError ? (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {formError}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {pendingCount > 0 ? `${pendingCount} file${pendingCount === 1 ? "" : "s"} ready` : ""}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200"
                disabled={isUploading}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="rounded-md bg-primary-600 hover:bg-primary-700 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={isUploading || pendingCount === 0}
              >
                {isUploading ? "Uploading..." : `Upload${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
