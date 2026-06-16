"use client";

const CATEGORIES = [
  "Policies",
  "SOPs",
  "Reports",
  "Meeting Knowledge",
  "Product Knowledge",
  "Historical Documents",
  "Other",
];

export default function RepositoryFilters({
  filters,
  departments = [],
  onChange,
}) {
  return (
    <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-4">
      <select
        className="rounded-md border p-2"
        value={filters.departmentId || ""}
        onChange={(e) =>
          onChange({ ...filters, departmentId: e.target.value })
        }
      >
        <option value="">All Departments</option>

        {departments.map((dept) => (
          <option key={dept.id} value={dept.id}>
            {dept.name}
          </option>
        ))}
      </select>

      <select
        className="rounded-md border p-2"
        value={filters.category || ""}
        onChange={(e) =>
          onChange({ ...filters, category: e.target.value })
        }
      >
        <option value="">All Categories</option>

        {CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>

      <select
        className="rounded-md border p-2"
        value={filters.fileType || ""}
        onChange={(e) =>
          onChange({ ...filters, fileType: e.target.value })
        }
      >
        <option value="">All Types</option>
        <option value="pdf">PDF</option>
        <option value="spreadsheet">Spreadsheet</option>
        <option value="text">Text</option>
      </select>

      <select
        className="rounded-md border p-2"
        value={filters.lifecycle || ""}
        onChange={(e) =>
          onChange({ ...filters, lifecycle: e.target.value })
        }
      >
        <option value="">All Lifecycle States</option>
        <option value="published">Published</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
        <option value="retired">Retired</option>
      </select>
    </div>
  );
}