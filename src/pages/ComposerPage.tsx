"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Home, Wand2, Download, Menu, X, ImageIcon,
  Loader2, ThumbsUp, ThumbsDown, Heart, Trash2,
  GripVertical, Upload, LayoutGrid, Pencil, RefreshCw, ChevronLeft, ChevronRight,
  RectangleHorizontal, RectangleVertical,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MobileWarningModal } from "@/components/MobileWarningModal";

const PENDING_COMPOSER_KEY = "pendingComposerGenerate";

// ─── Constants ────────────────────────────────────────────────────────────────
const REGION_COLORS = [
  { border: "#6366f1", bg: "rgba(99,102,241,0.14)", label: "#6366f1" },
  { border: "#f59e0b", bg: "rgba(245,158,11,0.14)", label: "#f59e0b" },
  { border: "#10b981", bg: "rgba(16,185,129,0.14)", label: "#10b981" },
  { border: "#ef4444", bg: "rgba(239,68,68,0.14)", label: "#ef4444" },
  { border: "#8b5cf6", bg: "rgba(139,92,246,0.14)", label: "#8b5cf6" },
  { border: "#ec4899", bg: "rgba(236,72,153,0.14)", label: "#ec4899" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReferenceImage {
  id: string;
  preview: string;
  base64: string;
}

interface ComposerRegion {
  id: string;
  x: number; y: number; w: number; h: number;
  label: string;
  comment: string;
  referenceImages: ReferenceImage[];
  colorIdx: number;
  saved: boolean;
}

interface ComposerVariation {
  id: string;
  imageBase64: string;
  storagePath?: string;
  feedback: "up" | "heart" | "down" | null;
}

interface GenerationSet {
  id: string;
  variations: ComposerVariation[];
}

type View = "canvas" | "output";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }
function regionLabel(idx: number) {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return idx < 26 ? L[idx] : L[Math.floor(idx / 26) - 1] + L[idx % 26];
}
async function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
async function compressImage(file: File, maxKB = 1500): Promise<File> {
  if (file.size <= maxKB * 1024) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      const maxDim = 1200;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height / width) * maxDim); width = maxDim; }
        else { width = Math.round((width / height) * maxDim); height = maxDim; }
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file);
      }, "image/jpeg", 0.82);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ─── RegionPopover Content ─────────────────────────────────────────────────────
interface PopoverContentProps {
  region: ComposerRegion;
  onUpdate: (patch: Partial<ComposerRegion>) => void;
  onDelete: () => void;
  onClose: () => void;
}
function PopoverContent({ region, onUpdate, onDelete, onClose }: PopoverContentProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];

  const addFiles = useCallback(async (files: File[]) => {
    const rem = 5 - region.referenceImages.length;
    if (rem <= 0) { toast.error("Max 5 reference images"); return; }
    const results = await Promise.all(
      files.slice(0, rem).map(async (f) => {
        const c = await compressImage(f, 1500);
        const base64 = await fileToBase64(c);
        return { id: uid(), preview: URL.createObjectURL(c), base64 };
      })
    );
    // Auto-save when images are added
    onUpdate({ referenceImages: [...region.referenceImages, ...results].slice(0, 5), saved: true });
  }, [region.referenceImages, onUpdate]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: color.border }}>
          Area {region.label}
        </span>
        <div className="flex gap-1">
          <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" title="Delete area">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <textarea
        autoFocus
        className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
        rows={3}
        placeholder="Describe what you want here — mood, materials, style…"
        value={region.comment}
        onChange={(e) => {
          const comment = e.target.value;
          // Auto-save whenever there's text
          onUpdate({ comment, saved: comment.trim().length > 0 || region.referenceImages.length > 0 });
        }}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Reference images (up to 5)</p>
          <p className="text-[10px] text-muted-foreground/60">or paste ⌘V</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {region.referenceImages.map((img) => (
            <div key={img.id} className="relative group w-12 h-12 rounded-md overflow-hidden border border-border flex-shrink-0">
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => {
                  const updated = region.referenceImages.filter(r => r.id !== img.id);
                  onUpdate({ referenceImages: updated, saved: updated.length > 0 || region.comment.trim().length > 0 });
                }}
                className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/70 text-white hidden group-hover:flex items-center justify-center"
              >
                <X className="w-2 h-2" />
              </button>
            </div>
          ))}
          {region.referenceImages.length < 5 && (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-12 h-12 rounded-md border-2 border-dashed border-border hover:border-primary/60 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
        />
      </div>
    </div>
  );
}

