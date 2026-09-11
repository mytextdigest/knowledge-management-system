'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import PdfViewer from './PdfViewer';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export default function DocumentFullscreenModal({ open, onClose, doc, ext, docxHtml }) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2))), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-' || e.key === '_') zoomOut();
      else if (e.key === '0') resetZoom();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, zoomIn, zoomOut, resetZoom]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  if (!open || !doc) return null;

  const supportsZoom = ['pdf', 'txt', 'docx'].includes(ext);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-gray-950">
          {/* Toolbar */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-gray-900 border-b border-gray-800 shadow-lg"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Maximize2 className="h-4 w-4 text-gray-400 shrink-0" />
              <p className="text-sm font-medium text-gray-100 truncate">{doc.filename}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {supportsZoom && (
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={zoom <= MIN_ZOOM}
                    className="p-1.5 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent transition"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="px-2 text-xs font-medium text-gray-300 hover:text-white tabular-nums min-w-[3.5rem] text-center"
                    aria-label="Reset zoom to 100%"
                    title="Reset zoom"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={zoom >= MAX_ZOOM}
                    className="p-1.5 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent transition"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold shadow-sm transition"
                aria-label="Close fullscreen preview"
              >
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            </div>
          </motion.div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-auto bg-gray-100 dark:bg-gray-900">
            {ext === 'pdf' && (
              <PdfViewer fileUrl={doc.fileUrl} zoom={zoom} />
            )}

            {ext === 'txt' && (
              <div className="max-w-5xl mx-auto p-8">
                <pre
                  className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 font-mono leading-relaxed bg-white dark:bg-gray-800 rounded-lg p-6 shadow"
                  style={{ fontSize: `${14 * zoom}px` }}
                >
                  {doc.content}
                </pre>
              </div>
            )}

            {ext === 'docx' && (
              <div className="max-w-4xl mx-auto p-8">
                <div
                  className="prose prose-gray dark:prose-invert max-w-none bg-white dark:bg-gray-800 rounded-lg p-8 shadow"
                  style={{ zoom }}
                  dangerouslySetInnerHTML={{ __html: docxHtml || '<p>Loading...</p>' }}
                />
              </div>
            )}

            {!supportsZoom && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400">Unsupported file type: {ext}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
