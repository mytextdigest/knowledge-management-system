"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, Download, Info, Loader2 } from "lucide-react";
import { Modal, ModalHeader, ModalTitle, ModalContent } from "@/components/ui/Modal";

const lifecycleStyles = {
  published: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  draft: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  archived: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  retired: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
};

function getFileIcon(fileType = "", filename = "") {
  const value = `${fileType} ${filename}`.toLowerCase();

  if (value.includes("pdf")) return "PDF";
  if (
    value.includes("sheet") ||
    value.includes("excel") ||
    value.includes("csv") ||
    value.includes("xlsx")
  )
    return "XLS";

  if (value.includes("text") || value.includes("txt"))
    return "TXT";

  return "DOC";
}

export default function RepositoryDocumentCard({ document }) {
  const router = useRouter();
  const lifecycle = document?.lifecycle || "published";
  const badgeClass = lifecycleStyles[lifecycle] || lifecycleStyles.published;
  const isPdf = (document?.filename || "").toLowerCase().endsWith(".pdf");

  const [pendingAction, setPendingAction] = useState(null); // "open" | "download" | "preview"
  const [actionError, setActionError] = useState(null);
  const [preview, setPreview] = useState(null); // { fileUrl }

  const uploadedAt = document?.createdAt
    ? new Date(document.createdAt).toLocaleDateString()
    : "Unknown date";

  async function getFileUrl() {
    const res = await fetch(`/api/documents/${document.id}`);
    if (!res.ok) throw new Error("Unable to load this document's file.");
    const data = await res.json();
    if (!data?.fileUrl) throw new Error("No file is attached to this document.");
    return data.fileUrl;
  }

  async function handleOpen() {
    setActionError(null);
    setPendingAction("open");
    try {
      const fileUrl = await getFileUrl();
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePreview() {
    setActionError(null);
    setPendingAction("preview");
    try {
      const fileUrl = await getFileUrl();
      setPreview({ fileUrl });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDownload() {
    setActionError(null);
    setPendingAction("download");
    try {
      const fileUrl = await getFileUrl();
      const link = window.document.createElement("a");
      link.href = fileUrl;
      link.download = document?.filename || "download";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  function handleViewDetails() {
    router.push(`/document?id=${document.id}`);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <div className="text-3xl">
          {getFileIcon(document?.fileType, document?.filename)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {document?.filename || document?.title || "Untitled document"}
          </h3>

          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Uploaded {uploadedAt}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${badgeClass}`}>
          {lifecycle}
        </span>

        {document?.department?.name || document?.departmentName ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            {document.department?.name || document.departmentName}
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Org-wide
          </span>
        )}

        {document?.category ? (
          <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
            {document.category}
          </span>
        ) : null}
      </div>

      {document?.status ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Status: <span className="font-medium">{document.status}</span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <button
          type="button"
          onClick={handleOpen}
          disabled={pendingAction === "open"}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300 dark:hover:border-blue-700"
        >
          {pendingAction === "open" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ExternalLink className="h-3.5 w-3.5" />
          )}
          Open
        </button>

        <button
          type="button"
          onClick={handlePreview}
          disabled={pendingAction === "preview"}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-purple-900/30 dark:hover:text-purple-300 dark:hover:border-purple-700"
        >
          {pendingAction === "preview" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Preview
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={pendingAction === "download"}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-green-50 hover:text-green-700 hover:border-green-300 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-green-900/30 dark:hover:text-green-300 dark:hover:border-green-700"
        >
          {pendingAction === "download" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download
        </button>

        <button
          type="button"
          onClick={handleViewDetails}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <Info className="h-3.5 w-3.5" />
          View Details
        </button>
      </div>

      {actionError ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p>
      ) : null}

      <Modal isOpen={!!preview} onClose={() => setPreview(null)} size="xl">
        <ModalHeader>
          <ModalTitle>{document?.filename || "Document preview"}</ModalTitle>
        </ModalHeader>
        <ModalContent>
          {preview && isPdf ? (
            <iframe
              src={preview.fileUrl}
              title={document?.filename || "Document preview"}
              className="h-[70vh] w-full rounded-md border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Preview isn't available for this file type yet. Use Open or Download to view the file.
            </p>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
