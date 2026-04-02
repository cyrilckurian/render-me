import { useRef, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ImageCompareSliderProps {
  originalUrl: string;
  renderedUrl: string;
  /** 0 = full rendered, 100 = full original */
  initialPosition?: number;
  /** Called when the rendered image finishes loading */
  onRenderedLoad?: () => void;
}

export function ImageCompareSlider({ originalUrl, renderedUrl, initialPosition = 0, onRenderedLoad }: ImageCompareSliderProps) {
  const [position, setPosition] = useState(initialPosition);
  const [dragging, setDragging] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  const animateTo = useCallback((target: number) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const startTime = performance.now();
    const startPos = position;
    const duration = 420;
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const step = (now: number) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      setPosition(startPos + (target - startPos) * ease(elapsed));
      if (elapsed < 1) animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, [position]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    onRenderedLoad?.();
  };

  const getPositionFromEvent = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => { e.preventDefault(); setDragging(true); getPositionFromEvent(e.clientX); };
  const onTouchStart = (e: React.TouchEvent) => { setDragging(true); getPositionFromEvent(e.touches[0].clientX); };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => getPositionFromEvent(e.clientX);
    const onTouchMove = (e: TouchEvent) => getPositionFromEvent(e.touches[0].clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, getPositionFromEvent]);

  const aspectRatio = dimensions ? `${dimensions.w} / ${dimensions.h}` : undefined;

  return (
    <div className="space-y-3">
      {/* Slider image container */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-border shadow-lg bg-muted select-none cursor-col-resize w-full"
        style={aspectRatio ? { aspectRatio } : { minHeight: 240 }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        {/* Rendered (base layer — full width) */}
        <img
          src={renderedUrl}
          alt="Rendered floor plan"
          className="absolute inset-0 w-full h-full object-contain"
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* Original (clipped on top) */}
        <div
          className="absolute inset-0 overflow-hidden bg-white"
          style={{ width: `${position}%` }}
        >
          <img
            src={originalUrl}
            alt="Original floor plan"
            className="absolute inset-0 w-full h-full object-contain"
            style={{ width: `${10000 / Math.max(position, 0.01)}%`, maxWidth: "none" }}
            draggable={false}
          />
        </div>

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-background shadow-[0_0_0_1px_hsl(var(--border))] z-10 pointer-events-none"
          style={{ left: `calc(${position}% - 1px)` }}
        />

        {/* Handle */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-9 h-9 rounded-full bg-background border-2 border-border shadow-lg flex items-center justify-center pointer-events-none transition-shadow",
            dragging && "shadow-xl ring-2 ring-primary/30"
          )}
          style={{ left: `${position}%` }}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-muted-foreground" fill="none">
            <path d="M5 3L2 8l3 5M11 3l3 5-3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Labels */}
        <div className="absolute top-2.5 left-3 z-10 pointer-events-none">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-background/80 text-foreground backdrop-blur-sm transition-opacity", position < 15 && "opacity-0")}>
            Original
          </span>
        </div>
        <div className="absolute top-2.5 right-3 z-10 pointer-events-none">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-background/80 text-foreground backdrop-blur-sm transition-opacity", position > 85 && "opacity-0")}>
            Rendered
          </span>
        </div>
      </div>

      {/* Toggle buttons */}
      <div className="flex items-center justify-center gap-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => animateTo(100)}
          className={cn(
            "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            position >= 99
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          Original
        </motion.button>
        <div className="w-px h-4 bg-border" />
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => animateTo(0)}
          className={cn(
            "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
            position <= 1
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          Rendered
        </motion.button>
      </div>
    </div>
  );
}
