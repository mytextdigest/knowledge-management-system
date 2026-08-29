"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, Download, Info, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { Modal, ModalHeader, ModalTitle, ModalContent } from "@/components/ui/Modal";

const CATEGORIES = [
  "Policies",
  "SOPs",
  "Reports",
  "Meeting Knowledge",
  "Product Knowledge",
  "Historical Documents",
  "Other",
];

const lifecycleStyles = {
  published: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  draft: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  archived: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  retired: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
};

const ALLOWED_TRANSITIONS = {
  draft: { published: ["super_admin", "dept_admin"] },
  published: {
    archived: ["super_admin", "dept_admin"],
    retired: ["super_admin"],
    draft: ["super_admin"],
  },
  archived: {
    retired: ["super_admin"],
    published: ["super_admin"],
    draft: ["super_admin"],
  },
  retired: { published: ["super_admin"], draft: ["super_admin"] },
};

function getFileIcon(fileType = "", filename = "") {
  const value = `${fileType} ${filename}`.toLowerCase();
  if (value.includes("pdf")) return "PDF";
  if (value.includes("sheet") || value.includes("excel") || value.includes("csv") || value.includes("xlsx")) return "XLS";
  if (value.includes("text") || value.includes("txt")) return "TXT";
  return "DOC";
}

