"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

const FIELD_CLASS =
  "rounded-md border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

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
  hideDepartmentFilter = false,
  onChange,
}) {
  const [searchInput, setSearchInput] = useState(filters.search || "");

  // Keep the input in sync if filters are reset/changed from outside (e.g.
  // clearing all filters), without fighting the user's own typing.
  useEffect(() => {
    setSearchInput(filters.search || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== (filters.search || "")) {
        onChange({ ...filters, search: searchInput });
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-4">
      <div className="relative md:col-span-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by meaning, e.g. 'vendor contracts renewed last quarter'"
          title="Semantic search — finds documents by meaning, not just exact keyword matches"
          className={`${FIELD_CLASS} w-full pl-9`}
        />
      </div>

      {hideDepartmentFilter ? null : (
        <select
          className="rounded-md border border-gray-300 bg-white p-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
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
      )}

      <select
        className={FIELD_CLASS}
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
        className={FIELD_CLASS}
        value={filters.fileType || ""}
        onChange={(e) =>
          onChange({ ...filters, fileType: e.target.value })
        }
      >
        <option value="">All Types</option>
        <option value="pdf">PDF</option>
        <option value="spreadsheet">Spreadsheet</option>
        <option value="doc">Word</option>
        <option value="text">Text</option>
      </select>

      <select
        className={FIELD_CLASS}
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
        <option value="suggested_review">Needs lifecycle review</option>
      </select>

      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <label className="text-sm text-gray-500 dark:text-gray-400" htmlFor="repo-date-from">
          From
        </label>
        <input
          id="repo-date-from"
          type="date"
          className={`min-w-0 flex-1 ${FIELD_CLASS}`}
          value={filters.dateFrom || ""}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        />

        <label className="text-sm text-gray-500 dark:text-gray-400" htmlFor="repo-date-to">
          To
        </label>
        <input
          id="repo-date-to"
          type="date"
          className={`min-w-0 flex-1 ${FIELD_CLASS}`}
          value={filters.dateTo || ""}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        />
      </div>
    </div>
  );
}