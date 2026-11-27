"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, FilePlus2, Loader2 } from "lucide-react";

// EKP E14.2 (E-16): the repository's "New from template" menu.
export default function NewFromTemplateButton({ orgId, isSuperAdmin = false }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open || templates) return;
    fetch(`/api/org/${orgId}/templates`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Couldn't load templates");
        setTemplates(d.templates || []);
      })
      .catch((e) => setError(e.message));
  }, [open, templates, orgId]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <FilePlus2 className="h-4 w-4" aria-hidden /> New from template <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {error ? (
            <p className="px-3 py-2 text-sm text-red-600">{error}</p>
          ) : !templates ? (
            <p className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
          ) : templates.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">
              No templates yet.{" "}
              {isSuperAdmin ? <Link className="underline" href={`/org/${orgId}/templates`}>Set them up</Link> : "Ask a super admin to set them up."}
            </p>
          ) : (
            <>
              {templates.map((t) => (
                <Link
                  key={t.id}
                  role="menuitem"
                  href={`/org/${orgId}/assets/new?template=${encodeURIComponent(t.id)}`}
                  className="block px-3 py-2 text-sm text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  {t.name}
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{t.sections.map((s) => s.title).slice(0, 3).join(" · ")}{t.sections.length > 3 ? " …" : ""}</span>
                </Link>
              ))}
              {isSuperAdmin ? (
                <Link role="menuitem" href={`/org/${orgId}/templates`} className="block border-t border-gray-100 px-3 py-2 text-xs text-blue-700 hover:underline dark:border-gray-700 dark:text-blue-300">
                  Manage templates
                </Link>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
