"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, FileText, BookOpen, Clock, Sparkles } from "lucide-react";
import { HUMAN_SETTABLE_STATUSES, STATUS_LABELS, CERTAINTY_LABELS } from "@/lib/decisionStatus";

// Decision Extraction v2, FR-6: gated on canReviewDecision now (dept_admin
// who manages this decision's department, or super_admin) — `canReview`
// here only toggles whether the controls are shown, the API is the actual
// authority (see Decision 5: this supersedes Rank 14's document-owner path
// for every status transition, not just confirm/reject).
const MAX_NOTE_LENGTH = 2000;

function EvidencePanel({ decision }) {
  if (!decision.certainty) return null;
  return (
    <div className="rounded-lg border border-primary-100 bg-primary-50/50 p-3 dark:border-primary-900 dark:bg-primary-950/20">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
        <Sparkles className="h-3.5 w-3.5" /> Why KMS thinks this
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full border border-primary-200 px-2 py-0.5 font-medium text-primary-700 dark:border-primary-800 dark:text-primary-300">
          {CERTAINTY_LABELS[decision.certainty] || decision.certainty}
        </span>
        <span className="rounded-full border border-gray-200 px-2 py-0.5 text-gray-600 dark:border-gray-700 dark:text-gray-300">
          {decision.explicitness === "implicit" ? "Implicit" : "Explicit"}
        </span>
        {typeof decision.score === "number" && (
          <span className="text-gray-400">score {decision.score}</span>
        )}
      </div>
      {decision.signals?.length > 0 && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Signals: {decision.signals.join(", ")}
        </p>
      )}
      {decision.subject && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Subject: {decision.subject}</p>
      )}
      {decision.actors?.length > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Involved: {decision.actors.join(", ")}</p>
      )}
      {decision.alternatives?.length > 0 && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Alternatives considered: {decision.alternatives.join(", ")}</p>
      )}
      {decision.evidence?.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {decision.evidence.map((e) => (
            <div key={e.id} className="rounded-md bg-white p-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              <span className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {e.type.replace(/_/g, " ")}
              </span>
              &ldquo;{e.quote}&rdquo;
            </div>
          ))}
        </div>
      )}
      {decision.aiStatement && decision.aiStatement !== decision.statement && (
        <p className="mt-2 text-xs italic text-gray-400">Originally extracted as: &ldquo;{decision.aiStatement}&rdquo;</p>
      )}
    </div>
  );
}

