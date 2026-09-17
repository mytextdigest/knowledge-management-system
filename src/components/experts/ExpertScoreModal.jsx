"use client";

import { X, Sparkles } from "lucide-react";
import { explainExpertiseScore } from "@/lib/expertiseScoringPolicy.mjs";

const SOURCE_LABELS = {
  inferred: "Algorithmically inferred - not yet reviewed by anyone",
  self_confirmed: "Confirmed by this person",
  admin_confirmed: "Confirmed by a department admin",
  dismissed: "Dismissed",
};

function formatSignalAmount(item) {
  if (item.isContinuous) {
    const minutes = item.count;
    if (minutes < 1) return `${Math.round(minutes * 60)} seconds of focused reading`;
    return `${minutes % 1 === 0 ? minutes : minutes.toFixed(1)} minutes of focused reading`;
  }
  const plural = item.count === 1 ? "" : "s";
  return `${item.count} ${item.label.toLowerCase()}${plural}`;
}

function formatAge(lastSignalAt) {
  if (!lastSignalAt) return "no recorded activity";
  const days = Math.max(0, Math.floor((Date.now() - new Date(lastSignalAt).getTime()) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 90) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `about ${months} month${months === 1 ? "" : "s"} ago`;
}

export default function ExpertScoreModal({ expert, onClose }) {
  if (!expert) return null;
  const explanation = explainExpertiseScore(expert.signals, Date.now());
  const decayPct = Math.round(explanation.decayWeight * 100);
  const hasHumanOverride = expert.source === "self_confirmed" || expert.source === "admin_confirmed";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {expert.name || expert.email}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {expert.topic}
              {expert.projectName ? ` · ${expert.projectName} project` : expert.departmentName ? ` · ${expert.departmentName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900 dark:bg-primary-950/20">
          <Sparkles className="h-5 w-5 shrink-0 text-primary-600" />
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{Number(expert.score || 0).toFixed(2)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{SOURCE_LABELS[expert.source] || expert.source}</p>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Contribution summary</h3>
          {explanation.breakdown.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {hasHumanOverride
                ? "This listing's score was set directly through human confirmation, not computed from recorded activity."
                : "No recorded activity signals yet."}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              {explanation.breakdown.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3">
                  <span>{formatSignalAmount(item)}</span>
                  <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">
                    +{item.contribution.toFixed(2)}{item.isCapped ? " (capped)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          <p>
            Recomputing from the activity above, right now: raw score{" "}
            <span className="font-medium text-gray-900 dark:text-gray-100">{explanation.rawScore.toFixed(2)}</span>, last active{" "}
            {formatAge(explanation.lastSignalAt)} ({decayPct}% strength remaining) ={" "}
            <span className="font-medium text-gray-900 dark:text-gray-100">{explanation.finalScore.toFixed(2)}</span>.
          </p>
          <p className="mt-1">
            {hasHumanOverride
              ? "The score shown above can be higher than this live recomputation - a confirmed listing never decreases, even as decay keeps reducing what its raw activity alone would compute to."
              : "This may differ slightly from the score shown above if it hasn't been recalculated since this moment - recency decay keeps applying between recalculation runs."}
          </p>
        </div>
      </div>
    </div>
  );
}
