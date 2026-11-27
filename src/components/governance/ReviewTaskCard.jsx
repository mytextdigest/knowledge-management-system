"use client";
import { useState } from "react";
import Link from "next/link";

// B-18 (E25): one periodic review assigned to the viewer, with its three
// outcomes. "Still valid" resets the review date; "Needs update" sends the
// document back to draft for its owner; "Retire" asks the owner to start a
// decommission. A reason is required for the last two.
const OUTCOMES = [
  { value: "valid", label: "Still valid", tone: "bg-green-700 text-white" },
  { value: "update", label: "Needs update", tone: "border" },
  { value: "retire", label: "Recommend retiring", tone: "border border-red-400 text-red-700" },
];
const DONE = { valid: "Confirmed still valid", update: "Update requested", retire: "Retirement recommended", cancelled: "Cancelled" };

export default function ReviewTaskCard({ orgId, review, showDocumentLink = true, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const due = new Date(review.dueAt);
  const overdue = review.status === "pending" && due < new Date();

  async function decide(outcome) {
    if (outcome !== "valid" && !note.trim()) { setError("Add a reason for this outcome."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/org/${encodeURIComponent(orgId)}/reviews/${encodeURIComponent(review.id)}/outcome`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not record the review");
      onDone?.(outcome);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <article className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="font-semibold">{review.document?.filename || "Document"}</h3>
        <p className="text-sm text-gray-500">
          {review.policy?.name || "Periodic review"} · due {due.toLocaleDateString()}
          {review.escalatedAt ? " · escalated" : ""}
        </p>
        {review.document?.lifecycleSuggestion === "archived" && <p className="text-sm text-amber-700 dark:text-amber-300">May be outdated{review.document.lifecycleSuggestionReason ? `: ${review.document.lifecycleSuggestionReason}` : ""}</p>}
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-xs ${overdue ? "border-red-400 text-red-700" : ""}`}>
        {review.status === "pending" ? (overdue ? "Overdue" : "To review") : (DONE[review.status] || review.status)}
      </span>
    </div>
    {showDocumentLink && <Link className="text-sm text-blue-600 underline" href={`/document?id=${encodeURIComponent(review.documentId)}`}>Open document</Link>}
    {review.status !== "pending" && review.note && <p className="text-sm text-gray-600 dark:text-gray-300">Note: {review.note}</p>}
    {review.status === "pending" && <div className="space-y-2 border-t pt-3">
      <p className="text-sm">Is this document still accurate and current?</p>
      <label className="block text-sm">Reason (required unless still valid)
        <textarea maxLength={2000} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block w-full rounded border bg-transparent p-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((o) => <button key={o.value} type="button" disabled={busy} onClick={() => decide(o.value)} className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${o.tone}`}>{o.label}</button>)}
      </div>
    </div>}
  </article>;
}