// ─── RegionPopover Wrapper ─────────────────────────────────────────────────────
interface RegionPopoverProps {
  region: ComposerRegion;
  canvasRect: DOMRect | null;
  isMobile?: boolean;
  onUpdate: (patch: Partial<ComposerRegion>) => void;
  onDelete: () => void;
  onClose: () => void;
}
function RegionPopover({ region, canvasRect, isMobile, onUpdate, onDelete, onClose }: RegionPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);

  // Close: delete if no content, otherwise just close
  const handleDismiss = () => {
    const hasContent = region.comment.trim() !== "" || region.referenceImages.length > 0;
    if (!hasContent) onDelete();
    else onClose();
  };

  // Paste handler
  useEffect(() => {
    const el = popRef.current;
    if (!el) return;
    const handle = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) { const f = item.getAsFile(); if (f) imgs.push(f); }
      }
      if (imgs.length) {
        e.preventDefault();
        const rem = 5 - region.referenceImages.length;
        if (rem <= 0) { toast.error("Max 5 reference images"); return; }
        const results = await Promise.all(imgs.slice(0, rem).map(async (f) => {
          const c = await compressImage(f, 1500);
          return { id: uid(), preview: URL.createObjectURL(c), base64: await fileToBase64(c) };
        }));
        onUpdate({ referenceImages: [...region.referenceImages, ...results].slice(0, 5), saved: true });
      }
    };
    el.addEventListener("paste", handle);
    return () => el.removeEventListener("paste", handle);
  }, [region.referenceImages, onUpdate]);

  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onMouseDown={(e) => { e.stopPropagation(); handleDismiss(); }}
          onTouchStart={(e) => { e.stopPropagation(); handleDismiss(); }}
        />
        <motion.div
          ref={popRef}
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <PopoverContent region={region} onUpdate={onUpdate} onDelete={onDelete} onClose={handleDismiss} />
          <div className="h-4" />
        </motion.div>
      </>
    );
  }

  // Desktop positioning
  let leftPx = 0, topPx = 0, showAbove = false;
  if (canvasRect) {
    const rRight = (region.x + region.w) / 100 * canvasRect.width;
    const rTop = region.y / 100 * canvasRect.height;
    const rLeft = region.x / 100 * canvasRect.width;
    const pw = 276, ph = 320;
    if (canvasRect.width - rRight >= pw + 12) {
      leftPx = rRight + 12; topPx = Math.min(rTop, canvasRect.height - ph);
    } else if (rLeft >= pw + 12) {
      leftPx = rLeft - pw - 12; topPx = Math.min(rTop, canvasRect.height - ph);
    } else {
      showAbove = true;
      leftPx = Math.min(Math.max(8, rLeft + (region.w / 100 * canvasRect.width) / 2 - pw / 2), canvasRect.width - pw - 8);
      topPx = Math.max(8, rTop - ph - 12);
    }
  }

  return (
    <motion.div
      ref={popRef}
      initial={{ opacity: 0, scale: 0.95, y: showAbove ? 4 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: showAbove ? 4 : -4 }}
      transition={{ duration: 0.14 }}
      className="absolute z-30 w-[276px] bg-card border border-border rounded-xl shadow-xl"
      style={{ left: leftPx, top: topPx, maxHeight: "calc(100% - 16px)", overflowY: "auto" }}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={-1}
    >
      <PopoverContent region={region} onUpdate={onUpdate} onDelete={onDelete} onClose={handleDismiss} />
    </motion.div>
  );
}

