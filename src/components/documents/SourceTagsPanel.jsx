"use client";

// A-23 (PRS E16.5): the managed-metadata values this file has in SharePoint
// (e.g. Semaphore tags), shown raw and grouped by column. Workstream C maps
// them to KMS taxonomy terms; until then this is what was kept.

import { Tags } from "lucide-react";

export default function SourceTagsPanel({ tags }) {
  if (!tags?.length) return null;
  const byField = new Map();
  for (const t of tags) {
    const key = t.fieldDisplayName || t.fieldName;
    if (!byField.has(key)) byField.set(key, []);
    byField.get(key).push(t);
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-900">
      <p className="mb-2 inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-200">
        <Tags className="h-3.5 w-3.5" /> SharePoint tags
      </p>
      <dl className="space-y-1.5">
        {[...byField.entries()].map(([field, values]) => (
          <div key={field} className="flex flex-wrap items-baseline gap-1.5">
            <dt className="text-gray-500 dark:text-gray-400">{field}:</dt>
            {values.map((t) => (
              <dd key={t.termGuid} title={`Term ID ${t.termGuid}`} className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-teal-800 dark:border-teal-800 dark:bg-teal-900/20 dark:text-teal-200">
                {t.label}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </div>
  );
}