export default function DecisionDetailModal({ orgId, decisionId, onClose, onChanged }) {
  const router = useRouter();
  const [decision, setDecision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Draft status/note edited locally, only sent to the server on "Save" — see
  // the requirements doc's Q2 resolution: an outcome change is a deliberate,
  // human action, not something that should fire on every button click.
  const [draftStatus, setDraftStatus] = useState(null);
  const [draftNote, setDraftNote] = useState("");
  const [draftStatement, setDraftStatement] = useState("");
  const [draftRationale, setDraftRationale] = useState("");
  const [draftDecidedAt, setDraftDecidedAt] = useState("");

  useEffect(() => {
    if (!orgId || !decisionId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/org/${orgId}/decisions/${decisionId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to load decision");
        if (!cancelled) {
          setDecision(data);
          setDraftStatus(data.status);
          setDraftNote(data.statusNote || "");
          setDraftStatement(data.statement || "");
          setDraftRationale(data.rationale || "");
          setDraftDecidedAt(data.decidedAt ? new Date(data.decidedAt).toISOString().slice(0, 10) : "");
        }
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Unable to load decision"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, decisionId]);

  const isPending = decision?.status === "pending";
  const isDirty =
    decision &&
    (draftStatus !== decision.status ||
      draftNote !== (decision.statusNote || "") ||
      draftStatement !== (decision.statement || "") ||
      draftRationale !== (decision.rationale || "") ||
      draftDecidedAt !== (decision.decidedAt ? new Date(decision.decidedAt).toISOString().slice(0, 10) : ""));

  async function save(overrideStatus) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/org/${orgId}/decisions/${decisionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: overrideStatus || draftStatus,
          statusNote: draftNote.trim() || null,
          statement: draftStatement.trim(),
          rationale: draftRationale.trim() || null,
          decidedAt: draftDecidedAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to save");
      setDecision(data);
      setDraftStatus(data.status);
      setDraftNote(data.statusNote || "");
      setDraftStatement(data.statement || "");
      setDraftRationale(data.rationale || "");
      setDraftDecidedAt(data.decidedAt ? new Date(data.decidedAt).toISOString().slice(0, 10) : "");
      setSaved(true);
      onChanged?.();
    } catch (e) {
      setError(e.message || "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Decision</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : decision ? (
          <div className="space-y-4">
            <EvidencePanel decision={decision} />

            <div>
              {decision.canReview && (isPending || decision.status === "rejected") ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Statement</label>
                  <textarea
                    value={draftStatement}
                    onChange={(e) => setDraftStatement(e.target.value)}
                    disabled={saving}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
                  />
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Rationale</label>
                  <textarea
                    value={draftRationale}
                    onChange={(e) => setDraftRationale(e.target.value)}
                    disabled={saving}
                    rows={2}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
                  />
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">Decided on</label>
                  <input
                    type="date"
                    value={draftDecidedAt}
                    onChange={(e) => setDraftDecidedAt(e.target.value)}
                    disabled={saving}
                    className="rounded-lg border border-gray-300 bg-white p-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
                  />
                </div>
              ) : (
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{decision.statement}</p>
                  {decision.rationale && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{decision.rationale}</p>}
                  {decision.decidedAt && (
                    <p className="mt-1 text-xs text-gray-400">Decided {new Date(decision.decidedAt).toLocaleDateString()}</p>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {isPending ? "Review" : "Outcome"}
              </p>
              {decision.canReview ? (
                isPending ? (
                  <>
                    <textarea
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                      disabled={saving}
                      rows={2}
                      placeholder="Optional note (shown if you reject this)"
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving || !draftStatement.trim()}
                        onClick={() => save("active")}
                        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Confirm"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => save("rejected")}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
                      >
                        Reject
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {HUMAN_SETTABLE_STATUSES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={saving}
                          onClick={() => setDraftStatus(s)}
                          className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 ${
                            draftStatus === s
                              ? "bg-primary-600 text-white"
                              : "border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          }`}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                      disabled={saving}
                      rows={3}
                      placeholder="Optional note — why this outcome? (shown wherever this decision is cited, including chat)"
                      className="mt-2 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving || !isDirty}
                        onClick={() => save()}
                        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      {!saving && saved && !isDirty && <span className="text-xs text-green-600">Saved</span>}
                    </div>
                  </>
                )
              ) : (
                <>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{STATUS_LABELS[decision.status] || decision.status}</p>
                  {decision.statusNote && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{decision.statusNote}</p>}
                </>
              )}
              {decision.reviewedBy && (
                <p className="mt-2 text-xs text-gray-400">
                  Reviewed by {decision.reviewedBy.name || decision.reviewedBy.email}
                  {decision.reviewedAt ? ` on ${new Date(decision.reviewedAt).toLocaleDateString()}` : ""}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => router.push(`/document?id=${decision.document.id}`)}
              className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary-500" />
              <span className="min-w-0 truncate">{decision.document.filename}</span>
              {(decision.document.projectName || decision.document.departmentName) && (
                <span className="ml-auto shrink-0 text-xs text-gray-400">
                  {decision.document.projectName || decision.document.departmentName}
                </span>
              )}
            </button>

            {decision.lessons.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <BookOpen className="h-3.5 w-3.5" /> What we learned
                </p>
                <div className="mt-1.5 space-y-2">
                  {decision.lessons.map((lesson) => (
                    <div key={lesson.id} className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                      {lesson.topic && <p className="font-medium text-amber-900 dark:text-amber-200">{lesson.topic}</p>}
                      <p className="mt-0.5 text-amber-800 dark:text-amber-300">{lesson.whatHappened}</p>
                      {lesson.recommendation && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Recommendation: {lesson.recommendation}</p>
                      )}
                      {lesson.status !== "published" && (
                        <p className="mt-1 text-xs italic text-gray-400">Draft — not yet published</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {decision.timelineEvents.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <Clock className="h-3.5 w-3.5" /> Timeline context
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {decision.timelineEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span className="min-w-0 truncate">{event.description}</span>
                      <span className="shrink-0 text-xs text-gray-400">{new Date(event.occurredAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
