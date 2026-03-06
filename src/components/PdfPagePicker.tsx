import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface PdfPagePickerProps {
  file: File;
  onSelect: (pageDataUrl: string, pageNumber: number) => void;
  onCancel: () => void;
}

export function PdfPagePicker({ file, onSelect, onCancel }: PdfPagePickerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const thumbs: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D, viewport, canvas }).promise;
        thumbs.push(canvas.toDataURL("image/jpeg", 0.8));
        if (cancelled) return;
      }
      setPages(thumbs);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [file]);

  const handleConfirm = async () => {
    if (selected === null) return;
    setConfirming(true);
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(selected + 1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d") as CanvasRenderingContext2D, viewport, canvas }).promise;
    onSelect(canvas.toDataURL("image/png"), selected + 1);
  };


  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <p className="text-sm font-semibold text-foreground">Select a page to render</p>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading pages…</span>
        </div>
      ) : (
        <div className="relative group">
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-card border border-border shadow-md opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-foreground" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-card border border-border shadow-md opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2"
          >
            <ChevronRight className="w-3.5 h-3.5 text-foreground" />
          </button>

          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto py-2 px-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {pages.map((thumb, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`relative flex-shrink-0 w-28 rounded-lg overflow-hidden border-2 transition-all ${selected === i
                    ? "border-primary shadow-md scale-[1.02]"
                    : "border-border hover:border-muted-foreground/40"
                  }`}
              >
                <img src={thumb} alt={`Page ${i + 1}`} className="w-full object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-background/80 text-center text-[10px] font-medium text-foreground py-0.5">
                  {i + 1}
                </div>
                {selected === i && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-foreground flex items-center justify-center shadow">
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="white" strokeWidth="2.2">
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected === null || confirming}
          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {confirming ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading page…
            </>
          ) : (
            <>Use page {selected !== null ? selected + 1 : "—"}</>
          )}
        </button>
      </div>
    </motion.div>
  );
}
