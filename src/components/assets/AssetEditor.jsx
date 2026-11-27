"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Loader2, Pencil } from "lucide-react";
import { CATEGORIES } from "@/components/governance/ScopePicker";

const FIELD = "mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm dark:border-gray-600 dark:bg-gray-900";

// EKP E14.2 (E-16): write a knowledge asset in a template's sections.
// `template` is the version being written to: { name, version, sections,
// requiredFields }. Without `assetId` it creates a draft
// (POST /api/org/[orgId]/assets); with it, it saves the draft again
// (PUT /api/documents/[id]/asset). Text is Markdown, with a preview.
export default function AssetEditor({ orgId, template, templateId, assetId = null, initial = null }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title || "");
  const [values, setValues] = useState(initial?.sections || {});
  const [departmentId, setDepartmentId] = useState(initial?.departmentId || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [departments, setDepartments] = useState([]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState(null);
  const required = useMemo(() => new Set(template.requiredFields || []), [template.requiredFields]);

  useEffect(() => {
    fetch(`/api/org/${orgId}/department`).then((r) => r.json()).then((d) => Array.isArray(d) && setDepartments(d)).catch(() => {});
  }, [orgId]);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setError(""); setErrorField(null);
    try {
      const body = { title, sections: values, departmentId: departmentId || null, category: category || null };
      const res = assetId
        ? await fetch(`/api/documents/${assetId}/asset`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch(`/api/org/${orgId}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, templateId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorField(data.field || null);
        throw new Error(data.error || "Couldn't save it.");
      }
      router.push(`/document?id=${encodeURIComponent(assetId || data.id)}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const invalid = (field) => (errorField === field ? "border-red-500 dark:border-red-500" : "");

  return (
    <form onSubmit={save} className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{template.name} · version {template.version}</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{assetId ? "Edit draft" : `New ${template.name}`}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            It&apos;s saved as a draft. Submit it for approval from the document&apos;s Workflow tab; once a reviewer publishes it, it&apos;s searchable by everyone who can see the repository.
          </p>
        </div>
        <button type="button" onClick={() => setPreview((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600">
          {preview ? <><Pencil className="h-4 w-4" /> Write</> : <><Eye className="h-4 w-4" /> Preview</>}
        </button>
      </header>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">{error}</p> : null}

      <label className="block text-sm font-medium">
        Title <span className="text-red-600">*</span>
        <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={`${FIELD} ${invalid("title")}`} placeholder="e.g. Resetting a tripped feeder relay" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Department {required.has("departmentId") ? <span className="text-red-600">*</span> : <span className="font-normal text-gray-500">(optional)</span>}
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required={required.has("departmentId")} className={`${FIELD} ${invalid("departmentId")}`}>
            <option value="">No department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Category {required.has("category") ? <span className="text-red-600">*</span> : <span className="font-normal text-gray-500">(optional)</span>}
          <select value={category} onChange={(e) => setCategory(e.target.value)} required={required.has("category")} className={`${FIELD} ${invalid("category")}`}>
            <option value="">No category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>

      {template.sections.map((section) => (
        <section key={section.key} className="space-y-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {section.title} {section.required ? <span className="text-red-600">*</span> : <span className="text-sm font-normal text-gray-500">(optional)</span>}
          </h2>
          {section.guidance ? <p className="text-sm text-gray-500 dark:text-gray-400">{section.guidance}</p> : null}
          {preview ? (
            <div className="prose prose-gray min-h-[3rem] max-w-none rounded border border-dashed border-gray-300 p-3 dark:prose-invert dark:border-gray-600">
              {values[section.key] ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{values[section.key]}</ReactMarkdown> : <p className="text-gray-400">Empty</p>}
            </div>
          ) : (
            <textarea
              aria-label={section.title}
              rows={section.required ? 6 : 4}
              maxLength={20000}
              value={values[section.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [section.key]: e.target.value }))}
              className={`${FIELD} font-mono ${invalid(section.key)}`}
              placeholder="Markdown: **bold**, - lists, 1. numbered steps, [links](https://…)"
            />
          )}
        </section>
      ))}

      <div className="flex gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button disabled={saving} className="inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {saving ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={() => router.back()} className="rounded border px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  );
}
