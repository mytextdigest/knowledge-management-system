"use client";

// E11.1: a PowerPoint document's slides as KMS read them (title, text,
// speaker notes), one card per slide, from the chunks the worker stored
// (metadata.kind === "slide", worker/extractPptx.js). `activeSlide` (from
// /document?id=…&slide=7, the link in a "slide 7" citation) scrolls to that
// slide and highlights it. Rendered inside FileViewerFrame, which scrolls.

import { useEffect, useMemo, useRef } from "react";
import { EyeOff, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import { slidesFromChunks } from "@/lib/slideCitations";

export default function SlideDeckViewer({ chunks, activeSlide = null }) {
  const { slides, total } = useMemo(() => slidesFromChunks(chunks), [chunks]);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!activeSlide || !slides.length) return;
    const el = containerRef.current?.querySelector(`[data-slide="${activeSlide}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [activeSlide, slides.length]);

  if (!slides.length) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        The slides are still being processed. You can download the original file in the meantime.
      </div>
    );
  }

  const bySlide = new Map(slides.map((s) => [s.slide, s]));
  const rows = Array.from({ length: total }, (_, i) => bySlide.get(i + 1) || { slide: i + 1, empty: true });

  return (
    <div ref={containerRef} className="w-full min-h-full bg-gray-50 p-4 space-y-3 dark:bg-gray-950">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {total} slide{total === 1 ? "" : "s"} · the text KMS read from each slide, with speaker notes
      </p>
      {rows.map((s) =>
        s.empty ? (
          <div key={s.slide} data-slide={s.slide} className="rounded-md border border-dashed border-gray-200 px-3 py-1.5 text-xs text-gray-400 dark:border-gray-800">
            Slide {s.slide}: no text
          </div>
        ) : (
          <section
            key={s.slide}
            data-slide={s.slide}
            className={cn(
              "scroll-mt-4 rounded-lg border bg-white p-4 shadow-sm dark:bg-gray-900",
              s.slide === activeSlide ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900" : "border-gray-200 dark:border-gray-700"
            )}
          >
            <header className="mb-2 flex items-center gap-2">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">Slide {s.slide}</span>
              {s.title ? <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.title}</h3> : null}
              {s.hidden ? (
                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-gray-500"><EyeOff className="h-3 w-3" /> Hidden slide</span>
              ) : null}
            </header>
            {s.body ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">{s.body}</p> : null}
            {s.notes ? (
              <div className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="mb-1 inline-flex items-center gap-1 font-semibold"><StickyNote className="h-3 w-3" /> Speaker notes</p>
                <p className="whitespace-pre-wrap">{s.notes}</p>
              </div>
            ) : null}
          </section>
        )
      )}
    </div>
  );
}
