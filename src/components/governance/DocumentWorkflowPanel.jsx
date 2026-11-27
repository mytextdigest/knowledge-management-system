"use client";
import { useCallback, useEffect, useState } from "react";

// B-15/B-16 (E22): the document's approval workflows. Timeline of every run
// (stages, reviewers, decisions and comments), plus what this viewer may do:
// submit, withdraw, or decide on their own pending task.
const person = (p) => p?.name || p?.email || "Unknown user";
const when = (d) => (d ? new Date(d).toLocaleString() : "");
const STATUS_LABEL = {
  in_review: "In review", approved: "Approved", rejected: "Rejected",
  changes_requested: "Changes requested", cancelled: "Withdrawn",
  pending: "Waiting", superseded: "Superseded",
};
const ACTION_LABEL = { approve: "approved", reject: "rejected", request_changes: "requested changes" };

export default function DocumentWorkflowPanel({ documentId, orgId, onLifecycleChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState([]);
  const [busy, setBusy] = useState(false);
  const [definitionId, setDefinitionId] = useState("");
  const [targetLifecycle, setTargetLifecycle] = useState("archived");
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    if (!documentId) return;
    const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/workflow`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) { setData({ forbidden: true }); return; }
    if (!res.ok) throw new Error(body.error || "Workflow history unavailable");
    setData(body);
  }, [documentId]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function run(request) {
    setBusy(true); setError(""); setMissing([]);
    try {
      const res = await request();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMissing(body.completeness?.missing || []);
        throw new Error(body.error || "Request failed");
      }
      setComment("");
      await load();
      onLifecycleChange?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const submit = () => run(() => fetch(`/api/documents/${encodeURIComponent(documentId)}/workflow`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ definitionId, ...(selected?.kind === "decommission" ? { targetLifecycle } : {}) }),
  }));
  const withdraw = () => {
    if (!window.confirm("Withdraw this document from review? It goes back to draft.")) return;
    run(() => fetch(`/api/documents/${encodeURIComponent(documentId)}/workflow`, { method: "DELETE" }));
  };
  const decide = (action) => run(() => fetch(`/api/org/${encodeURIComponent(orgId)}/workflow-tasks/${encodeURIComponent(data.viewer.myTaskId)}/decision`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, comment: comment.trim() || undefined }),
  }));

  if (!data && !error) return <p className="p-4 text-sm text-gray-500">Loading workflow…</p>;
  if (data?.forbidden) return <p className="p-4 text-sm text-gray-500">Only the submitter, reviewers and admins can see this document's approval workflow.</p>;

  const lifecycle = data?.lifecycle;
  // Publish workflows apply to drafts; decommission workflows to published or archived documents.
  const usable = (data?.definitions || []).filter((d) =>
    d.kind === "publish" ? lifecycle === "draft" : ["published", "archived"].includes(lifecycle));
  const selected = usable.find((d) => d.id === definitionId);

  return <section className="space-y-4 p-4" aria-label="Approval workflow">
    <h3 className="font-semibold">Approval workflow</h3>
    {lifecycle && <p className="text-sm">Status: <strong className="capitalize">{lifecycle.replace("_", " ")}</strong></p>}
    {error && <div role="alert" className="text-sm text-red-600">
      {error}
      {missing.length > 0 && <ul className="mt-1 list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul>}
    </div>}

    {data?.viewer?.myTaskId && <div className="space-y-2 rounded border border-blue-300 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <p className="text-sm font-medium">Your review is requested.</p>
      <label className="block text-sm">Comment (required to reject or request changes)
        <textarea className="mt-1 w-full rounded border bg-transparent p-2 text-sm" rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => decide("approve")} className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Approve</button>
        <button type="button" disabled={busy || !comment.trim()} onClick={() => decide("request_changes")} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">Request changes</button>
        <button type="button" disabled={busy || !comment.trim()} onClick={() => decide("reject")} className="rounded border border-red-400 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">Reject</button>
      </div>
    </div>}

    {data?.viewer?.canSubmit && usable.length > 0 && <div className="space-y-2 rounded border p-3">
      <label className="block text-sm">Submit for approval
        <select className="mt-1 w-full rounded border bg-transparent p-2 text-sm" value={definitionId} onChange={(e) => setDefinitionId(e.target.value)}>
          <option value="">Choose a workflow</option>
          {usable.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.kind}, {d.stages} stage{d.stages === 1 ? "" : "s"})</option>)}
        </select>
      </label>
      {selected?.kind === "decommission" && <label className="block text-sm">Requested action
        <select className="mt-1 w-full rounded border bg-transparent p-2 text-sm" value={targetLifecycle} onChange={(e) => setTargetLifecycle(e.target.value)}>
          {lifecycle === "published" && <option value="archived">Archive</option>}
          <option value="retired">Retire</option>
        </select>
      </label>}
      <button type="button" disabled={busy || !definitionId} onClick={submit} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">Submit</button>
    </div>}

    {data?.viewer?.canWithdraw && <button type="button" disabled={busy} onClick={withdraw} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">Withdraw from review</button>}

    <div className="space-y-3">
      {!data?.items?.length && <p className="text-sm text-gray-500">This document hasn't been through an approval workflow.</p>}
      {data?.items?.map((w) => <article key={w.id} className="rounded border p-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <strong>{w.definition?.name}{w.targetLifecycle ? ` · ${w.targetLifecycle === "archived" ? "archive" : "retire"}` : ""}</strong>
          <span className="rounded-full border px-2 py-0.5 text-xs">{STATUS_LABEL[w.status] || w.status}</span>
        </div>
        <p className="text-gray-500">Submitted by {person(w.submittedBy)} · {when(w.createdAt)}</p>
        <ol className="mt-2 space-y-1">
          {w.tasks.map((t) => {
            const d = w.decisions.find((x) => x.taskId === t.id);
            return <li key={t.id}>
              <span className="font-medium">Stage {t.stage?.position}: {t.stage?.name}</span> · {person(t.assignee)} · {d ? `${ACTION_LABEL[d.action] || d.action} ${when(d.createdAt)}` : (STATUS_LABEL[t.status] || t.status)}
              {d?.comment && <blockquote className="ml-4 border-l-2 pl-2 text-gray-600 dark:text-gray-300">{d.comment}</blockquote>}
            </li>;
          })}
        </ol>
      </article>)}
    </div>
  </section>;
}
