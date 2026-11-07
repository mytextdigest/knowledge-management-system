"use client";
import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// One PDF page, laid out at its final size straight away (so scrolling and
// "jump to page" work before anything is drawn) and drawn only while `active`.
// Drawing happens off-screen and is then copied in, so on zoom the old bitmap
// stays visible (stretched) until the sharp one is ready instead of flashing
// blank. Leaving `active` frees the bitmap.
// KMS: an invisible text layer over the drawing keeps PDF text selectable and
// copyable, as the previous KMS viewer did (.pdfTextLayer in globals.css).
//
// size: unscaled { w, h } in CSS px at zoom 1 (PDF points × 96/72), already
// swapped for rotation. The page is shown at size × scale.
const PT_TO_PX = 96 / 72;
const PdfPage = forwardRef(function PdfPage(
  { pdf, pageNum, scale, rotation, size, active, className, children, ...rest },
  ref
) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [drawnKey, setDrawnKey] = useState(null);
  const key = `${scale.toFixed(4)}|${rotation}`;

  useEffect(() => {
    if (!pdf) return;
    if (!active) {
      if (drawnKey && canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
        if (textLayerRef.current) textLayerRef.current.innerHTML = "";
        setDrawnKey(null);
      }
      return;
    }
    if (drawnKey === key) return;

    let cancelled = false;
    let task = null;
    let textTask = null;
    // Re-draws after a zoom wait a beat, so a burst of zoom clicks only draws once.
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * PT_TO_PX * dpr, rotation: (page.rotate + rotation) % 360 });
        const off = document.createElement("canvas");
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        task = page.render({ canvasContext: off.getContext("2d"), viewport });
        await task.promise;
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext("2d").drawImage(off, 0, 0);
        setDrawnKey(key);

        // Selectable text, laid out at the page's CSS size (no device-pixel scaling).
        const layer = textLayerRef.current;
        if (layer) {
          const textContent = await page.getTextContent();
          if (cancelled) return;
          const pdfjs = await import("pdfjs-dist");
          layer.innerHTML = "";
          textTask = pdfjs.renderTextLayer({
            textContent,
            container: layer,
            viewport: page.getViewport({ scale: scale * PT_TO_PX, rotation: (page.rotate + rotation) % 360 }),
            textDivs: [],
          });
          await textTask?.promise;
        }
      } catch (err) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.error(`PDF page ${pageNum} render error:`, err);
        }
      }
    }, drawnKey ? 150 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
      textTask?.cancel?.();
    };
  }, [pdf, pageNum, key, active, drawnKey, scale, rotation]);

  const width = Math.floor(size.w * scale);
  const height = Math.floor(size.h * scale);

  return (
    <div
      ref={ref}
      data-page={pageNum}
      className={cn("relative shrink-0 bg-white", className)}
      style={{ width, height }}
      {...rest}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" style={{ width, height }} />
      <div ref={textLayerRef} className="pdfTextLayer absolute inset-0" />
      {children}
    </div>
  );
});

export default PdfPage;
