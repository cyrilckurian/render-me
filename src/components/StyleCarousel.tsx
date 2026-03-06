import { useRef } from "react";
import { ChevronLeft, ChevronRight, Hourglass, Wand2 } from "lucide-react";
import { motion } from "framer-motion";
import type { RenderingStyle } from "@/data/renderingStyles";

export interface PendingStyle {
  id: string;
  title: string;
  sampleUrls?: string[];
}

interface StyleCarouselProps {
  styles: RenderingStyle[];
  selectedId: string | null;
  pendingStyles?: PendingStyle[];
  onSelect: (style: RenderingStyle) => void;
  onDeselect: () => void;
  onClone: () => void;
}

export function StyleCarousel({ styles, selectedId, pendingStyles = [], onSelect, onDeselect, onClone }: StyleCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
    }
  };

  return (
    <div className="relative group">
      {/* Scroll buttons */}
      <button
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-card border border-border shadow-md opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2"
      >
        <ChevronLeft className="w-4 h-4 text-foreground" />
      </button>
      <button
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-card border border-border shadow-md opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2"
      >
        <ChevronRight className="w-4 h-4 text-foreground" />
      </button>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-1 pb-4 sm:pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {styles.map((style) => (
          <motion.button
            key={style.id}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => selectedId === style.id ? onDeselect() : onSelect(style)}
          className={`
              flex-shrink-0 w-[calc((100vw-2.5rem)/2.5)] sm:w-28 rounded-lg overflow-hidden border-2 transition-colors text-left
              ${selectedId === style.id
                ? "border-primary shadow-md"
                : "border-transparent hover:border-border"
              }
            `}
          >
            <div className="aspect-square overflow-hidden bg-muted relative">
              <img
                src={style.image}
                alt={style.name}
                className="w-full h-full object-cover"
              />
              {selectedId === style.id && (
                <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-foreground flex items-center justify-center shadow-lg">
                  <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                </div>
              )}
            </div>
            <div className="px-2 py-1.5 bg-card">
              <p className="font-display font-semibold text-xs text-foreground truncate">
                {style.name}
              </p>
            </div>
          </motion.button>
        ))}

        {/* Pending custom styles */}
        {pendingStyles.map((ps) => (
          <motion.div
            key={ps.id}
            whileHover={{ y: -3 }}
            className="flex-shrink-0 w-[calc((100vw-2.5rem)/2.5)] sm:w-28 rounded-lg overflow-hidden border-2 border-border opacity-80 cursor-default"
          >
            <div className="aspect-square relative overflow-hidden bg-muted">
              {ps.sampleUrls && ps.sampleUrls[0] ? (
                <img
                  src={ps.sampleUrls[0]}
                  alt={ps.title}
                  className="w-full h-full object-cover blur-sm scale-105"
                />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
              {/* Overlay + icon */}
              <div className="absolute inset-0 bg-foreground/30 flex flex-col items-center justify-center gap-1.5">
                <Hourglass className="w-6 h-6 text-background drop-shadow" />
                <span className="text-[9px] text-background font-semibold tracking-wide uppercase drop-shadow">Coming soon</span>
              </div>
            </div>
            <div className="px-2 py-1.5 bg-card">
              <p className="font-display font-semibold text-xs text-foreground truncate">
                {ps.title}
              </p>
            </div>
          </motion.div>
        ))}

        {/* Clone a Style */}
        <motion.button
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={onClone}
          className="flex-shrink-0 w-[calc((100vw-2.5rem)/2.5)] sm:w-28 self-stretch rounded-lg overflow-hidden border-2 border-dashed border-border hover:border-primary/50 transition-colors"
        >
          <div className="h-full flex flex-col items-center justify-center gap-2 bg-secondary/50">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
            <p className="font-display font-semibold text-xs text-foreground text-center">
              Clone Style
            </p>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