// ─── Mobile Region Box ─────────────────────────────────────────────────────────
interface MobileRegionBoxProps {
  region: ComposerRegion;
  isActive: boolean;
  canvasRef: React.RefObject<HTMLDivElement>;
  onActivate: () => void;
  onOpenPopover: () => void;
  onUpdateGeometry: (g: { x: number; y: number; w: number; h: number }) => void;
}
function MobileRegionBox({ region, isActive, canvasRef, onActivate, onOpenPopover, onUpdateGeometry }: MobileRegionBoxProps) {
  const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
  const dragRef = useRef<{ touchX: number; touchY: number; rx: number; ry: number } | null>(null);
  const resizeRef = useRef<{ corner: string; touchX: number; touchY: number; rx: number; ry: number; rw: number; rh: number } | null>(null);

  const onBodyTouchStart = (e: React.TouchEvent) => {
    if (isActive) {
      e.stopPropagation();
      dragRef.current = { touchX: e.touches[0].clientX, touchY: e.touches[0].clientY, rx: region.x, ry: region.y };
    }
  };
  const onBodyTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.touches[0].clientX - dragRef.current.touchX) / rect.width) * 100;
    const dy = ((e.touches[0].clientY - dragRef.current.touchY) / rect.height) * 100;
    onUpdateGeometry({ x: Math.min(100 - region.w, Math.max(0, dragRef.current.rx + dx)), y: Math.min(100 - region.h, Math.max(0, dragRef.current.ry + dy)), w: region.w, h: region.h });
  };
  const onBodyTouchEnd = () => { dragRef.current = null; };

  const onResizeTouchStart = (corner: string) => (e: React.TouchEvent) => {
    e.stopPropagation();
    resizeRef.current = { corner, touchX: e.touches[0].clientX, touchY: e.touches[0].clientY, rx: region.x, ry: region.y, rw: region.w, rh: region.h };
  };
  const onResizeTouchMove = (e: React.TouchEvent) => {
    if (!resizeRef.current) return;
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { corner, touchX, touchY, rx, ry, rw, rh } = resizeRef.current;
    const dx = ((e.touches[0].clientX - touchX) / rect.width) * 100;
    const dy = ((e.touches[0].clientY - touchY) / rect.height) * 100;
    const min = 5;
    let nx = rx, ny = ry, nw = rw, nh = rh;
    if (corner.includes("e")) nw = Math.max(min, rw + dx);
    if (corner.includes("w")) { nx = Math.min(rx + rw - min, rx + dx); nw = Math.max(min, rw - dx); }
    if (corner.includes("s")) nh = Math.max(min, rh + dy);
    if (corner.includes("n")) { ny = Math.min(ry + rh - min, ry + dy); nh = Math.max(min, rh - dy); }
    onUpdateGeometry({ x: Math.max(0, Math.min(100 - nw, nx)), y: Math.max(0, Math.min(100 - nh, ny)), w: nw, h: nh });
  };
  const onResizeTouchEnd = () => { resizeRef.current = null; };

  const hStyle = "absolute w-6 h-6 bg-white border-2 rounded-full flex items-center justify-center touch-none z-20";
  return (
    <div
      data-region={region.id}
      className="absolute rounded-sm touch-none"
      style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%`, border: `2px solid ${color.border}`, background: isActive ? color.bg : `${color.bg.replace("0.14", "0.07")}`, cursor: isActive ? "move" : "pointer" }}
      onTouchStart={(e) => { if (!isActive) { e.stopPropagation(); onActivate(); return; } onBodyTouchStart(e); }}
      onTouchMove={onBodyTouchMove}
      onTouchEnd={onBodyTouchEnd}
    >
      <span className="absolute -top-5 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none shadow-sm whitespace-nowrap" style={{ background: color.border }}>
        {region.label}
      </span>
      {/* Wand button — always visible, tap to open popover */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        onTouchEnd={(e) => { e.stopPropagation(); onOpenPopover(); }}
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform" style={{ background: color.border }}>
          <Wand2 className="w-4 h-4 text-white" />
        </div>
      </div>
      {isActive && (
        <>
          {[{ corner: "nw", style: { top: -12, left: -12 } }, { corner: "ne", style: { top: -12, right: -12 } }, { corner: "sw", style: { bottom: -12, left: -12 } }, { corner: "se", style: { bottom: -12, right: -12 } }].map(({ corner, style }) => (
            <div key={corner} className={hStyle} style={{ ...style as React.CSSProperties, borderColor: color.border }}
              onTouchStart={onResizeTouchStart(corner)} onTouchMove={onResizeTouchMove} onTouchEnd={onResizeTouchEnd}>
              <GripVertical className="w-2.5 h-2.5 text-muted-foreground" />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Desktop Region Box ────────────────────────────────────────────────────────
interface DesktopRegionBoxProps {
  region: ComposerRegion;
  isActive: boolean;
  canvasRef: React.RefObject<HTMLDivElement>;
  onActivate: () => void;
  onUpdateGeometry: (g: { x: number; y: number; w: number; h: number }) => void;
}
function DesktopRegionBox({ region, isActive, canvasRef, onActivate, onUpdateGeometry }: DesktopRegionBoxProps) {
  const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
  const dragRef = useRef<{ startX: number; startY: number; rx: number; ry: number } | null>(null);
  const resizeRef = useRef<{ corner: string; startX: number; startY: number; rx: number; ry: number; rw: number; rh: number } | null>(null);

  const onBodyMouseDown = (e: React.MouseEvent) => {
    if (!isActive) { e.stopPropagation(); onActivate(); return; }
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, rx: region.x, ry: region.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = ((ev.clientX - dragRef.current.startX) / rect.width) * 100;
      const dy = ((ev.clientY - dragRef.current.startY) / rect.height) * 100;
      onUpdateGeometry({
        x: Math.min(100 - region.w, Math.max(0, dragRef.current.rx + dx)),
        y: Math.min(100 - region.h, Math.max(0, dragRef.current.ry + dy)),
        w: region.w, h: region.h,
      });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeMouseDown = (corner: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    resizeRef.current = { corner, startX: e.clientX, startY: e.clientY, rx: region.x, ry: region.y, rw: region.w, rh: region.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { corner: c, startX, startY, rx, ry, rw, rh } = resizeRef.current;
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const min = 5;
      let nx = rx, ny = ry, nw = rw, nh = rh;
      if (c.includes("e")) nw = Math.max(min, rw + dx);
      if (c.includes("w")) { nx = Math.min(rx + rw - min, rx + dx); nw = Math.max(min, rw - dx); }
      if (c.includes("s")) nh = Math.max(min, rh + dy);
      if (c.includes("n")) { ny = Math.min(ry + rh - min, ry + dy); nh = Math.max(min, rh - dy); }
      onUpdateGeometry({ x: Math.max(0, Math.min(100 - nw, nx)), y: Math.max(0, Math.min(100 - nh, ny)), w: nw, h: nh });
    };
    const onUp = () => { resizeRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const corners = ["nw", "ne", "sw", "se"];
  const firstRefImg = region.referenceImages[0];

  return (
    <div
      data-region={region.id}
      className="absolute rounded-sm group select-none"
      style={{
        left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%`,
        border: `2px solid ${color.border}`,
        background: isActive ? color.bg : `${color.bg.replace("0.14", "0.07")}`,
        cursor: isActive ? "move" : "pointer",
      }}
      onMouseDown={onBodyMouseDown}
    >
      {/* Label badge */}
      <span className="absolute -top-5 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none shadow-sm z-10 whitespace-nowrap" style={{ background: color.border }}>
        {region.label}
      </span>

      {/* Reference image thumbnail — fills the region background */}
      {firstRefImg && (
        <img
          src={firstRefImg.preview}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none rounded-[2px]"
        />
      )}

      {/* Text preview */}
      {region.comment && (
        <div className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-medium line-clamp-2 pointer-events-none z-10" style={{ color: color.border }}>
          {region.comment}
        </div>
      )}

      {/* Resize handles — only when active */}
      {isActive && (
        <>
          {([
            { corner: "nw", style: { top: -5, left: -5, cursor: "nw-resize" } },
            { corner: "ne", style: { top: -5, right: -5, cursor: "ne-resize" } },
            { corner: "sw", style: { bottom: -5, left: -5, cursor: "sw-resize" } },
            { corner: "se", style: { bottom: -5, right: -5, cursor: "se-resize" } },
            { corner: "n", style: { top: -5, left: "50%", transform: "translateX(-50%)", cursor: "n-resize" } },
            { corner: "s", style: { bottom: -5, left: "50%", transform: "translateX(-50%)", cursor: "s-resize" } },
            { corner: "e", style: { right: -5, top: "50%", transform: "translateY(-50%)", cursor: "e-resize" } },
            { corner: "w", style: { left: -5, top: "50%", transform: "translateY(-50%)", cursor: "w-resize" } },
          ] as Array<{ corner: string; style: React.CSSProperties }>).map(({ corner, style }) => {
            const isCorner = corners.includes(corner);
            return (
              <div
                key={corner}
                className={cn(
                  "absolute w-3 h-3 bg-white border-2 rounded-full z-20 transition-opacity",
                  isCorner ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                style={{ ...style, borderColor: color.border, position: "absolute" }}
                onMouseDown={onResizeMouseDown(corner)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Variation Lightbox ────────────────────────────────────────────────────────
interface VariationLightboxProps {
  variations: ComposerVariation[];
  initialIndex: number;
  onClose: () => void;
  onFeedback: (variationId: string, fb: ComposerVariation["feedback"]) => void;
  onEditThis: (v: ComposerVariation) => void;
}
function VariationLightbox({ variations, initialIndex, onClose, onFeedback, onEditThis }: VariationLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const v = variations[index];
  const total = variations.length;

  // Keyboard navigation
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose, total]);

  if (!v) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Counter */}
      {total > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs font-medium tabular-nums">
          {index + 1} / {total}
        </div>
      )}

      {/* Prev arrow */}
      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
          disabled={index === 0}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 flex items-center justify-center text-white transition-colors z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image */}
      <AnimatePresence mode="wait">
        <motion.div
          key={v.id}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.15 }}
          className="relative max-w-[90vw] max-h-[85vh] rounded-xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={v.imageBase64}
            alt={`Variation ${index + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain"
          />
          {/* Bottom toolbar */}
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(["up", "heart", "down"] as const).map((fb) => {
                const Icon = fb === "up" ? ThumbsUp : fb === "down" ? ThumbsDown : Heart;
                const isActive = v.feedback === fb;
                return (
                  <button
                    key={fb}
                    onClick={() => onFeedback(v.id, isActive ? null : fb)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-colors bg-white/10 hover:bg-white/20",
                      isActive && fb === "up" && "text-emerald-400 bg-emerald-500/20",
                      isActive && fb === "down" && "text-red-400 bg-red-500/20",
                      isActive && fb === "heart" && "text-pink-400 bg-pink-500/20",
                      !isActive && "text-white/80"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => onEditThis(v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
            >
              <Pencil className="w-3 h-3" /> Edit this render
            </button>
          </div>
          {/* Index badge */}
          <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">{index + 1}</span>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Next arrow */}
      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(total - 1, i + 1)); }}
          disabled={index === total - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-20 flex items-center justify-center text-white transition-colors z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// ─── Variation Card ────────────────────────────────────────────────────────────
interface VariationCardProps {
  variation: ComposerVariation;
  index: number;
  onFeedback: (fb: ComposerVariation["feedback"]) => void;
  onEditThis: () => void;
  onClick: () => void;
}
function VariationCard({ variation, index, onFeedback, onEditThis, onClick }: VariationCardProps) {
  const isDisliked = variation.feedback === "down";
  return (
    <div
      className={cn("relative rounded-xl overflow-hidden border border-border bg-card transition-all group cursor-pointer", isDisliked && "opacity-40")}
      onClick={onClick}
    >
      {/* Image */}
      <div className="aspect-square w-full bg-muted">
        {variation.imageBase64 ? (
          <img src={variation.imageBase64} alt={`Variation ${index + 1}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Overlay controls */}
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
        <div className="flex gap-1">
          {(["up", "heart", "down"] as const).map((fb) => {
            const Icon = fb === "up" ? ThumbsUp : fb === "down" ? ThumbsDown : Heart;
            const isActive = variation.feedback === fb;
            return (
              <button
                key={fb}
                onClick={(e) => { e.stopPropagation(); onFeedback(isActive ? null : fb); }}
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center transition-colors bg-white/10 hover:bg-white/20",
                  isActive && fb === "up" && "text-emerald-400 bg-emerald-500/20",
                  isActive && fb === "down" && "text-red-400 bg-red-500/20",
                  isActive && fb === "heart" && "text-pink-400 bg-pink-500/20",
                  !isActive && "text-white/80"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onEditThis(); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
        >
          <Pencil className="w-3 h-3" /> Edit
        </button>
      </div>

      {/* Disliked badge */}
      {isDisliked && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-black/60 text-white/70">Disliked</span>
        </div>
      )}

      {/* Index badge */}
      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">{index + 1}</span>
      </div>

      {/* Liked badge */}
      {variation.feedback === "heart" && (
        <div className="absolute top-2 right-2">
          <span className="text-sm">❤️</span>
        </div>
      )}
      {variation.feedback === "up" && (
        <div className="absolute top-2 right-2">
          <span className="text-sm">👍</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ComposerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setIsLoggedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  const navigate = (path: string) => router.push(path);
  // setOverlayOpen is a no-op in standalone Next.js page (sidebar overlay managed at layout level)
  const setOverlayOpen = (_v: boolean) => {};
  const isMobile = useIsMobile();
  const [mobileWarningOpen, setMobileWarningOpen] = useState(false);
  const [mobileWarningDismissed, setMobileWarningDismissed] = useState(false);

  // Show warning on mobile once per session
  useEffect(() => {
    if (isMobile && !mobileWarningDismissed) {
      setMobileWarningOpen(true);
    }
  }, [isMobile]);

  // Canvas state
  const [baseSketch, setBaseSketch] = useState<string | null>(null);
  const [baseSketchPath, setBaseSketchPath] = useState<string | null>(null);
  const [regions, setRegions] = useState<ComposerRegion[]>([]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);

  // Drawing
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [generationHistory, setGenerationHistory] = useState<GenerationSet[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [view, setView] = useState<View>("canvas");
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [variationCount, setVariationCount] = useState<1 | 2 | 4>(1);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const sketchInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  const setSessionIdSynced = useCallback((id: string | null) => {
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

  // ── Load session from ?session= query param ───────────────────────────────
  useEffect(() => {
    const sessionParam = searchParams?.get("session");
    if (!sessionParam) return;
    (async () => {
      const { data } = await (supabase.from as any)("composer_sessions")
        .select("*")
        .eq("id", sessionParam)
        .single();
      if (!data) return;
      setSessionIdSynced(data.id);
      if (data.base_sketch_path) {
        setBaseSketchPath(data.base_sketch_path);
        const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(data.base_sketch_path, 3600);
        if (signed?.signedUrl) setBaseSketch(signed.signedUrl);
      }
      if (Array.isArray(data.regions_json)) {
        setRegions(data.regions_json as ComposerRegion[]);
      }
      if (data.variations_json && Array.isArray((data.variations_json as any).history)) {
        const history = (data.variations_json as any).history as GenerationSet[];
        setGenerationHistory(history);
        setHistoryIndex(history.length - 1);
        if (history.length > 0) setView("output");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore pending generation after OAuth redirect ───────────────────────
  const pendingRestoredRef = useRef(false);
  const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false);
  useEffect(() => {
    if (pendingRestoredRef.current) return;
    const pending = sessionStorage.getItem(PENDING_COMPOSER_KEY);
    if (!pending) return;
    pendingRestoredRef.current = true;
    sessionStorage.removeItem(PENDING_COMPOSER_KEY);
    try {
      const saved = JSON.parse(pending);
      if (saved.regions) setRegions(saved.regions);
      if (saved.globalPrompt) setGlobalPrompt(saved.globalPrompt);
      if (saved.variationCount) setVariationCount(saved.variationCount);
      if (saved.orientation) setOrientation(saved.orientation);
      if (saved.baseSketch) setBaseSketch(saved.baseSketch);
      if (saved.baseSketchPath) setBaseSketchPath(saved.baseSketchPath);
      // Auto-trigger once state is applied
      setShouldAutoGenerate(true);
    } catch { /* ignore corrupt state */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getPct = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const updateRegion = useCallback((id: string, patch: Partial<ComposerRegion>) => {
    setRegions((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const deleteRegion = useCallback((id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    setActiveRegionId((prev) => prev === id ? null : prev);
  }, []);

  // Deselect active region — delete it if it has no content
  const dismissActiveRegion = useCallback(() => {
    setRegions((prev) => {
      const active = prev.find((r) => r.id === activeRegionId);
      if (!active) return prev;
      const hasContent = active.comment.trim() !== "" || active.referenceImages.length > 0;
      return hasContent ? prev : prev.filter((r) => r.id !== active.id);
    });
    setActiveRegionId(null);
  }, [activeRegionId]);

  // ── Base sketch upload ─────────────────────────────────────────────────────
  const handleSketchUpload = async (file: File) => {
    const compressed = await compressImage(file, 2000);
    const base64 = await fileToBase64(compressed);
    setBaseSketch(base64);
    // Upload to storage for persistence
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `originals/${session.user.id}/sketch_${Date.now()}.${ext}`;
      const blob = await fetch(base64).then((r) => r.blob());
      const { error } = await supabase.storage.from("floor-plans").upload(path, blob, { contentType: blob.type });
      if (!error) setBaseSketchPath(path);
    }
  };

  // ── Canvas drawing (mouse) ─────────────────────────────────────────────────
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (activeRegionId) { dismissActiveRegion(); return; }
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).closest("[data-canvas-bg]")) return;
    const p = getPct(e.clientX, e.clientY);
    setDrawing(true);
    setDrawStart(p);
    setDrawCurrent(p);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    setDrawCurrent(getPct(e.clientX, e.clientY));
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !drawStart) return;
    setDrawing(false);
    const end = getPct(e.clientX, e.clientY);
    const x = Math.min(drawStart.x, end.x);
    const y = Math.min(drawStart.y, end.y);
    const w = Math.abs(end.x - drawStart.x);
    const h = Math.abs(end.y - drawStart.y);
    setDrawStart(null); setDrawCurrent(null);
    if (w < 3 || h < 3) return;
    const id = uid();
    const newRegion: ComposerRegion = {
      id, x, y, w, h,
      label: regionLabel(regions.length),
      comment: "", referenceImages: [],
      colorIdx: regions.length,
      saved: false,
    };
    setRegions((prev) => [...prev, newRegion]);
    setActiveRegionId(id);
  };

  // ── Canvas tap (mobile) ────────────────────────────────────────────────────
  const handleCanvasTap = (e: React.TouchEvent) => {
    if (activeRegionId) { dismissActiveRegion(); return; }
    const touch = e.touches[0] || e.changedTouches[0];
    const p = getPct(touch.clientX, touch.clientY);
    // Place a default 30×25 region centered on tap
    const w = 30, h = 25;
    const x = Math.min(100 - w, Math.max(0, p.x - w / 2));
    const y = Math.min(100 - h, Math.max(0, p.y - h / 2));
    const id = uid();
    const newRegion: ComposerRegion = {
      id, x, y, w, h,
      label: regionLabel(regions.length),
      comment: "", referenceImages: [],
      colorIdx: regions.length,
      saved: false,
    };
    setRegions((prev) => [...prev, newRegion]);
    setActiveRegionId(id);
  };

  // ── Save session ───────────────────────────────────────────────────────────
  const saveSession = useCallback(async (newVariations: ComposerVariation[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    // Build the updated history with the new variations appended
    const updatedHistory: GenerationSet[] = [
      ...generationHistory,
      { id: uid(), variations: newVariations.map((v) => ({
        id: v.id,
        storagePath: v.storagePath,
        imageBase64: v.storagePath ? "" : (v.imageBase64 ?? ""),
        feedback: v.feedback,
      })) },
    ];
    const vToSave = { history: updatedHistory };
    const rToSave = regions.map((r) => ({
      id: r.id, x: r.x, y: r.y, w: r.w, h: r.h,
      label: r.label, comment: r.comment,
      colorIdx: r.colorIdx, saved: r.saved,
      referenceImages: [],
    }));
    const sid = sessionIdRef.current;
    if (sid) {
      await (supabase.from as any)("composer_sessions").update({
        regions_json: rToSave,
        variations_json: vToSave,
        base_sketch_path: baseSketchPath,
      }).eq("id", sid);
    } else {
      const { data } = await (supabase.from as any)("composer_sessions").insert({
        user_id: session.user.id,
        title: "Mood Board",
        regions_json: rToSave,
        variations_json: vToSave,
        base_sketch_path: baseSketchPath,
      }).select("id").single();
      if (data?.id) setSessionIdSynced(data.id);
    }
  }, [regions, baseSketchPath, generationHistory, setSessionIdSynced]);

  // ── Generate variations ────────────────────────────────────────────────────
  const hasContent = regions.some((r) => r.saved && (r.comment.trim() || r.referenceImages.length > 0));

  // Current variations = from history at historyIndex, or empty
  const variations = historyIndex >= 0 && historyIndex < generationHistory.length
    ? generationHistory[historyIndex].variations
    : [];

  // Whether we have at least one previous generation (so button becomes "Regenerate")
  const hasGenerated = generationHistory.length > 0;

  const handleGenerate = useCallback(async () => {
    if (!hasContent && !baseSketch) {
      toast.error("Add at least one area with a prompt or reference image first");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Save current work so it resumes after OAuth redirect
      try {
        sessionStorage.setItem(PENDING_COMPOSER_KEY, JSON.stringify({
          regions: regions.map((r) => ({
            ...r,
            referenceImages: r.referenceImages.map((img) => ({ ...img, preview: "" })),
          })),
          globalPrompt,
          variationCount,
          orientation,
          baseSketch: baseSketch && baseSketch.startsWith("data:") ? baseSketch : null,
          baseSketchPath,
        }));
      } catch { /* quota exceeded — proceed without save */ }
      await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/composer` });
      return;
    }

    setGenerating(true);

    try {
      // Build prompt from all regions
      const regionPrompts = regions
        .filter((r) => r.saved && (r.comment.trim() || r.referenceImages.length > 0))
        .map((r) => `${r.label}: ${r.comment || "(see reference images)"}`)
        .join("\n");

      // Collect all reference images
      const allRefs = regions.flatMap((r) => r.referenceImages.map((img) => img.base64));

      // Include feedback from current generation if regenerating
      const currentVariations = historyIndex >= 0 && historyIndex < generationHistory.length
        ? generationHistory[historyIndex].variations
        : [];
      const feedbackContext = currentVariations.length > 0
        ? `\nUser feedback: ${currentVariations.map((v, i) => `Variation ${i + 1}: ${v.feedback || "no feedback"}`).join(", ")}. Generate ${variationCount} new variation${variationCount > 1 ? "s" : ""} improving on the liked ones and avoiding disliked styles.`
        : "";

      const prompt = `You are an architectural visualization AI. Create a photorealistic architectural render based on this mood board:

${globalPrompt ? `Overall vision: ${globalPrompt}\n\n` : ""}${regionPrompts}${feedbackContext}

Generate a complete architectural interior/exterior visualization that incorporates all the specified areas and their design intent. Make it highly detailed and professional.`;

      // Generate variations in parallel based on variationCount
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const token = currentSession?.access_token;

      const generateOne = async (i: number): Promise<ComposerVariation> => {
        const resp = await fetch(`${supabaseUrl}/functions/v1/compose-variations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            prompt: `${prompt}\n\nVariation ${i + 1} of ${variationCount}: Create a distinct interpretation.`,
            referenceImages: allRefs.slice(0, 3),
            baseSketch: baseSketch,
            variationIndex: i,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Variation ${i + 1} failed`);
        }

        const result = await resp.json();
        const imageBase64 = result.imageBase64;
        let storagePath: string | undefined;

        // Upload to storage
        if (imageBase64) {
          try {
            const bytes = new Uint8Array(atob(imageBase64.replace(/^data:image\/\w+;base64,/, "")).split("").map((c) => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: "image/png" });
            const path = `renders/${session.user.id}/composer_${Date.now()}_${i}.png`;
            const { error } = await supabase.storage.from("floor-plans").upload(path, blob, { contentType: "image/png" });
            if (!error) {
              storagePath = path;
              const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(path, 3600);
              return { id: uid(), imageBase64: signed?.signedUrl ?? imageBase64, storagePath, feedback: null };
            }
          } catch { /* use base64 directly */ }
        }
        return { id: uid(), imageBase64, storagePath, feedback: null };
      };

      // Generate all variations in parallel
      const indices = Array.from({ length: variationCount }, (_, i) => i);
      const results = await Promise.allSettled(indices.map(generateOne));
      const newVariations: ComposerVariation[] = results
        .filter((r): r is PromiseFulfilledResult<ComposerVariation> => r.status === "fulfilled")
        .map((r) => r.value);

      if (newVariations.length === 0) throw new Error("All variations failed to generate");

      const newSet: GenerationSet = { id: uid(), variations: newVariations };
      setGenerationHistory((prev) => [...prev, newSet]);
      setHistoryIndex((prev) => prev + 1);
      setView("output");
      await saveSession(newVariations);
      toast.success(`Generated ${newVariations.length} variation${newVariations.length > 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(err.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [hasContent, baseSketch, regions, generationHistory, historyIndex, globalPrompt, saveSession]);

  // ── Auto-generate after OAuth return ──────────────────────────────────────
  useEffect(() => {
    if (!shouldAutoGenerate || !isLoggedIn) return;
    setShouldAutoGenerate(false);
    // Small delay to let state settle
    const t = setTimeout(() => { handleGenerate(); }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoGenerate, isLoggedIn]);

  // ── Edit This Variation ────────────────────────────────────────────────────
  const handleEditVariation = (v: ComposerVariation) => {
    sessionStorage.setItem("editRenderPreload", JSON.stringify({
      imageUrl: v.imageBase64,
      fileName: "composer_variation.png",
      source: "rendered",
    }));
    navigate("/edit");
  };

  // ── Download all liked ─────────────────────────────────────────────────────
  const handleDownload = async () => {
    const liked = variations.filter((v) => v.feedback !== "down");
    if (liked.length === 0) { toast.error("No variations to download"); return; }
    for (const v of liked) {
      const a = document.createElement("a");
      a.href = v.imageBase64;
      a.download = `composer_variation.png`;
      a.click();
    }
  };

  // ── Update feedback for current history entry ─────────────────────────────
  const handleFeedback = useCallback((variationId: string, fb: ComposerVariation["feedback"]) => {
    setGenerationHistory((prev) => prev.map((set, i) =>
      i === historyIndex
        ? { ...set, variations: set.variations.map((v) => v.id === variationId ? { ...v, feedback: fb } : v) }
        : set
    ));
  }, [historyIndex]);

  // ─── Render draw ghost ──────────────────────────────────────────────────────
  const ghostRect = drawing && drawStart && drawCurrent ? {
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    w: Math.abs(drawCurrent.x - drawStart.x),
    h: Math.abs(drawCurrent.y - drawStart.y),
  } : null;

  const activeRegion = regions.find((r) => r.id === activeRegionId) ?? null;
  const savedRegions = regions.filter((r) => r.saved);
  const canGenerate = (hasContent || !!baseSketch) && !generating;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <MobileWarningModal
        open={mobileWarningOpen}
        onOpenChange={setMobileWarningOpen}
        onProceed={() => { setMobileWarningDismissed(true); setMobileWarningOpen(false); }}
      />
      {/* Header */}
      <div className="flex-shrink-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-3 md:px-6 h-14 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isLoggedIn && (
              <button
                onClick={() => setOverlayOpen(true)}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-foreground/70 hover:text-foreground hover:bg-accent transition-colors flex-shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <button onClick={() => navigate("/")} className="flex items-center justify-center w-9 h-9 rounded-lg text-foreground/70 hover:text-foreground hover:bg-accent transition-colors flex-shrink-0">
              <Home className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display font-semibold text-sm truncate">Composer</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-primary/40 bg-primary/10 text-primary select-none">Beta</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View toggle */}
            {variations.length > 0 && (
              <div className="flex items-center bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setView("canvas")}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", view === "canvas" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <Pencil className="w-3 h-3" />
                  <span className="hidden sm:inline">Canvas</span>
                </button>
                <button
                  onClick={() => setView("output")}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", view === "output" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span className="hidden sm:inline">Variations</span>
                  {variations.length > 0 && <span className="ml-0.5 text-[10px] bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center font-bold">{variations.length}</span>}
                </button>
              </div>
            )}

            {variations.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 hidden sm:flex">
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === "canvas" ? (
          <motion.div key="canvas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 flex flex-col min-h-0 p-3 md:p-5 gap-3">
            {/* Canvas — fills all available height */}
            <div
              ref={canvasRef}
              data-canvas-bg="true"
              className="relative flex-1 min-h-0 rounded-xl border-2 border-dashed border-border bg-card overflow-hidden select-none w-full"
              style={{ cursor: "crosshair" }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => { if (drawing) { setDrawing(false); setDrawStart(null); setDrawCurrent(null); } }}
              onTouchEnd={(e) => {
                const target = e.target as HTMLElement;
                if (!target.closest("[data-region]")) handleCanvasTap(e);
              }}
            >
              {/* Base sketch background */}
              {baseSketch && (
                <img src={baseSketch} alt="Base sketch" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
              )}

              {/* On-canvas instructions — shown only when no areas exist yet */}
              <AnimatePresence>
                {regions.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </div>
                    {isMobile ? (
                      <>
                        <p className="text-xs text-muted-foreground font-medium">Tap anywhere to mark an area</p>
                        <p className="text-[11px] text-muted-foreground/60">Then tap the wand to add prompts &amp; references</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground font-medium">Click &amp; drag to draw an area</p>
                        <p className="text-[11px] text-muted-foreground/60">Then click it to add prompts &amp; references</p>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Regions */}
              {regions.map((region) => {
                const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
                if (isMobile) {
                  return (
                    <MobileRegionBox
                      key={region.id}
                      region={region}
                      isActive={activeRegionId === region.id}
                      canvasRef={canvasRef as React.RefObject<HTMLDivElement>}
                      onActivate={() => setActiveRegionId(region.id)}
                      onOpenPopover={() => { setActiveRegionId(region.id); }}
                      onUpdateGeometry={(g) => updateRegion(region.id, g)}
                    />
                  );
                }
                return (
                  <DesktopRegionBox
                    key={region.id}
                    region={region}
                    isActive={activeRegionId === region.id}
                    canvasRef={canvasRef as React.RefObject<HTMLDivElement>}
                    onActivate={() => setActiveRegionId(region.id)}
                    onUpdateGeometry={(g) => updateRegion(region.id, g)}
                  />
                );
              })}

              {/* Drawing ghost */}
              {ghostRect && (
                <div
                  className="absolute rounded-sm pointer-events-none"
                  style={{ left: `${ghostRect.x}%`, top: `${ghostRect.y}%`, width: `${ghostRect.w}%`, height: `${ghostRect.h}%`, border: "2px dashed hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" }}
                />
              )}

              {/* Active region popover */}
               <AnimatePresence>
                 {activeRegion && (
                   <RegionPopover
                     key={activeRegion.id}
                     region={activeRegion}
                     canvasRect={canvasRect}
                     isMobile={isMobile}
                     onUpdate={(patch) => updateRegion(activeRegion.id, patch)}
                     onDelete={() => deleteRegion(activeRegion.id)}
                     onClose={() => dismissActiveRegion()}
                   />
                 )}
               </AnimatePresence>
            </div>

            {/* Global prompt with upload button embedded */}
            <div className="flex-shrink-0 relative rounded-xl border border-border bg-card shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <textarea
                value={globalPrompt}
                onChange={(e) => setGlobalPrompt(e.target.value)}
                placeholder="Describe the kind of space you want to generate — style, mood, materials, lighting…"
                rows={2}
                className="w-full bg-transparent text-sm px-4 pt-3 pb-11 resize-none focus:outline-none placeholder:text-muted-foreground/60 text-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGenerate) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
              />
              {/* Bottom bar: upload left, hint + generate right */}
              <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Upload sketch button */}
                  <button
                    onClick={() => sketchInputRef.current?.click()}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                      baseSketch
                        ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Upload className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{baseSketch ? "Sketch ✓" : "Upload sketch"}</span>
                    {baseSketch && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); setBaseSketch(null); setBaseSketchPath(null); }}
                        className="ml-0.5 text-primary/70 hover:text-destructive transition-colors leading-none"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                  {savedRegions.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {savedRegions.length} {savedRegions.length !== 1 ? "areas" : "area"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground/50 hidden sm:inline">⌘↵</span>
                  {/* History nav inline with generate button when on canvas view */}
                  {hasGenerated && generationHistory.length > 1 && (
                    <div className="flex items-center gap-0.5 bg-muted rounded-lg px-1 py-0.5">
                      <button
                        onClick={() => setHistoryIndex((i) => Math.max(0, i - 1))}
                        disabled={historyIndex <= 0}
                        className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[11px] font-medium text-foreground px-0.5 tabular-nums">{historyIndex + 1}/{generationHistory.length}</span>
                      <button
                        onClick={() => setHistoryIndex((i) => Math.min(generationHistory.length - 1, i + 1))}
                        disabled={historyIndex >= generationHistory.length - 1}
                        className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {/* Variation count selector */}
                  <select
                    value={variationCount}
                    onChange={(e) => setVariationCount(Number(e.target.value) as 1 | 2 | 4)}
                    disabled={generating}
                    className="h-[30px] rounded-lg border border-border bg-background text-xs font-medium text-foreground px-2 pr-6 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 transition-colors hover:border-primary/60"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
                  >
                    <option value={1}>1 variation</option>
                    <option value={2}>2 variations</option>
                    <option value={4}>4 variations</option>
                  </select>
                  {/* Orientation toggle */}
                  <div className="flex items-center h-[30px] rounded-lg border border-border bg-background overflow-hidden">
                    <button
                      onClick={() => setOrientation("landscape")}
                      disabled={generating}
                      title="Landscape"
                      className={cn(
                        "flex items-center justify-center w-[30px] h-full transition-colors",
                        orientation === "landscape"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <RectangleHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setOrientation("portrait")}
                      disabled={generating}
                      title="Portrait"
                      className={cn(
                        "flex items-center justify-center w-[30px] h-full transition-colors",
                        orientation === "portrait"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <RectangleVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleGenerate()}
                    disabled={!canGenerate}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  >
                    {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : hasGenerated ? <RefreshCw className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                    {generating ? "Generating…" : hasGenerated ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>
            </div>

            <input
              ref={sketchInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleSketchUpload(e.target.files[0]); }}
            />
          </motion.div>
        ) : (
          <motion.div key="output" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-8">
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Status bar */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="font-display font-semibold text-base">Variations</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Like, heart, or dislike each variation, then regenerate to refine.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* History navigation: prev / counter / next + regenerate */}
                    {generationHistory.length > 1 && (
                      <div className="flex items-center gap-1 bg-muted rounded-lg px-1.5 py-1">
                        <button
                          onClick={() => setHistoryIndex((i) => Math.max(0, i - 1))}
                          disabled={historyIndex <= 0}
                          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-medium text-foreground px-1 tabular-nums">
                          {historyIndex + 1} of {generationHistory.length}
                        </span>
                        <button
                          onClick={() => setHistoryIndex((i) => Math.min(generationHistory.length - 1, i + 1))}
                          disabled={historyIndex >= generationHistory.length - 1}
                          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerate()}
                      disabled={generating}
                      className="gap-1.5"
                    >
                      {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Regenerate
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                  </div>
                </div>

                {/* Variations grid — 1 col for single, 2 cols for 2 or 4 */}
                {generating ? (
                  <div className={cn("grid gap-4", variationCount === 1 ? "grid-cols-1" : "grid-cols-2")}>
                    {Array.from({ length: variationCount }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={cn("grid gap-4", variationCount === 1 ? "grid-cols-1" : "grid-cols-2")}>
                    {variations.map((v, i) => (
                      <VariationCard
                        key={v.id}
                        variation={v}
                        index={i}
                        onFeedback={(fb) => handleFeedback(v.id, fb)}
                        onEditThis={() => handleEditVariation(v)}
                        onClick={() => setLightboxIndex(i)}
                      />
                    ))}
                  </div>
                )}

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
                  <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5 text-emerald-500" /> Liked</span>
                  <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-pink-500" /> Loved</span>
                  <span className="flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5 text-destructive" /> Disliked — dimmed</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Variation lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <VariationLightbox
            variations={variations}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onFeedback={(vid, fb) => handleFeedback(vid, fb)}
            onEditThis={(v) => { setLightboxIndex(null); handleEditVariation(v); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
