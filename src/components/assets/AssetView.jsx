"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Pencil } from "lucide-react";

// EKP E14 (E-16): an asset written from a template, shown section by section
// (the template version it was written from gives the order and headings).
export default function AssetView({ doc, orgId }) {
  const version = doc.templateVersion;
  const values = doc.assetData?.sections || {};
  const sections = (version?.sections || []).filter((s) => values[s.key]);
  const canEdit = doc.permissions?.canEditAsset && orgId;

  return (
    <article className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-700">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {version?.template?.name || "Template"} · version {version?.version ?? "?"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{doc.filename}</h1>
          {doc.lifecycle === "draft" ? (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Draft. Submit it for approval in the Workflow tab; a reviewer publishes it.
            </p>
          ) : doc.lifecycle === "in_review" ? (
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">In review.</p>
          ) : null}
        </div>
        {canEdit ? (
          <Link
            href={`/org/${orgId}/assets/${doc.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Pencil className="h-4 w-4" aria-hidden /> Edit draft
          </Link>
        ) : null}
      </div>

      {sections.length ? (
        sections.map((section) => (
          <section key={section.key} className="mb-8">
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{section.title}</h2>
            <div className="prose prose-gray max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{values[section.key]}</ReactMarkdown>
            </div>
          </section>
        ))
      ) : (
        <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900 dark:text-gray-100">{doc.content || "This asset is empty."}</pre>
      )}
    </article>
  );
}
