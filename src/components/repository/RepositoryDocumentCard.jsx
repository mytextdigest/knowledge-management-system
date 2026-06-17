const lifecycleStyles = {
  published: "bg-green-100 text-green-700 border-green-200",
  draft: "bg-amber-100 text-amber-700 border-amber-200",
  archived: "bg-gray-100 text-gray-700 border-gray-200",
  retired: "bg-red-100 text-red-700 border-red-200",
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
  const lifecycle = document?.lifecycle || "published";
  const badgeClass = lifecycleStyles[lifecycle] || lifecycleStyles.published;

  const uploadedAt = document?.createdAt
    ? new Date(document.createdAt).toLocaleDateString()
    : "Unknown date";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="text-3xl">
          {getFileIcon(document?.fileType, document?.filename)}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {document?.filename || document?.title || "Untitled document"}
          </h3>

          <p className="mt-1 text-xs text-gray-500">
            Uploaded {uploadedAt}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${badgeClass}`}>
          {lifecycle}
        </span>

        {document?.department?.name || document?.departmentName ? (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            {document.department?.name || document.departmentName}
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            Org-wide
          </span>
        )}

        {document?.category ? (
          <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
            {document.category}
          </span>
        ) : null}
      </div>

      {document?.status ? (
        <p className="mt-3 text-xs text-gray-500">
          Status: <span className="font-medium">{document.status}</span>
        </p>
      ) : null}
    </div>
  );
}