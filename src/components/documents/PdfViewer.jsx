'use client';
import { useEffect, useRef, useState } from 'react';

export default function PdfViewer({ fileUrl, onPageChange, onTotalPages }) {
  const containerRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const pdfRef = useRef(null);
  const canvasRefs = useRef({});
  const onPageChangeRef = useRef(onPageChange);

  useEffect(() => { onPageChangeRef.current = onPageChange; }, [onPageChange]);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.js';
        const pdf = await pdfjs.getDocument(fileUrl).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        onTotalPages?.(pdf.numPages);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (numPages === 0 || !pdfRef.current) return;
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) break;
        try {
          const page = await pdfRef.current.getPage(i);
          const canvas = canvasRefs.current[i];
          if (!canvas) continue;
          const unscaled = page.getViewport({ scale: 1 });
          const containerWidth = (containerRef.current?.clientWidth ?? 640) - 32;
          const scale = containerWidth / unscaled.width;
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        } catch (err) {
          if (!cancelled) console.error(`PDF page ${i} render error:`, err);
        }
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [numPages]);

  useEffect(() => {
    if (numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0, visiblePage = null;
        for (const entry of entries) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            visiblePage = parseInt(entry.target.dataset.page, 10);
          }
        }
        if (visiblePage) onPageChangeRef.current?.(visiblePage);
      },
      { root: containerRef.current, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] }
    );
    Object.values(canvasRefs.current).forEach(c => c && observer.observe(c));
    return () => observer.disconnect();
  }, [numPages]);

  if (loadError) return (
    <div className="w-full h-full flex items-center justify-center">
      <p className="text-red-500 text-sm px-4 text-center">Failed to load PDF: {loadError}</p>
    </div>
  );

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto bg-gray-100 dark:bg-gray-800">
      {isLoading && numPages === 0 && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading PDF...</p>
          </div>
        </div>
      )}
      {Array.from({ length: numPages }, (_, i) => (
        <div key={i + 1} className="flex justify-center py-2 px-4">
          <canvas
            ref={el => { canvasRefs.current[i + 1] = el; }}
            data-page={i + 1}
            className="shadow-md max-w-full"
          />
        </div>
      ))}
    </div>
  );
}