function confidenceLabel(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Math.round(Number(value) * 100)}%`;
}

export default function RepositoryDocumentCard({
  document,
  orgRole,
  departments = [],
  onLifecycleChange,
  onDocumentSignalChange,
}) {
  const router = useRouter();
  const lowerFilename = (document?.filename || "").toLowerCase();
  const isPdf = lowerFilename.endsWith(".pdf");
  const isSpreadsheet = /\.(xlsx|xls|csv)$/.test(lowerFilename);
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lifecycle, setLifecycle] = useState(document?.lifecycle || "published");
  const [changingLifecycle, setChangingLifecycle] = useState(false);
  const [duplicateSignals, setDuplicateSignals] = useState(document?.duplicatesAsDocument || []);
  const [projectSuggestions, setProjectSuggestions] = useState(document?.projectLinks || []);
  const [lifecycleSuggestion, setLifecycleSuggestion] = useState(document?.lifecycleSuggestion || null);
  const [lifecycleSuggestionReason, setLifecycleSuggestionReason] = useState(document?.lifecycleSuggestionReason || null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCategory, setReviewCategory] = useState(document?.category || "");
  const [reviewDepartmentId, setReviewDepartmentId] = useState(document?.departmentId || document?.suggestedDepartmentId || "");
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => setLifecycle(document?.lifecycle || "published"), [document?.lifecycle]);
  useEffect(() => setDuplicateSignals(document?.duplicatesAsDocument || []), [document?.duplicatesAsDocument]);
  useEffect(() => setProjectSuggestions(document?.projectLinks || []), [document?.projectLinks]);
  useEffect(() => {
    setLifecycleSuggestion(document?.lifecycleSuggestion || null);
    setLifecycleSuggestionReason(document?.lifecycleSuggestionReason || null);
  }, [document?.lifecycleSuggestion, document?.lifecycleSuggestionReason]);
  useEffect(() => {
    setReviewCategory(document?.category || "");
    setReviewDepartmentId(document?.departmentId || document?.suggestedDepartmentId || "");
  }, [document?.category, document?.departmentId, document?.suggestedDepartmentId]);

  const badgeClass = lifecycleStyles[lifecycle] || lifecycleStyles.published;
  const categoryConfidence = confidenceLabel(document?.categoryConfidence);
  const departmentConfidence = confidenceLabel(document?.departmentSuggestionConfidence);
  const availableTransitions = orgRole
    ? Object.entries(ALLOWED_TRANSITIONS[lifecycle] || {}).filter(([, roles]) => roles.includes(orgRole)).map(([state]) => state)
    : [];
  const reviewDepartments = useMemo(() => {
    const byId = new Map(departments.map((d) => [d.id, d]));
    if (document?.suggestedDepartment?.id) byId.set(document.suggestedDepartment.id, document.suggestedDepartment);
    if (document?.department?.id) byId.set(document.department.id, document.department);
    return [...byId.values()];
  }, [departments, document?.suggestedDepartment, document?.department]);

  async function patchClassification(body) {
    const res = await fetch(`/api/documents/${document.id}/classification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to update classification.");
    return data;
  }

  async function handleLifecycleChange(newState) {
    if (!newState || newState === lifecycle) return;
    setActionError(null);
    setChangingLifecycle(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: newState }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to update document status.");
      setLifecycle(data.lifecycle);
      onLifecycleChange?.(document.id, data.lifecycle);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setChangingLifecycle(false);
    }
  }

  async function handleDuplicateStatus(duplicateId, status) {
    setActionError(null);
    setPendingAction(`duplicate-${duplicateId}`);
    try {
      const res = await fetch(`/api/documents/${document.id}/duplicates/${duplicateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to update duplicate signal.");
      setDuplicateSignals((prev) => prev.filter((item) => item.id !== duplicateId));
      onDocumentSignalChange?.(document.id, { duplicateId, duplicateStatus: status });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  async function dismissLifecycleSuggestion() {
    setActionError(null);
    setPendingAction("dismiss-lifecycle");
    try {
      await patchClassification({ dismissLifecycleSuggestion: true });
      setLifecycleSuggestion(null);
      setLifecycleSuggestionReason(null);
      onDocumentSignalChange?.(document.id, { lifecycleSuggestion: null, lifecycleSuggestionReason: null });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  async function saveClassificationReview() {
    setActionError(null);
    setSavingReview(true);
    try {
      const updated = await patchClassification({
        category: reviewCategory || null,
        departmentId: reviewDepartmentId || null,
        classificationStatus: "published",
      });
      setReviewOpen(false);
      onDocumentSignalChange?.(document.id, updated);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingReview(false);
    }
  }

  async function handleProjectSuggestion(linkId, status) {
    setActionError(null);
    setPendingAction(`project-${linkId}`);
    try {
      const res = await fetch(`/api/documents/${document.id}/project-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Unable to update project suggestion.");
      setProjectSuggestions((current) => current.filter((link) => link.id !== linkId));
      onDocumentSignalChange?.(document.id, {
        projectLinks: projectSuggestions.filter((link) => link.id !== linkId),
      });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPendingAction(null);
    }
  }

  const uploadedAt = document?.createdAt ? new Date(document.createdAt).toLocaleDateString() : "Unknown date";

  async function getFileUrls() {
    const res = await fetch(`/api/documents/${document.id}`);
    if (!res.ok) throw new Error("Unable to load this document's file.");
    const data = await res.json();
    if (!data?.fileUrl) throw new Error("No file is attached to this document.");
    return { fileUrl: data.fileUrl, fileDownloadUrl: data.fileDownloadUrl || data.fileUrl };
  }

  async function handleOpen() {
    setActionError(null); setPendingAction("open");
    try {
      // Browsers do not render XLSX/XLS reliably. Open our document detail
      // viewer instead, which renders extracted spreadsheet rows as a grid.
      if (isSpreadsheet) {
        window.open(`/document?id=${document.id}`, "_blank", "noopener,noreferrer");
      } else {
        const { fileUrl } = await getFileUrls();
        window.open(fileUrl, "_blank", "noopener,noreferrer");
      }
    }
    catch (err) { setActionError(err.message); }
    finally { setPendingAction(null); }
  }
  async function handlePreview() {
    setActionError(null); setPendingAction("preview");
    try {
      if (isSpreadsheet) {
        window.open(`/document?id=${document.id}`, "_blank", "noopener,noreferrer");
      } else {
        const { fileUrl } = await getFileUrls();
        setPreview({ fileUrl });
      }
    }
    catch (err) { setActionError(err.message); }
    finally { setPendingAction(null); }
  }
  async function handleDownload() {
    setActionError(null); setPendingAction("download");
    try {
      const link = window.document.createElement("a");
      const { fileDownloadUrl } = await getFileUrls();
      link.href = fileDownloadUrl;
      link.download = document?.filename || "download";
      window.document.body.appendChild(link); link.click(); link.remove();
    } catch (err) { setActionError(err.message); }
    finally { setPendingAction(null); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start gap-3">
        <div className="text-3xl">{getFileIcon(document?.fileType, document?.filename)}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{document?.filename || document?.title || "Untitled document"}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Uploaded {uploadedAt}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${badgeClass}`}>{lifecycle}</span>
        {document?.department?.name || document?.departmentName ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-300">{document.department?.name || document.departmentName}</span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Org-wide</span>
        )}
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${document?.category ? "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>
          {document?.category || "Uncategorized"}
        </span>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          Classification: {(document?.classificationStatus || "pending_classification").replaceAll("_", " ")}{categoryConfidence ? ` · ${categoryConfidence}` : ""}
        </span>

        {document?.relatedDocumentCount > 0 ? (
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">
            {document.relatedDocumentCount} related
          </span>
        ) : null}
        {availableTransitions.length > 0 ? (
          <select value="" disabled={changingLifecycle} onChange={(e) => handleLifecycleChange(e.target.value)} className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
            <option value="" disabled>{changingLifecycle ? "Updating…" : "Change status…"}</option>
            {availableTransitions.map((state) => <option key={state} value={state}>Move to {state}</option>)}
          </select>
        ) : null}
      </div>

      {(document?.classificationStatus === "needs_review" || document?.suggestedDepartmentId) ? (
        <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-800 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Classification review</p>
              <p className="mt-1">Suggested category: {document?.category || "Uncategorized"}{categoryConfidence ? ` (${categoryConfidence})` : ""}</p>
              {document?.suggestedDepartment?.name ? <p>Suggested department: {document.suggestedDepartment.name}{departmentConfidence ? ` (${departmentConfidence})` : ""}</p> : null}
            </div>
            <button type="button" onClick={() => setReviewOpen((v) => !v)} className="rounded-md border border-purple-300 bg-white px-2 py-1 font-medium text-purple-700 dark:bg-gray-900">{reviewOpen ? "Close" : "Review"}</button>
          </div>
          {reviewOpen ? (
            <div className="mt-3 grid gap-2">
              <select value={reviewCategory} onChange={(e) => setReviewCategory(e.target.value)} className="rounded-md border border-purple-200 bg-white p-2 text-gray-900 dark:border-purple-700 dark:bg-gray-900 dark:text-gray-100">
                <option value="">Uncategorized</option>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={reviewDepartmentId} onChange={(e) => setReviewDepartmentId(e.target.value)} className="rounded-md border border-purple-200 bg-white p-2 text-gray-900 dark:border-purple-700 dark:bg-gray-900 dark:text-gray-100">
                <option value="">Org-wide / no department</option>
                {reviewDepartments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
              </select>
              <button type="button" disabled={savingReview} onClick={saveClassificationReview} className="rounded-md bg-purple-700 px-3 py-2 font-medium text-white disabled:opacity-50">{savingReview ? "Saving…" : "Accept / correct suggestion"}</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {projectSuggestions.map((link) => (
        <div key={link.id} className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 dark:border-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200">
          <p className="font-semibold">Suggested for project: {link.project?.name || "Project"}</p>
          <p className="mt-1">
            Confidence {Math.round(Number(link.confidence || 0) * 100)}%
            {link.evidence ? ` · ${link.evidence}` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pendingAction === `project-${link.id}`} onClick={() => handleProjectSuggestion(link.id, "confirmed")} className="inline-flex items-center gap-1 rounded-md bg-cyan-700 px-2 py-1 font-medium text-white disabled:opacity-50"><Check className="h-3 w-3" /> Add to project</button>
            <button type="button" disabled={pendingAction === `project-${link.id}`} onClick={() => handleProjectSuggestion(link.id, "dismissed")} className="inline-flex items-center gap-1 rounded-md border border-cyan-300 bg-white px-2 py-1 font-medium text-cyan-800 dark:bg-gray-900 dark:text-cyan-200"><X className="h-3 w-3" /> Dismiss</button>
          </div>
        </div>
      ))}

      {duplicateSignals.map((duplicate) => (
        <div key={duplicate.id} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1"><p className="font-semibold">Possible duplicate of {duplicate.duplicateOf?.filename || "another document"}</p><p className="mt-1">Similarity {Math.round(Number(duplicate.similarity || 0) * 100)}%</p></div></div>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pendingAction === `duplicate-${duplicate.id}`} onClick={() => handleDuplicateStatus(duplicate.id, "confirmed")} className="inline-flex items-center gap-1 rounded-md bg-amber-700 px-2 py-1 font-medium text-white disabled:opacity-50"><Check className="h-3 w-3" /> Confirm</button>
            <button type="button" disabled={pendingAction === `duplicate-${duplicate.id}`} onClick={() => handleDuplicateStatus(duplicate.id, "dismissed")} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 dark:bg-gray-900 dark:text-amber-200"><X className="h-3 w-3" /> Dismiss</button>
          </div>
        </div>
      ))}

      {lifecycleSuggestion ? (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
          <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">Lifecycle review suggested: {lifecycleSuggestion}</p>{lifecycleSuggestionReason ? <p className="mt-1">{lifecycleSuggestionReason}</p> : null}</div><button type="button" disabled={pendingAction === "dismiss-lifecycle"} onClick={dismissLifecycleSuggestion} className="rounded-md border border-orange-300 bg-white px-2 py-1 font-medium text-orange-800 disabled:opacity-50 dark:bg-gray-900 dark:text-orange-200">Dismiss</button></div>
        </div>
      ) : null}

      {document?.status ? <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Status: <span className="font-medium">{document.status}</span></p> : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <button type="button" onClick={handleOpen} disabled={pendingAction === "open"} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">{pendingAction === "open" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />} Open</button>
        <button type="button" onClick={handlePreview} disabled={pendingAction === "preview"} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">{pendingAction === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Preview</button>
        <button type="button" onClick={handleDownload} disabled={pendingAction === "download"} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">{pendingAction === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download</button>
        <button type="button" onClick={() => router.push(`/document?id=${document.id}`)} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"><Info className="h-3.5 w-3.5" /> View Details</button>
      </div>
      {actionError ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</p> : null}

      <Modal isOpen={!!preview} onClose={() => setPreview(null)} size="xl">
        <ModalHeader><ModalTitle>{document?.filename || "Document preview"}</ModalTitle></ModalHeader>
        <ModalContent>{preview && isPdf ? <iframe src={preview.fileUrl} title={document?.filename || "Document preview"} className="h-[70vh] w-full rounded-md border border-gray-200 dark:border-gray-700" /> : <p className="text-sm text-gray-600 dark:text-gray-300">Preview isn't available for this file type yet. Use Open or Download to view the file.</p>}</ModalContent>
      </Modal>
    </div>
  );
}
