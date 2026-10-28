"use client";

import { ExternalLink } from "lucide-react";

// EKP A-13: link back to the original of a synced document (Document.externalUrl).
const SOURCE_LABELS = { sharepoint: "SharePoint", servicenow: "ServiceNow" };

export function sourceLabel(sourceProvider) {
  return SOURCE_LABELS[sourceProvider] || "source";
}

export default function OpenInSourceLink({ url, sourceProvider, className = "" }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open the original in ${sourceLabel(sourceProvider)}`}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:text-blue-400 ${className}`}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      Open in {sourceLabel(sourceProvider)}
    </a>
  );
}
