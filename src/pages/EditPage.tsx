"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Wand2, Download, Menu, X, ImageIcon,
  Loader2, ThumbsUp, ThumbsDown, Heart, Check, Trash2, GripVertical,
  RectangleHorizontal, Brush,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageCompareSlider } from "@/components/ImageCompareSlider";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MobileWarningModal } from "@/components/MobileWarningModal";

// ─── Selection tool type ───────────────────────────────────────────────────────
type SelectionTool = "rect" | "wand" | "brush";


// ─── Region colour palette ────────────────────────────────────────────────────
const REGION_COLORS = [
  { border: "#6366f1", bg: "rgba(99,102,241,0.14)", label: "#6366f1" },
  { border: "#f59e0b", bg: "rgba(245,158,11,0.14)", label: "#f59e0b" },
  { border: "#10b981", bg: "rgba(16,185,129,0.14)", label: "#10b981" },
  { border: "#ef4444", bg: "rgba(239,68,68,0.14)",  label: "#ef4444" },
  { border: "#8b5cf6", bg: "rgba(139,92,246,0.14)", label: "#8b5cf6" },
  { border: "#ec4899", bg: "rgba(236,72,153,0.14)", label: "#ec4899" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ReferenceImage {
  id: string;
  preview: string;
  base64: string;
  quality: "good" | "warn" | "poor";
}

/** A variation result for one region */
interface VariationResult {
  id: string;
  imageBase64: string;           // full composite image returned by AI (may be a signed URL after reload)
  storagePath?: string;          // storage path after upload — used to persist and restore
  feedback: "up" | "down" | "heart" | null;
}

interface Region {
  id: string;
  x: number;   // % of canvas
  y: number;
  w: number;
  h: number;
  label: string;
  comment: string;
  referenceImages: ReferenceImage[];
  colorIdx: number;
  variations: VariationResult[];
  variationLoading: boolean;
  /** true once user hit Save (has comment or ref images) */
  saved: boolean;
  /** which variation tab is selected — null = Original */
  selectedVariation: string | null;
}

type Phase = "upload" | "annotating" | "generating" | "results";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

function regionInitial(idx: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (idx < 26) return letters[idx];
  return letters[Math.floor(idx / 26) - 1] + letters[idx % 26];
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function assessQuality(file: File): Promise<ReferenceImage["quality"]> {
  if (file.size > 500_000) return "good";
  if (file.size > 100_000) return "warn";
  return "poor";
}

function qualityDot(q: ReferenceImage["quality"]) {
  if (q === "good") return "🟢";
  if (q === "warn") return "🟡";
  return "🔴";
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
        if (blob) resolve(new File([blob], file.name, { type: "image/jpeg" }));
        else resolve(file);
      }, "image/jpeg", 0.82);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Load a data: URI or https:// URL and return it as a JPEG data URI.
 *  maxDim caps the longest side (default uncapped). Returns pixel dimensions. */
async function compressBase64ForApi(
  src: string,
  maxDim = Infinity,
): Promise<{ dataUri: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { naturalWidth: width, naturalHeight: height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height / width) * maxDim); width = maxDim; }
        else { width = Math.round((width / height) * maxDim); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve({ dataUri: canvas.toDataURL("image/jpeg", 0.92), width, height });
    };
    img.onerror = () => resolve({ dataUri: src, width: 1024, height: 768 });
    img.src = src;
  });
}

/** Draw the selection region as a highlighted overlay so AI knows exactly where to edit */
async function createAnnotatedImage(
  src: string,
  region: { x: number; y: number; w: number; h: number },
  maxDim = 1024
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Dim everything outside the region so AI focuses on the selected area
      const rx = (region.x / 100) * width;
      const ry = (region.y / 100) * height;
      const rw = (region.w / 100) * width;
      const rh = (region.h / 100) * height;

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, width, ry);                         // top
      ctx.fillRect(0, ry + rh, width, height - ry - rh);    // bottom
      ctx.fillRect(0, ry, rx, rh);                           // left
      ctx.fillRect(rx + rw, ry, width - rx - rw, rh);       // right

      // Bright border around selection
      const lw = Math.max(3, Math.round(width * 0.004));
      ctx.strokeStyle = "#FFFF00";
      ctx.lineWidth = lw;
      ctx.strokeRect(rx, ry, rw, rh);

      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/** Build a rectangular feather mask with smooth gradients on all 4 edges and corners */
function buildFeatherMask(w: number, h: number, f: number): HTMLCanvasElement {
  const mc = document.createElement("canvas");
  mc.width = w; mc.height = h;
  const m = mc.getContext("2d")!;

  // Solid white centre
  m.fillStyle = "white";
  m.fillRect(f, f, w - 2 * f, h - 2 * f);

  // 4 edge gradients (excluding corners)
  const edges: [number, number, number, number, number, number, number, number][] = [
    [0, 0, 0, f,     f, 0, w - f, f],       // top
    [0, h - f, 0, h, f, h - f, w - f, h],   // bottom
    [0, 0, f, 0,     0, f, f, h - f],       // left
    [w - f, 0, w, 0, w - f, f, w, h - f],   // right
  ];
  for (const [gx0, gy0, gx1, gy1, rx, ry, rw2, rh2] of edges) {
    const g = m.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(255,255,255,1)");
    m.fillStyle = g;
    m.fillRect(rx, ry, rw2 - rx, rh2 - ry);
  }

  // 4 corner radial gradients
  const corners: [number, number, number, number, number, number][] = [
    [f, f, 0, 0, f, f],
    [w - f, f, w - f, 0, w, f],
    [f, h - f, 0, h - f, f, h],
    [w - f, h - f, w - f, h - f, w, h],
  ];
  for (const [cx, cy, rx, ry, rr, rb] of corners) {
    const g = m.createRadialGradient(cx, cy, 0, cx, cy, f);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    m.fillStyle = g;
    m.fillRect(Math.min(rx, cx), Math.min(ry, cy), f, f);
  }

  return mc;
}

/** Composite an edited crop back onto the original full image with feathered edge blending */
async function compositeEditedCrop(
  originalSrc: string,
  editedCropSrc: string,
  region: { x: number; y: number; w: number; h: number }
): Promise<string> {
  return new Promise((resolve) => {
    const original = new Image();
    original.crossOrigin = "anonymous";
    original.onload = () => {
      const edited = new Image();
      edited.crossOrigin = "anonymous";
      edited.onload = () => {
        const W = original.width;
        const H = original.height;

        const rx = Math.round((region.x / 100) * W);
        const ry = Math.round((region.y / 100) * H);
        const rw = Math.round((region.w / 100) * W);
        const rh = Math.round((region.h / 100) * H);

        // Feather: 1.5% of shorter dimension, min 4px, max 20px
        const feather = Math.min(Math.max(Math.round(Math.min(rw, rh) * 0.015), 4), 20);

        // 1. Draw edited crop onto crop-sized canvas
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = rw; cropCanvas.height = rh;
        const cropCtx = cropCanvas.getContext("2d")!;
        cropCtx.drawImage(edited, 0, 0, rw, rh);

        // 2. Apply feather mask as alpha
        cropCtx.globalCompositeOperation = "destination-in";
        cropCtx.drawImage(buildFeatherMask(rw, rh, feather), 0, 0);

        // 3. Composite onto original
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(original, 0, 0);
        ctx.drawImage(cropCanvas, rx, ry);

        resolve(canvas.toDataURL("image/jpeg", 0.95));
      };
      edited.onerror = () => resolve(editedCropSrc);
      edited.src = editedCropSrc;
    };
    original.onerror = () => resolve(editedCropSrc);
    original.src = originalSrc;
  });
}

/** Crop just the selected region so AI can identify the object */
async function cropRegionImage(
  src: string,
  region: { x: number; y: number; w: number; h: number }
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { width, height } = img;
      const rx = (region.x / 100) * width;
      const ry = (region.y / 100) * height;
      const rw = (region.w / 100) * width;
      const rh = (region.h / 100) * height;
      const canvas = document.createElement("canvas");
      canvas.width = rw; canvas.height = rh;
      canvas.getContext("2d")!.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

/**
 * Create an inpainting mask (PNG):
 *   white = region to EDIT, black = region to PRESERVE
 * The selection is expanded by expandPx and the edges feathered so the
 * inpainted region blends seamlessly with the surrounding preserved area.
 * Must be the same pixel dimensions as the compressed source image (maxDim 1024).
 */
async function createMaskImage(
  src: string,
  region: { x: number; y: number; w: number; h: number },
  maxDim = Infinity
): Promise<string> {
  // These pixel values are calibrated for a 1024px wide image and scale proportionally.
  const BASE_DIM = 1024;
  const BASE_EXPAND_SIDE = 20;
  const BASE_EXPAND_TOP  = 40; // expand upward so tall roof peaks aren't clipped by the mask
  const BASE_FEATHER     = 40; // wide feather for smooth blend at full resolution

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round((height / width) * maxDim); width = maxDim; }
        else { width = Math.round((width / height) * maxDim); height = maxDim; }
      }
      const scale = width / BASE_DIM;
      const expandSide = Math.round(BASE_EXPAND_SIDE * scale);
      const expandTop  = Math.round(BASE_EXPAND_TOP  * scale);
      const featherPx  = Math.max(1, Math.round(BASE_FEATHER * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;

      // Preserve everything by default (black)
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);

      // Expanded region — no upward expansion so the AI isn't forced into the top edge
      const rx = Math.max(0, Math.round((region.x / 100) * width) - expandSide);
      const ry = Math.max(0, Math.round((region.y / 100) * height) - expandTop);
      const rr = Math.min(width,  Math.round(((region.x + region.w) / 100) * width)  + expandSide);
      const rb = Math.min(height, Math.round(((region.y + region.h) / 100) * height) + expandSide);
      const rw = rr - rx;
      const rh = rb - ry;

      // Solid white centre (inset by feather so gradients run over black background)
      const fi = featherPx;
      ctx.fillStyle = "white";
      ctx.fillRect(rx + fi, ry + fi, rw - 2 * fi, rh - 2 * fi);

      // Feathered edges — linear gradients on all 4 sides
      const gradients: [number, number, number, number, number, number, number, number][] = [
        [rx, ry,       rx, ry + fi,   rx + fi, ry,      rr - fi, ry + fi], // top
        [rx, rb,       rx, rb - fi,   rx + fi, rb - fi, rr - fi, rb     ], // bottom
        [rx, ry,       rx + fi, ry,   rx,      ry + fi, rx + fi, rb - fi], // left
        [rr, ry,       rr - fi, ry,   rr - fi, ry + fi, rr,      rb - fi], // right
      ];
      for (const [gx0, gy0, gx1, gy1, bx, by, br, bb] of gradients) {
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(255,255,255,1)");
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, br - bx, bb - by);
      }

      // Feathered corners — radial gradients
      const corners: [number, number, number, number, number, number][] = [
        [rx + fi, ry + fi, rx,      ry,      rx + fi, ry + fi], // top-left
        [rr - fi, ry + fi, rr - fi, ry,      rr,      ry + fi], // top-right
        [rx + fi, rb - fi, rx,      rb - fi, rx + fi, rb     ], // bottom-left
        [rr - fi, rb - fi, rr - fi, rb - fi, rr,      rb     ], // bottom-right
      ];
      for (const [cx, cy, bx, by, br, bb] of corners) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fi);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, br - bx, bb - by);
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = src;
  });
}

/**
 * After Imagen 3 inpainting, composite only the edited region back onto the
 * original (higher-quality) image.  This preserves original render quality
 * everywhere outside the mask, and avoids showing the full lower-res Imagen
 * output as the final result.
 *
 * expandFrac / featherFrac must match the values used in createMaskImage.
 */
async function compositeImagenResult(
  originalSrc: string,
  aiSrc: string,
  region: { x: number; y: number; w: number; h: number },
): Promise<string> {
  // Re-generate the exact inpainting mask (same as what was sent to Replicate).
  // Using the mask as blend alpha gives pixel-precise compositing that only replaces
  // the edited zone, preventing "bleed" from subtly-altered unmasked AI areas.
  const maskSrc = await createMaskImage(originalSrc, region, 1024);

  return new Promise((resolve) => {
    const orig = new Image();
    orig.crossOrigin = "anonymous";
    orig.onload = () => {
      const ai = new Image();
      ai.crossOrigin = "anonymous";
      ai.onload = () => {
        const maskImg = new Image();
        maskImg.onload = () => {
          const OW = orig.width, OH = orig.height;

          // Step 1: scale AI output to cover OW×OH while preserving aspect ratio.
          // "Cover" ensures the AI content fills the canvas without distortion,
          // handling the case where Flux returns a different aspect ratio than the input.
          const aiCanvas = document.createElement("canvas");
          aiCanvas.width = OW; aiCanvas.height = OH;
          {
            const aiW = ai.naturalWidth, aiH = ai.naturalHeight;
            const scale = Math.max(OW / aiW, OH / aiH);
            const sw = aiW * scale, sh = aiH * scale;
            const ox = (OW - sw) / 2, oy = (OH - sh) / 2;
            aiCanvas.getContext("2d")!.drawImage(ai, ox, oy, sw, sh);
          }

          // Step 2: stretch mask to full original resolution
          const maskCanvas = document.createElement("canvas");
          maskCanvas.width = OW; maskCanvas.height = OH;
          maskCanvas.getContext("2d")!.drawImage(maskImg, 0, 0, OW, OH);

          // Step 3: mask the AI output — only white mask areas remain visible
          const aiMasked = document.createElement("canvas");
          aiMasked.width = OW; aiMasked.height = OH;
          const mc = aiMasked.getContext("2d")!;
          mc.drawImage(aiCanvas, 0, 0);
          mc.globalCompositeOperation = "destination-in";
          mc.drawImage(maskCanvas, 0, 0);

          // Step 4: composite masked AI over original
          const canvas = document.createElement("canvas");
          canvas.width = OW; canvas.height = OH;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(orig, 0, 0);
          ctx.drawImage(aiMasked, 0, 0);

          resolve(canvas.toDataURL("image/jpeg", 0.95));
        };
        maskImg.onerror = () => resolve(aiSrc);
        maskImg.src = maskSrc;
      };
      ai.onerror = () => resolve(aiSrc);
      ai.src = aiSrc;
    };
    orig.onerror = () => resolve(aiSrc);
    orig.src = originalSrc;
  });
}

// ─── RegionPopover (Desktop: absolute positioned next to region) ───────────────
interface RegionPopoverProps {
  region: Region;
  canvasRect: DOMRect | null;
  isMobile?: boolean;
  onUpdate: (patch: Partial<Region>) => void;
  onDelete: () => void;
  onClose: () => void;
  onSave: () => void;
  onGenerateVariation: (count: number) => void;
}

function RegionPopoverContent({ region, onUpdate, onDelete, onClose, onSave, onGenerateVariation }: Omit<RegionPopoverProps, "canvasRect" | "isMobile">) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [variationCount, setVariationCount] = useState(1);
  const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
  const hasContent = region.comment.trim() !== "" || region.referenceImages.length > 0;

  const addImageFiles = useCallback(async (files: File[]) => {
    const remaining = 5 - region.referenceImages.length;
    if (remaining <= 0) { toast.error("Max 5 reference images"); return; }
    const picked = files.slice(0, remaining);
    const results: ReferenceImage[] = await Promise.all(
      picked.map(async (f) => {
        const compressed = await compressImage(f, 1500);
        const [base64, quality] = await Promise.all([fileToBase64(compressed), assessQuality(compressed)]);
        return { id: uid(), preview: URL.createObjectURL(compressed), base64, quality };
      })
    );
    onUpdate({ referenceImages: [...region.referenceImages, ...results].slice(0, 5) });
  }, [region.referenceImages, onUpdate]);

  const handleFiles = useCallback(async (files: FileList) => {
    await addImageFiles(Array.from(files));
  }, [addImageFiles]);

  const handleClose = () => {
    if (!hasContent && !region.saved) {
      onDelete();
    } else {
      onClose();
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold" style={{ color: color.border }}>
          Region {region.label}
        </span>
        <div className="flex gap-1">
          <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleClose} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Comment textarea */}
      <textarea
        autoFocus
        className="w-full text-sm rounded-lg border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
        rows={3}
        placeholder="Describe what to change in this region…"
        value={region.comment}
        onChange={(e) => onUpdate({ comment: e.target.value })}
      />

      {/* Reference images */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Reference images (up to 5)</p>
          <p className="text-[10px] text-muted-foreground/60">or paste ⌘V</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {region.referenceImages.map((img, i) => (
            <div key={img.id} className="relative group w-12 h-12 rounded-md overflow-hidden border border-border flex-shrink-0">
              <img src={img.preview} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 text-[8px] bg-black/60 text-white text-center py-px leading-tight">Primary</span>
              )}
              <span className="absolute top-0 left-0 text-[9px] px-0.5">{qualityDot(img.quality)}</span>
              <button
                onClick={() => onUpdate({ referenceImages: region.referenceImages.filter(r => r.id !== img.id) })}
                className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/70 text-white hidden group-hover:flex items-center justify-center"
              >
                <X className="w-2 h-2" />
              </button>
            </div>
          ))}
          {region.referenceImages.length < 5 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-md border-2 border-dashed border-border hover:border-primary/60 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Variation count selector */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Number of variations</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setVariationCount(n)}
              className={cn(
                "flex-1 py-1.5 rounded-md text-xs font-semibold border transition-colors",
                variationCount === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-muted-foreground"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <button
          onClick={() => {
            if (!hasContent) return;
            onGenerateVariation(variationCount);
          }}
          disabled={!hasContent}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          <Wand2 className="w-3.5 h-3.5" /> Generate Variations
        </button>

        <div className="flex gap-1.5">
          <button
            onClick={() => { onUpdate({ saved: true }); onSave(); onClose(); }}
            disabled={!hasContent}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
          >
            <Check className="w-3.5 h-3.5" /> Save
          </button>
          <button
            onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Discard
          </button>
        </div>
      </div>
    </div>
  );
}

function RegionPopover({ region, canvasRect, isMobile, onUpdate, onDelete, onClose, onSave, onGenerateVariation }: RegionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Paste handler for images
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        const remaining = 5 - region.referenceImages.length;
        if (remaining <= 0) { toast.error("Max 5 reference images"); return; }
        const picked = imageFiles.slice(0, remaining);
        const results: ReferenceImage[] = await Promise.all(
          picked.map(async (f) => {
            const compressed = await compressImage(f, 1500);
            const [base64, quality] = await Promise.all([fileToBase64(compressed), assessQuality(compressed)]);
            return { id: uid(), preview: URL.createObjectURL(compressed), base64, quality };
          })
        );
        onUpdate({ referenceImages: [...region.referenceImages, ...results].slice(0, 5) });
      }
    };
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, [region.referenceImages, onUpdate]);

  // Mobile: bottom sheet overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
          onTouchStart={(e) => { e.stopPropagation(); onClose(); }}
        />
        <motion.div
          ref={popoverRef}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          tabIndex={-1}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <RegionPopoverContent
            region={region}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onClose={onClose}
            onSave={onSave}
            onGenerateVariation={onGenerateVariation}
          />
          {/* Safe area padding */}
          <div className="h-4" />
        </motion.div>
      </>
    );
  }

  // Desktop: absolute positioned next to region
  let leftPx = 0;
  let topPx = 0;
  let showAbove = false;
  if (canvasRect) {
    const regionRightPx = (region.x + region.w) / 100 * canvasRect.width;
    const regionTopPx = region.y / 100 * canvasRect.height;
    const regionLeftPx = region.x / 100 * canvasRect.width;
    const popoverW = 276;
    const popoverH = 380;
    const spaceRight = canvasRect.width - regionRightPx;
    const spaceLeft = regionLeftPx;

    if (spaceRight >= popoverW + 12) {
      leftPx = regionRightPx + 12;
      topPx = Math.min(regionTopPx, canvasRect.height - popoverH);
    } else if (spaceLeft >= popoverW + 12) {
      leftPx = regionLeftPx - popoverW - 12;
      topPx = Math.min(regionTopPx, canvasRect.height - popoverH);
    } else {
      showAbove = true;
      const regionCenterPx = regionLeftPx + (region.w / 100 * canvasRect.width) / 2;
      leftPx = Math.min(
        Math.max(8, regionCenterPx - popoverW / 2),
        canvasRect.width - popoverW - 8
      );
      topPx = Math.max(8, regionTopPx - popoverH - 12);
    }
  }

  return (
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, scale: 0.95, y: showAbove ? 4 : -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: showAbove ? 4 : -4 }}
      transition={{ duration: 0.14 }}
      className="absolute z-30 w-[276px] bg-card border border-border rounded-xl shadow-xl"
      style={{ left: leftPx, top: topPx, maxHeight: "calc(100% - 16px)", overflowY: "auto" }}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={-1}
    >
      <RegionPopoverContent
        region={region}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onClose={onClose}
        onSave={onSave}
        onGenerateVariation={onGenerateVariation}
      />
    </motion.div>
  );
}

// ─── VariationTabs (below canvas) ─────────────────────────────────────────────
interface VariationTabsProps {
  regions: Region[];
  onFeedback: (regionId: string, variationId: string, fb: VariationResult["feedback"]) => void;
  onSelectVariation: (regionId: string, variationId: string | null) => void;
  onNewVariation: (regionId: string) => void;
}

function VariationTabs({ regions, onFeedback, onSelectVariation, onNewVariation }: VariationTabsProps) {
  const regionsWithVariations = regions.filter((r) => r.variations.length > 0 || r.variationLoading);
  if (regionsWithVariations.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {regionsWithVariations.map((region) => {
        const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
        return (
          <div key={region.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ color: color.border }}>
                Region {region.label} — Variations
              </p>
              {!region.variationLoading && (
                <button
                  onClick={() => onNewVariation(region.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Wand2 className="w-3 h-3" /> New Variation
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Original tab */}
              <VariationTab
                label="Original"
                isSelected={region.selectedVariation === null}
                feedback={null}
                canFeedback={false}
                onSelect={() => onSelectVariation(region.id, null)}
                onFeedback={() => {}}
                color={color.border}
              />
              {/* Each variation tab */}
              {region.variations.map((v, i) => (
                <VariationTab
                  key={v.id}
                  label={`Variation ${i + 1}`}
                  isSelected={region.selectedVariation === v.id}
                  feedback={v.feedback}
                  canFeedback={true}
                  onSelect={() => onSelectVariation(region.id, v.id)}
                  onFeedback={(fb) => onFeedback(region.id, v.id, fb)}
                  color={color.border}
                />
              ))}
              {/* Loading variation */}
              {region.variationLoading && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating…
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface VariationTabProps {
  label: string;
  isSelected: boolean;
  feedback: VariationResult["feedback"];
  canFeedback: boolean;
  onSelect: () => void;
  onFeedback: (fb: VariationResult["feedback"]) => void;
  color: string;
}

function VariationTab({ label, isSelected, feedback, canFeedback, onSelect, onFeedback, color }: VariationTabProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-0 rounded-lg border overflow-hidden transition-all cursor-pointer select-none",
        isSelected ? "border-2 shadow-sm" : "border-border bg-muted/20 hover:bg-muted/40"
      )}
      style={isSelected ? { borderColor: color } : {}}
    >
      <button
        onClick={onSelect}
        className={cn(
          "px-3 py-1.5 text-sm font-medium transition-colors",
          isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        style={isSelected ? { color } : {}}
      >
        {label}
      </button>

      {canFeedback && isSelected && (
        <div className="flex items-center border-l border-border">
          {(["up", "heart", "down"] as const).map((fb) => {
            const Icon = fb === "up" ? ThumbsUp : fb === "down" ? ThumbsDown : Heart;
            const isActive = feedback === fb;
            return (
              <button
                key={fb}
                onClick={(e) => { e.stopPropagation(); onFeedback(isActive ? null : fb); }}
                className={cn(
                  "px-2 py-1.5 transition-colors",
                  !isActive && "text-muted-foreground hover:text-foreground",
                  isActive && fb === "up" && "text-emerald-500",
                  isActive && fb === "down" && "text-destructive",
                  isActive && fb === "heart" && "text-pink-500",
                )}
              >
                <Icon className="w-3 h-3" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mobile Region (tap to create with resize handles) ────────────────────────
interface MobileRegionBoxProps {
  region: Region;
  isActive: boolean;
  canvasRef: React.RefObject<HTMLDivElement>;
  onActivate: () => void;
  onUpdateGeometry: (patch: { x: number; y: number; w: number; h: number }) => void;
}

function MobileRegionBox({ region, isActive, canvasRef, onActivate, onUpdateGeometry }: MobileRegionBoxProps) {
  const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ touchX: number; touchY: number; rx: number; ry: number } | null>(null);
  const resizingRef = useRef<{ corner: string; touchX: number; touchY: number; rx: number; ry: number; rw: number; rh: number } | null>(null);

  const getCanvasPct = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  // Drag the whole region
  const onBodyTouchStart = (e: React.TouchEvent) => {
    if (isActive) {
      e.stopPropagation();
      isDraggingRef.current = true;
      dragStartRef.current = {
        touchX: e.touches[0].clientX,
        touchY: e.touches[0].clientY,
        rx: region.x,
        ry: region.y,
      };
    }
  };

  const onBodyTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.touches[0].clientX - dragStartRef.current.touchX) / rect.width) * 100;
    const dy = ((e.touches[0].clientY - dragStartRef.current.touchY) / rect.height) * 100;
    const nx = Math.min(100 - region.w, Math.max(0, dragStartRef.current.rx + dx));
    const ny = Math.min(100 - region.h, Math.max(0, dragStartRef.current.ry + dy));
    onUpdateGeometry({ x: nx, y: ny, w: region.w, h: region.h });
  };

  const onBodyTouchEnd = () => { isDraggingRef.current = false; dragStartRef.current = null; };

  // Resize from a corner handle
  const onResizeTouchStart = (corner: string) => (e: React.TouchEvent) => {
    e.stopPropagation();
    resizingRef.current = {
      corner, touchX: e.touches[0].clientX, touchY: e.touches[0].clientY,
      rx: region.x, ry: region.y, rw: region.w, rh: region.h,
    };
  };

  const onResizeTouchMove = (e: React.TouchEvent) => {
    if (!resizingRef.current) return;
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { corner, touchX, touchY, rx, ry, rw, rh } = resizingRef.current;
    const dx = ((e.touches[0].clientX - touchX) / rect.width) * 100;
    const dy = ((e.touches[0].clientY - touchY) / rect.height) * 100;
    const minSize = 5;
    let nx = rx, ny = ry, nw = rw, nh = rh;
    if (corner.includes("e")) { nw = Math.max(minSize, rw + dx); }
    if (corner.includes("w")) { nx = Math.min(rx + rw - minSize, rx + dx); nw = Math.max(minSize, rw - dx); }
    if (corner.includes("s")) { nh = Math.max(minSize, rh + dy); }
    if (corner.includes("n")) { ny = Math.min(ry + rh - minSize, ry + dy); nh = Math.max(minSize, rh - dy); }
    // Clamp to canvas
    nx = Math.max(0, Math.min(100 - nw, nx));
    ny = Math.max(0, Math.min(100 - nh, ny));
    onUpdateGeometry({ x: nx, y: ny, w: nw, h: nh });
  };

  const onResizeTouchEnd = () => { resizingRef.current = null; };

  const hasGeneratedVariations = region.variations.length > 0;
  const showBorder = (region.saved || isActive) && (!hasGeneratedVariations || isActive);

  if (!showBorder) return null;

  const handleStyle = "absolute w-6 h-6 bg-white border-2 rounded-full flex items-center justify-center touch-none z-20";

  return (
    <div
      data-region={region.id}
      className="absolute rounded-sm touch-none"
      style={{
        left: `${region.x}%`, top: `${region.y}%`,
        width: `${region.w}%`, height: `${region.h}%`,
        border: `2px solid ${color.border}`,
        background: isActive ? color.bg : "transparent",
        boxShadow: isActive ? `0 0 0 2px ${color.border}40` : undefined,
        cursor: isActive ? "move" : "pointer",
      }}
      onTouchStart={(e) => {
        if (!isActive) { e.stopPropagation(); onActivate(); return; }
        onBodyTouchStart(e);
      }}
      onTouchMove={onBodyTouchMove}
      onTouchEnd={onBodyTouchEnd}
    >
      {/* Region label */}
      <span
        className="absolute -top-2 -left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none shadow-sm"
        style={{ background: color.border }}
      >
        {region.label}
      </span>

      {/* Center icon — tap to open popover */}
      {!isActive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
            style={{ background: color.border }}
          >
            <Wand2 className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      {/* Resize handles — only when active */}
      {isActive && (
        <>
          {[
            { corner: "nw", style: { top: -12, left: -12 } },
            { corner: "ne", style: { top: -12, right: -12 } },
            { corner: "sw", style: { bottom: -12, left: -12 } },
            { corner: "se", style: { bottom: -12, right: -12 } },
          ].map(({ corner, style }) => (
            <div
              key={corner}
              className={handleStyle}
              style={{ ...style, borderColor: color.border }}
              onTouchStart={onResizeTouchStart(corner)}
              onTouchMove={onResizeTouchMove}
              onTouchEnd={onResizeTouchEnd}
            >
              <GripVertical className="w-2.5 h-2.5 text-muted-foreground" />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function EditPage() {
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

  const [phase, setPhase] = useState<Phase>("upload");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("render.png");
  // Track how image was loaded: "uploaded" = from device, "rendered" = from render flow
  const [imageSource, setImageSource] = useState<"uploaded" | "rendered">("uploaded");
  const [regions, setRegions] = useState<Region[]>([]);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [compositionLoading, setCompositionLoading] = useState(false);
  /** DB id of the composition currently being edited (for upsert) */
  const [compositionId, setCompositionId] = useState<string | null>(null);
  const compositionIdRef = useRef<string | null>(null);
  const setCompositionIdSynced = useCallback((id: string | null) => {
    compositionIdRef.current = id;
    setCompositionId(id);
  }, []);

  // ── Selection tool ──────────────────────────────────────────────────────────
  const [selectionTool, setSelectionTool] = useState<SelectionTool>("rect");

  // Drawing state
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Brush tool state — stores pixel points for the freehand path
  const [brushPoints, setBrushPoints] = useState<Array<{ x: number; y: number }>>([]);
  const brushActiveRef = useRef(false);

  // Magic wand & brush: hidden canvas for sampling image pixels
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  // Keep a rendered <img> ref so we can extract pixel data
  const canvasImgRef = useRef<HTMLImageElement | null>(null);

  // Active popover (only one open at a time)
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);

  // ── Handle preloaded render from Pick a Style / Clone a Style ─────────────
  useEffect(() => {
    const preloaded = sessionStorage.getItem("editRenderPreload");
    if (!preloaded) return;
    sessionStorage.removeItem("editRenderPreload");
    try {
      const { imageUrl, fileName, source } = JSON.parse(preloaded);
      if (imageUrl) {
        // We'll load via URL
        setUploadedImageUrl(imageUrl);
        setUploadedFileName(fileName || "render.png");
        setImageSource(source || "rendered");
        setUploadedImage(imageUrl);
        setRegions([]);
        setGeneratedImageUrl(null);
        originalStoragePathRef.current = null;
        setCompositionIdSynced(null);
        compositionIdRef.current = null;
        setPhase("annotating");

        // Create composition in DB immediately
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            // Fetch the image and upload to storage so we can persist it
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            const ext = (fileName || "render.png").split(".").pop() || "png";
            const path = `originals/${session.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error } = await supabase.storage.from("floor-plans").upload(path, blob, { contentType: blob.type || "image/png" });
            if (!error) {
              originalStoragePathRef.current = path;
              uploadedImageRef.current = imageUrl;
              uploadedFileNameRef.current = fileName || "render.png";
              const title = (fileName || "render.png").replace(/\.[^.]+$/, "") || "Untitled Composition";
              const { data } = await (supabase.from as any)("compositions").insert({
                user_id: session.user.id,
                original_image_path: path,
                original_file_name: fileName || "render.png",
                result_image_path: null,
                regions_json: [],
                title,
                image_source: source || "rendered",
              }).select("id").single();
              if (data?.id) setCompositionIdSynced(data.id);
            }
          } catch {
            // Non-critical
          }
        })();
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Restore pending generate-variation after OAuth redirect ───────────────
  const pendingEditRestoredRef = useRef(false);
  const [pendingGenerateRegionId, setPendingGenerateRegionId] = useState<{ regionId: string; count: number } | null>(null);
  useEffect(() => {
    if (pendingEditRestoredRef.current) return;
    const pending = sessionStorage.getItem("pendingEditGenerate");
    if (!pending) return;
    pendingEditRestoredRef.current = true;
    sessionStorage.removeItem("pendingEditGenerate");
    try {
      const saved = JSON.parse(pending);
      if (saved.uploadedImage) {
        setUploadedImage(saved.uploadedImage);
        setUploadedImageUrl(saved.uploadedImage);
      }
      if (saved.uploadedFileName) setUploadedFileName(saved.uploadedFileName);
      if (saved.regions) {
        setRegions(
          saved.regions.map((r: any) => ({
            ...r,
            referenceImages: r.referenceImages || [],
            variations: [],
            variationLoading: false,
          }))
        );
      }
      if (saved.regionId) {
        setPhase("annotating");
        setPendingGenerateRegionId({ regionId: saved.regionId, count: saved.count ?? 1 });
      }
    } catch { /* ignore corrupt state */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume composition from history ─────────────────────────────────────────
  const compositionParam = searchParams.get("composition");

  /** A data: URL is only valid if it has enough content to form a real image (>1KB of base64) */
  const isValidDataUrl = (url: string) => url.startsWith("data:") && url.length > 1000;

  useEffect(() => {
    if (!compositionParam) return;
    setRegions([]);
    setGeneratedImageUrl(null);
    setUploadedImage(null);
    setUploadedImageUrl(null);
    setActiveRegionId(null);
    setDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
    originalStoragePathRef.current = null;
    setCompositionIdSynced(null);
    setCompositionLoading(true);

    (async () => {
      try {
        const { data } = await (supabase.from as any)("compositions")
          .select("*")
          .eq("id", compositionParam)
          .single();
        if (!data) { setCompositionLoading(false); return; }
        setCompositionIdSynced(data.id);
        setUploadedFileName(data.original_file_name || "render.png");

        const resolveImage = async (path: string | null): Promise<string | null> => {
          if (!path) return null;
          if (path.startsWith("data:")) return isValidDataUrl(path) ? path : null;
          if (path.startsWith("http")) return path;
          const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(path, 3600);
          return signed?.signedUrl ?? null;
        };

        const [originalUrl, resultUrl] = await Promise.all([
          resolveImage(data.original_image_path),
          resolveImage(data.result_image_path),
        ]);

        if (data.original_image_path && !data.original_image_path.startsWith("data:")) {
          originalStoragePathRef.current = data.original_image_path;
        }

        const rawRegions: any[] = data.regions_json as any[] || [];
        const savedRegions: Region[] = await Promise.all(rawRegions.map(async (r: any) => {
          const rawVariations: any[] = r.variations || [];
          const variations: VariationResult[] = await Promise.all(
            rawVariations
              .filter((v: any) => v.storagePath)
              .map(async (v: any) => {
                const { data: signed } = await supabase.storage
                  .from("floor-plans")
                  .createSignedUrl(v.storagePath, 3600);
                return {
                  id: v.id,
                  imageBase64: signed?.signedUrl ?? "",
                  storagePath: v.storagePath,
                  feedback: v.feedback ?? null,
                };
              })
          );
          return {
            id: r.id || uid(),
            x: r.x, y: r.y, w: r.w, h: r.h,
            label: r.label,
            comment: r.comment || "",
            referenceImages: [],
            colorIdx: r.colorIdx ?? 0,
            variations,
            variationLoading: false,
            saved: true,
            selectedVariation: variations.length > 0
              ? (r.selectedVariation ?? variations[variations.length - 1].id)
              : null,
          };
        }));
        setRegions(savedRegions);

        if (resultUrl) {
          setGeneratedImageUrl(resultUrl);
          setUploadedImage(resultUrl);
          setUploadedImageUrl(resultUrl);
          setPhase("annotating");
        } else if (originalUrl) {
          setUploadedImage(originalUrl);
          setUploadedImageUrl(originalUrl);
          setPhase("annotating");
        } else {
          toast.error("Original image couldn't be recovered. Please re-upload your render.");
          setPhase("upload");
        }
      } finally {
        setCompositionLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compositionParam]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const obs = new ResizeObserver(() => {
      setCanvasRect(canvasRef.current?.getBoundingClientRect() ?? null);
    });
    obs.observe(canvasRef.current);
    setCanvasRect(canvasRef.current.getBoundingClientRect());
    return () => obs.disconnect();
  }, [phase]);


  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleUploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20 MB"); return; }
    const base64 = await fileToBase64(file);
    setUploadedImage(base64);
    setUploadedImageUrl(URL.createObjectURL(file));
    setUploadedFileName(file.name);
    setImageSource("uploaded");
    setRegions([]);
    setGeneratedImageUrl(null);
    originalStoragePathRef.current = null;
    setCompositionIdSynced(null);
    compositionIdRef.current = null;
    setPhase("annotating");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const ext = file.name.split(".").pop() || "png";
      const path = `originals/${session.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const res = await fetch(base64);
      const blob = await res.blob();
      const { error } = await supabase.storage.from("floor-plans").upload(path, blob, { contentType: blob.type || "image/png" });
      if (!error) {
        originalStoragePathRef.current = path;
        uploadedImageRef.current = base64;
        uploadedFileNameRef.current = file.name;
        const title = file.name.replace(/\.[^.]+$/, "") || "Untitled Composition";
        const { data } = await (supabase.from as any)("compositions").insert({
          user_id: session.user.id,
          original_image_path: path,
          original_file_name: file.name,
          result_image_path: null,
          regions_json: [],
          title,
          image_source: "uploaded",
        }).select("id").single();
        if (data?.id) setCompositionIdSynced(data.id);
      }
    } catch {
      // Non-critical
    }
  }, [setCompositionIdSynced]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleUploadFile(file);
  }, [handleUploadFile]);

  // ── Canvas coordinate helpers ───────────────────────────────────────────────
  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  // ── Helpers: create a region from bounding box ──────────────────────────────
  const createRegionFromBounds = useCallback((x: number, y: number, w: number, h: number) => {
    if (w < 1 || h < 1) return;
    const idx = regions.length;
    const id = uid();
    const newRegion: Region = {
      id, x, y, w, h,
      label: regionInitial(idx),
      comment: "",
      referenceImages: [],
      colorIdx: idx,
      variations: [],
      variationLoading: false,
      saved: false,
      selectedVariation: null,
    };
    setRegions((prev) => [...prev, newRegion]);
    setActiveRegionId(id);
    setTimeout(() => setCanvasRect(canvasRef.current?.getBoundingClientRect() ?? null), 0);
  }, [regions.length]);

  // ── Magic wand flood-fill ────────────────────────────────────────────────────
  const doMagicWand = useCallback((clientX: number, clientY: number) => {
    const canvasEl = canvasRef.current;
    const img = canvasImgRef.current;
    if (!canvasEl || !img) return;

    const rect = canvasEl.getBoundingClientRect();
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const displayW = rect.width;
    const displayH = rect.height;

    // Pixel position in image coords
    const px = Math.round(((clientX - rect.left) / displayW) * imgW);
    const py = Math.round(((clientY - rect.top) / displayH) * imgH);

    // Ensure hidden canvas is set up with image data
    let hc = hiddenCanvasRef.current;
    if (!hc) {
      hc = document.createElement("canvas");
      hiddenCanvasRef.current = hc;
    }
    if (!imageDataRef.current || hc.width !== imgW || hc.height !== imgH) {
      hc.width = imgW;
      hc.height = imgH;
      const ctx = hc.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, imgW, imgH);
      imageDataRef.current = ctx.getImageData(0, 0, imgW, imgH);
    }
    const data = imageDataRef.current.data;
    const TOLERANCE = 40;

    const idx = (x: number, y: number) => (y * imgW + x) * 4;
    const seedR = data[idx(px, py)];
    const seedG = data[idx(px, py) + 1];
    const seedB = data[idx(px, py) + 2];

    const colorMatch = (x: number, y: number) => {
      const i = idx(x, y);
      return (
        Math.abs(data[i] - seedR) <= TOLERANCE &&
        Math.abs(data[i + 1] - seedG) <= TOLERANCE &&
        Math.abs(data[i + 2] - seedB) <= TOLERANCE
      );
    };

    const visited = new Uint8Array(imgW * imgH);
    const queue: number[] = [py * imgW + px];
    visited[py * imgW + px] = 1;

    let minX = px, maxX = px, minY = py, maxY = py;
    let count = 0;
    const MAX_PIXELS = imgW * imgH;

    while (queue.length > 0 && count < MAX_PIXELS) {
      const pos = queue.shift()!;
      const cy = Math.floor(pos / imgW);
      const cx = pos % imgW;
      count++;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const neighbors = [
        [cx - 1, cy], [cx + 1, cy],
        [cx, cy - 1], [cx, cy + 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= imgW || ny < 0 || ny >= imgH) continue;
        const ni = ny * imgW + nx;
        if (visited[ni]) continue;
        visited[ni] = 1;
        if (colorMatch(nx, ny)) {
          queue.push(ni);
        }
      }
    }

    // Add 2% padding to the selection bounds
    const pad = 2;
    const bx = Math.max(0, (minX / imgW) * 100 - pad);
    const by = Math.max(0, (minY / imgH) * 100 - pad);
    const bw = Math.min(100 - bx, (maxX - minX) / imgW * 100 + pad * 2);
    const bh = Math.min(100 - by, (maxY - minY) / imgH * 100 + pad * 2);

    if (bw > 1 && bh > 1) {
      createRegionFromBounds(bx, by, bw, bh);
    }
  }, [createRegionFromBounds]);

  // ── Mouse drawing handlers (desktop) ────────────────────────────────────────
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    if ((e.target as HTMLElement).closest("[data-region]")) return;
    setActiveRegionId(null);

    if (selectionTool === "wand") {
      doMagicWand(e.clientX, e.clientY);
      return;
    }

    if (selectionTool === "brush") {
      e.preventDefault();
      brushActiveRef.current = true;
      const pos = getCanvasPos(e.clientX, e.clientY);
      setBrushPoints([pos]);
      setDrawing(true);
      return;
    }

    // rect tool
    const pos = getCanvasPos(e.clientX, e.clientY);
    setDrawStart(pos);
    setDrawCurrent(pos);
    setDrawing(true);
  }, [getCanvasPos, isMobile, selectionTool, doMagicWand]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;

    if (selectionTool === "brush" && brushActiveRef.current) {
      const pos = getCanvasPos(e.clientX, e.clientY);
      setBrushPoints((prev) => [...prev, pos]);
      return;
    }

    setDrawCurrent(getCanvasPos(e.clientX, e.clientY));
  }, [drawing, getCanvasPos, selectionTool]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawing) { setDrawing(false); return; }

    if (selectionTool === "brush" && brushActiveRef.current) {
      brushActiveRef.current = false;
      setDrawing(false);
      // Convert brush bounding box to a region
      setBrushPoints((pts) => {
        if (pts.length < 2) return [];
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const bx = Math.max(0, Math.min(...xs) - 1);
        const by = Math.max(0, Math.min(...ys) - 1);
        const bw = Math.min(100 - bx, Math.max(...xs) - Math.min(...xs) + 2);
        const bh = Math.min(100 - by, Math.max(...ys) - Math.min(...ys) + 2);
        createRegionFromBounds(bx, by, bw, bh);
        return [];
      });
      return;
    }

    if (!drawStart) { setDrawing(false); return; }
    const end = getCanvasPos(e.clientX, e.clientY);
    const x = Math.min(drawStart.x, end.x);
    const y = Math.min(drawStart.y, end.y);
    const w = Math.abs(end.x - drawStart.x);
    const h = Math.abs(end.y - drawStart.y);

    if (w > 2 && h > 2) {
      createRegionFromBounds(x, y, w, h);
    }

    setDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }, [drawing, drawStart, getCanvasPos, selectionTool, createRegionFromBounds]);

  // ── Touch tap handler (mobile) ──────────────────────────────────────────────
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleCanvasTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("[data-region]")) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
  }, []);

  const handleCanvasTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = Math.abs((e.changedTouches[0]?.clientX ?? 0) - touchStartRef.current.x);
    const dy = Math.abs((e.changedTouches[0]?.clientY ?? 0) - touchStartRef.current.y);
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Treat as a tap: small movement, quick
    if (dx < 10 && dy < 10 && dt < 400) {
      if ((e.target as HTMLElement).closest("[data-region]")) return;
      // Close existing active region first
      setActiveRegionId(null);
      // Create a default region centered on tap
      const pos = getCanvasPos(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      const w = 30, h = 25;
      const x = Math.min(100 - w, Math.max(0, pos.x - w / 2));
      const y = Math.min(100 - h, Math.max(0, pos.y - h / 2));
      const idx = regions.length;
      const id = uid();
      const newRegion: Region = {
        id, x, y, w, h,
        label: regionInitial(idx),
        comment: "",
        referenceImages: [],
        colorIdx: idx,
        variations: [],
        variationLoading: false,
        saved: false,
        selectedVariation: null,
      };
      setRegions((prev) => [...prev, newRegion]);
      // Don't open popover yet — user taps the center icon to open it
    }
  }, [getCanvasPos, regions.length]);

  // ── Region updates ──────────────────────────────────────────────────────────
  const updateRegion = useCallback((id: string, patch: Partial<Region>) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeRegion = useCallback((id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    setActiveRegionId((cur) => (cur === id ? null : cur));
  }, []);

  // ── Variation feedback ──────────────────────────────────────────────────────
  const handleVariationFeedback = useCallback((regionId: string, variationId: string, fb: VariationResult["feedback"]) => {
    setRegions((prev) => prev.map((r) => {
      if (r.id !== regionId) return r;
      return {
        ...r,
        variations: r.variations.map((v) => v.id === variationId ? { ...v, feedback: fb } : v),
      };
    }));
  }, []);

  const handleSelectVariation = useCallback((regionId: string, variationId: string | null) => {
    updateRegion(regionId, { selectedVariation: variationId });
  }, [updateRegion]);

  // ── Generate variation for one region ──────────────────────────────────────
  // Ref to saveComposition so generateVariation can call it without circular deps
  const saveCompositionRef = useRef<((resultImageBase64: string | null, savedRegions: Region[]) => Promise<void>) | null>(null);

  const generateVariation = useCallback(async (regionId: string, count: number = 1) => {
    if (!uploadedImage) return;
    if (!isLoggedIn) {
      // Save state so we can resume after auth redirect
      try {
        sessionStorage.setItem("pendingEditGenerate", JSON.stringify({
          regionId,
          count,
          uploadedImage: uploadedImage.startsWith("data:") ? uploadedImage : null,
          uploadedFileName,
          regions: regions.map((r) => ({
            ...r,
            referenceImages: r.referenceImages.map((img) => ({ ...img, preview: "" })),
            variations: [],
            variationLoading: false,
          })),
        }));
      } catch { /* quota exceeded — proceed without save */ }
      lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/edit` });
      return;
    }
    const region = regions.find((r) => r.id === regionId);
    if (!region) return;

    setActiveRegionId(null);
    updateRegion(regionId, { variationLoading: true, saved: true });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in"); updateRegion(regionId, { variationLoading: false }); return; }

      const regionBounds = { x: region.x, y: region.y, w: region.w, h: region.h };
      const userInstruction = region.comment.trim();

      const prompt = userInstruction
        ? userInstruction
        : `Generate a creative, high-quality variation for the highlighted region`;

      const refs = region.referenceImages.map((r) => r.base64).slice(0, 5);

      // Send at up to 1536px so Flux returns a high-res output.
      // The compositing step always uses the full-res uploadedImage for the background.
      const API_MAX = 1536;
      const [{ dataUri: compressedRender, width: compressedWidth, height: compressedHeight }, croppedRegion, maskBase64] = await Promise.all([
        compressBase64ForApi(uploadedImage, API_MAX),
        cropRegionImage(uploadedImage, regionBounds),
        createMaskImage(uploadedImage, regionBounds, API_MAX),
      ]);

      const editEndpoint = process.env.NODE_ENV === "development"
        ? "/api/edit-render"
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/edit-render`;

      for (let i = 0; i < count; i++) {
        const response = await fetch(editEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            renderBase64: compressedRender,
            compressedWidth,
            compressedHeight,
            croppedRegion,
            maskBase64,
            regionBounds,
            prompt,
            referenceImages: refs,
            fileName: uploadedFileName,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Variation generation failed");
        }

        const data = await response.json();
        let imgBase64 = data.imageBase64 || data.imageUrl;
        if (!imgBase64) throw new Error("No image returned from AI");

        // Replicate / Imagen 3: composite only the edited region back onto the
        // original so the rest of the image stays at its original quality
        if (data.compositeRegion && data.regionBounds && imgBase64.startsWith("data:")) {
          imgBase64 = await compositeImagenResult(uploadedImage, imgBase64, data.regionBounds);
        }
        // Legacy fallback: AI returned an edited crop
        else if (data.isCrop && data.regionBounds && imgBase64.startsWith("data:")) {
          imgBase64 = await compositeEditedCrop(uploadedImage, imgBase64, data.regionBounds);
        }

        const varId = uid();

        // Upload variation to storage
        let storagePath: string | undefined;
        try {
          const compId = compositionIdRef.current;
          if (compId) {
            // Convert data: URL to blob reliably (avoids fetch() on data: URLs)
            let blob: Blob;
            if (imgBase64.startsWith("data:")) {
              const arr = imgBase64.split(",");
              const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/png";
              const bstr = atob(arr[1]);
              const bytes = new Uint8Array(bstr.length);
              for (let j = 0; j < bstr.length; j++) bytes[j] = bstr.charCodeAt(j);
              blob = new Blob([bytes], { type: mime });
            } else {
              const res = await fetch(imgBase64);
              blob = await res.blob();
            }
            const path = `variations/${session.user.id}/${compId}/${regionId}_${varId}.png`;
            const { error: uploadErr } = await supabase.storage
              .from("floor-plans")
              .upload(path, blob, { contentType: "image/png", upsert: true });
            if (!uploadErr) storagePath = path;
          }
        } catch {
          // Non-critical — variation still shows in UI
        }

        const newVariation: VariationResult = { id: varId, imageBase64: imgBase64, storagePath, feedback: null };
        const isLast = i === count - 1;

        // Update regions state — pure updater, no side-effects inside
        let latestRegions: Region[] = [];
        setRegions((prev) => {
          latestRegions = prev.map((r) => {
            if (r.id !== regionId) return r;
            return {
              ...r,
              variationLoading: isLast ? false : true,
              variations: [...r.variations, newVariation],
              selectedVariation: newVariation.id,
            };
          });
          return latestRegions;
        });

        // Persist after last variation — using ref to avoid circular dep
        if (isLast) {
          saveCompositionRef.current?.(null, latestRegions);
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to generate variation");
      updateRegion(regionId, { variationLoading: false });
    }
  }, [uploadedImage, isLoggedIn, regions, updateRegion, uploadedFileName]);

  // ── Auto-trigger variation after OAuth return ────────────────────────────
  useEffect(() => {
    if (!pendingGenerateRegionId || !isLoggedIn || !uploadedImage) return;
    const { regionId, count } = pendingGenerateRegionId;
    setPendingGenerateRegionId(null);
    const t = setTimeout(() => {
      if (regionId === "__all__") {
        handleGenerate();
      } else {
        generateVariation(regionId, count);
      }
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGenerateRegionId, isLoggedIn, uploadedImage]);

  // ── Compile prompt for full generation ──────────────────────────────────────
  const compilePrompt = useCallback(() => {
    return regions
      .filter((r) => r.comment.trim())
      .map((r) => `Region ${r.label}: ${r.comment.trim()}`)
      .join("\n");
  }, [regions]);

  const compileReferenceImages = useCallback(() => {
    const refs: string[] = [];
    regions.forEach((r) => r.referenceImages.forEach((img) => refs.push(img.base64)));
    return refs.slice(0, 10);
  }, [regions]);

  // ── Persist composition to DB ───────────────────────────────────────────────
  const uploadedImageRef = useRef<string | null>(null);
  const uploadedFileNameRef = useRef<string>("render.png");
  const originalStoragePathRef = useRef<string | null>(null);
  useEffect(() => { uploadedImageRef.current = uploadedImage; }, [uploadedImage]);
  useEffect(() => { uploadedFileNameRef.current = uploadedFileName; }, [uploadedFileName]);

  const ensureOriginalUploaded = useCallback(async (session: { user: { id: string }; access_token: string }) => {
    if (originalStoragePathRef.current) return originalStoragePathRef.current;
    const img = uploadedImageRef.current;
    const fname = uploadedFileNameRef.current;
    if (!img) return null;
    try {
      const res = await fetch(img);
      const blob = await res.blob();
      const ext = fname.split(".").pop() || "png";
      const path = `originals/${session.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("floor-plans").upload(path, blob, { contentType: blob.type || "image/png" });
      if (!error) {
        originalStoragePathRef.current = path;
        return path;
      }
    } catch {
      // Non-critical
    }
    return null;
  }, []);

  const saveComposition = useCallback(async (resultImageBase64: string | null, savedRegions: Region[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fname = uploadedFileNameRef.current;
      if (!session) return;

      const originalPath = await ensureOriginalUploaded(session);
      if (!originalPath && !compositionIdRef.current) return;

      const regionsPayload = savedRegions.map((r) => ({
        id: r.id, x: r.x, y: r.y, w: r.w, h: r.h,
        label: r.label, comment: r.comment, colorIdx: r.colorIdx,
        saved: r.saved,
        selectedVariation: r.selectedVariation,
        variations: r.variations
          .filter((v) => v.storagePath)
          .map((v) => ({ id: v.id, storagePath: v.storagePath, feedback: v.feedback })),
      }));

      const title = fname.replace(/\.[^.]+$/, "") || "Untitled Composition";
      const currentId = compositionIdRef.current;

      if (currentId) {
        await (supabase.from as any)("compositions").update({
          regions_json: regionsPayload,
          result_image_path: resultImageBase64 ?? null,
          ...(originalPath ? { original_image_path: originalPath } : {}),
          original_file_name: fname,
          title,
        }).eq("id", currentId);
      } else {
        if (!originalPath) return;
        const { data } = await (supabase.from as any)("compositions").insert({
          user_id: session.user.id,
          original_image_path: originalPath,
          original_file_name: fname,
          result_image_path: resultImageBase64 ?? null,
          regions_json: regionsPayload,
          title,
        }).select("id").single();
        if (data?.id) setCompositionIdSynced(data.id);
      }
    } catch {
      // Non-critical
    }
  }, [setCompositionIdSynced, ensureOriginalUploaded]);

  // Keep ref in sync so generateVariation can call saveComposition without circular deps
  useEffect(() => { saveCompositionRef.current = saveComposition; }, [saveComposition]);

  // ── Full Generate with AI ───────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) return;
    if (!isLoggedIn) {
      // Save state so full generation resumes after auth
      try {
        sessionStorage.setItem("pendingEditGenerate", JSON.stringify({
          regionId: "__all__",
          count: 1,
          uploadedImage: uploadedImage.startsWith("data:") ? uploadedImage : null,
          uploadedFileName,
          regions: regions.map((r) => ({
            ...r,
            referenceImages: r.referenceImages.map((img) => ({ ...img, preview: "" })),
            variations: [],
            variationLoading: false,
          })),
        }));
      } catch { /* quota exceeded */ }
      lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/edit` });
      return;
    }
    const prompt = compilePrompt();
    const refs = compileReferenceImages();
    if (!prompt && refs.length === 0) {
      toast.error("Add a comment or reference image to at least one region first");
      return;
    }

    setPhase("generating");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in"); setPhase("annotating"); return; }

      const { dataUri: compressedRenderFull } = await compressBase64ForApi(uploadedImage!);
      const editEndpointFull = process.env.NODE_ENV === "development"
        ? "/api/edit-render"
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/edit-render`;
      const response = await fetch(editEndpointFull, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          renderBase64: compressedRenderFull,
          prompt,
          referenceImages: refs,
          fileName: uploadedFileName,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }

      const data = await response.json();
      let resultUrl = data.imageBase64 || data.imageUrl;
      if (data.isCrop && data.regionBounds && resultUrl?.startsWith("data:")) {
        resultUrl = await compositeEditedCrop(uploadedImage!, resultUrl, data.regionBounds);
      }
      setGeneratedImageUrl(resultUrl);
      setPhase("results");
      saveComposition(resultUrl, regions.filter((r) => r.saved));
    } catch (e: any) {
      toast.error(e.message || "Failed to generate. Please try again.");
      setPhase("annotating");
    }
  }, [uploadedImage, isLoggedIn, compilePrompt, compileReferenceImages, uploadedFileName, regions, saveComposition]);

  // ── Download composite ────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    const baseUrl = uploadedImageUrl;
    if (!baseUrl) return;

    const overlays = regions
      .map((r) => {
        const varImg = getRegionDisplayImage(r);
        return varImg ? { region: r, src: varImg } : null;
      })
      .filter(Boolean) as { region: Region; src: string }[];

    try {
      const loadImg = (src: string): Promise<HTMLImageElement> =>
        new Promise((res, rej) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = src;
        });

      const baseImg = await loadImg(baseUrl);
      const canvas = document.createElement("canvas");
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(baseImg, 0, 0);

      for (const { region: r, src } of overlays) {
        const varImg = await loadImg(src);
        const rx = (r.x / 100) * canvas.width;
        const ry = (r.y / 100) * canvas.height;
        const rw = (r.w / 100) * canvas.width;
        const rh = (r.h / 100) * canvas.height;
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        ctx.drawImage(varImg, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = uploadedFileName.replace(/\.[^.]+$/, "") + "_edited.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    } catch {
      const a = document.createElement("a");
      a.href = baseUrl;
      a.download = uploadedFileName.replace(/\.[^.]+$/, "") + "_edited.png";
      a.click();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedImageUrl, uploadedFileName, regions]);

  // ── New variation from tabs row ─────────────────────────────────────────────
  const handleNewVariation = useCallback((regionId: string) => {
    setActiveRegionId(regionId);
    setTimeout(() => {
      canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setCanvasRect(canvasRef.current?.getBoundingClientRect() ?? null);
    }, 50);
  }, []);

  const savedRegions = regions.filter((r) => r.saved);
  const hasContent = savedRegions.length > 0 || regions.some((r) => r.comment.trim() || r.referenceImages.length > 0);
  const activeRegion = regions.find((r) => r.id === activeRegionId);
  const regionsWithVariations = regions.filter((r) => r.variations.length > 0 || r.variationLoading);

  const getRegionDisplayImage = (region: Region): string | null => {
    if (region.selectedVariation === null) return null;
    const v = region.variations.find((v) => v.id === region.selectedVariation);
    return v?.imageBase64 ?? null;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MobileWarningModal
        open={mobileWarningOpen}
        onOpenChange={setMobileWarningOpen}
        onProceed={() => { setMobileWarningDismissed(true); setMobileWarningOpen(false); }}
      />
      <header className="border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30 bg-background">
        <div className="flex items-center gap-2">
          {isLoggedIn && (
            <button onClick={() => setOverlayOpen(true)} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <Menu className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground transition-colors">
            <Home className="w-4 h-4" />
          </button>
          <span className="text-base font-display font-bold tracking-tight text-foreground">Edit a Render</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-primary/40 bg-primary/10 text-primary select-none">Beta</span>
        </div>
        <div className="flex items-center gap-2">
          {uploadedImageUrl && (
            <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
          )}
          {phase === "annotating" && (
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={!hasContent}
              className="gap-1.5"
            >
              <Wand2 className="w-3.5 h-3.5" /> Generate with AI
            </Button>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* ── Loading composition phase ─────────────────────────────────────────── */}
        {compositionLoading && (
          <motion.div
            key="comp-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8"
          >
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading composition…</p>
          </motion.div>
        )}

        {/* ── Upload phase ──────────────────────────────────────────────────────── */}
        {!compositionLoading && phase === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-8"
          >
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-lg border-2 border-dashed border-border hover:border-primary/60 rounded-2xl p-14 flex flex-col items-center gap-4 cursor-pointer transition-colors group"
            >
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <ImageIcon className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Upload your render</p>
                <p className="text-sm text-muted-foreground mt-1">JPG, PNG, WebP — up to 20 MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadFile(e.target.files[0])} />
            </div>
          </motion.div>
        )}

        {/* ── Generating phase ───────────────────────────────────────────────────── */}
        {!compositionLoading && phase === "generating" && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-5 text-center p-8"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <Wand2 className="absolute inset-0 m-auto w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="font-display font-bold text-lg text-foreground">Applying your edits…</p>
              <p className="text-sm text-muted-foreground mt-1">This usually takes 15–30 seconds</p>
            </div>
          </motion.div>
        )}

        {/* ── Annotating phase ───────────────────────────────────────────────────── */}
        {!compositionLoading && phase === "annotating" && uploadedImageUrl && (
          <motion.div
            key="annotating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col p-3 sm:p-4 gap-4"
          >
            {/* Hint bar */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 flex-shrink-0" />
              {isMobile ? (
                <span>Tap the image to place a region, then tap the <strong>✦</strong> icon to add comments and generate variations.</span>
              ) : (
                <span>Drag on the image to mark a region, add a comment, then Save. Hit <strong>Generate with AI</strong> when ready.</span>
              )}
              {savedRegions.length > 0 && (
                <span className="ml-auto font-medium text-foreground shrink-0">
                  {savedRegions.length} saved region{savedRegions.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Canvas */}
            <div
              ref={canvasRef}
              className={cn(
                "relative rounded-xl overflow-visible border border-border bg-black select-none",
                isMobile ? "cursor-default touch-pan-y" :
                selectionTool === "wand" ? "cursor-crosshair" :
                selectionTool === "brush" ? "cursor-none" :
                "cursor-crosshair"
              )}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={() => { if (drawing && selectionTool === "brush") { handleCanvasMouseUp({} as React.MouseEvent); } }}
              onTouchStart={handleCanvasTouchStart}
              onTouchEnd={handleCanvasTouchEnd}
            >
              {/* Base image */}
              <img
                ref={canvasImgRef}
                src={uploadedImageUrl}
                alt="render"
                className="w-full block rounded-xl pointer-events-none"
                draggable={false}
                onLoad={() => { imageDataRef.current = null; }}
              />

              {/* Variation image overlays per region */}
              {regions.map((region) => {
                const varImg = getRegionDisplayImage(region);
                if (!varImg) return null;
                return (
                  <div
                    key={`var-overlay-${region.id}`}
                    className="absolute pointer-events-none rounded-xl overflow-hidden"
                    style={{
                      left: `${region.x}%`,
                      top: `${region.y}%`,
                      width: `${region.w}%`,
                      height: `${region.h}%`,
                    }}
                  >
                    <img
                      src={varImg}
                      alt="variation"
                      className="absolute"
                      style={{
                        left: `-${region.x * (100 / region.w)}%`,
                        top: `-${region.y * (100 / region.h)}%`,
                        width: `${10000 / region.w}%`,
                        height: `${10000 / region.h}%`,
                        objectFit: "cover",
                        maxWidth: "none",
                        maxHeight: "none",
                      }}
                      draggable={false}
                    />
                  </div>
                );
              })}

              {/* Drawing preview box (desktop — rect tool) */}
              {drawing && drawStart && drawCurrent && selectionTool === "rect" && (
                <div
                  className="absolute border-2 border-indigo-500 bg-indigo-500/10 pointer-events-none rounded-sm"
                  style={{
                    left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                    top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                    width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                    height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
                  }}
                />
              )}

              {/* Brush stroke preview (desktop — brush tool) */}
              {drawing && selectionTool === "brush" && brushPoints.length > 1 && (() => {
                const xs = brushPoints.map((p) => p.x);
                const ys = brushPoints.map((p) => p.y);
                const bx = Math.max(0, Math.min(...xs) - 1);
                const by = Math.max(0, Math.min(...ys) - 1);
                const bw = Math.min(100 - bx, Math.max(...xs) - Math.min(...xs) + 2);
                const bh = Math.min(100 - by, Math.max(...ys) - Math.min(...ys) + 2);
                return (
                  <>
                    {/* Dashed bounding box */}
                    <div
                      className="absolute pointer-events-none rounded-sm"
                      style={{
                        left: `${bx}%`, top: `${by}%`,
                        width: `${bw}%`, height: `${bh}%`,
                        border: "2px dashed hsl(var(--primary))",
                        background: "hsl(var(--primary) / 0.08)",
                      }}
                    />
                    {/* SVG brush stroke path */}
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points={brushPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.7"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  </>
                );
              })()}

              {/* Regions — mobile uses MobileRegionBox with resize handles */}
              {regions.map((region) => {
                const color = REGION_COLORS[region.colorIdx % REGION_COLORS.length];
                const isActive = activeRegionId === region.id;

                if (isMobile) {
                  return (
                    <div key={region.id}>
                      {region.variationLoading && (
                        <div
                          className="absolute pointer-events-none rounded-sm overflow-hidden z-10"
                          style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%` }}
                        >
                          <div className="w-full h-full bg-gradient-to-r from-muted/80 via-background/60 to-muted/80 animate-pulse" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-foreground/50" />
                          </div>
                        </div>
                      )}
                      <MobileRegionBox
                        region={region}
                        isActive={isActive}
                        canvasRef={canvasRef}
                        onActivate={() => {
                          setActiveRegionId(region.id);
                          setTimeout(() => setCanvasRect(canvasRef.current?.getBoundingClientRect() ?? null), 0);
                        }}
                        onUpdateGeometry={(patch) => updateRegion(region.id, patch)}
                      />
                    </div>
                  );
                }

                // Desktop region rendering
                const hasGeneratedVariations = region.variations.length > 0;
                const showBorder = (region.saved || isActive) && (!hasGeneratedVariations || isActive);

                return (
                  <div key={region.id}>
                    {region.variationLoading && (
                      <div
                        className="absolute pointer-events-none rounded-sm overflow-hidden z-10"
                        style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%` }}
                      >
                        <div className="w-full h-full bg-gradient-to-r from-muted/80 via-background/60 to-muted/80 animate-pulse" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-foreground/50" />
                        </div>
                      </div>
                    )}

                    {showBorder && (
                      <div
                        data-region={region.id}
                        className="absolute rounded-sm cursor-pointer transition-all"
                        style={{
                          left: `${region.x}%`, top: `${region.y}%`,
                          width: `${region.w}%`, height: `${region.h}%`,
                          border: `2px solid ${color.border}`,
                          background: color.bg,
                          boxShadow: isActive ? `0 0 0 2px ${color.border}40` : undefined,
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setActiveRegionId(isActive ? null : region.id);
                          setTimeout(() => setCanvasRect(canvasRef.current?.getBoundingClientRect() ?? null), 0);
                        }}
                      >
                        <span
                          className="absolute -top-2 -left-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none shadow-sm"
                          style={{ background: color.border }}
                        >
                          {region.label}
                        </span>
                      </div>
                    )}

                    <AnimatePresence>
                      {isActive && !region.variationLoading && (
                        <RegionPopover
                          region={region}
                          canvasRect={canvasRect}
                          isMobile={false}
                          onUpdate={(patch) => updateRegion(region.id, patch)}
                          onDelete={() => removeRegion(region.id)}
                          onSave={() => {
                            const savedR = regions.find((rr) => rr.id === region.id);
                            if (savedR) saveComposition(null, [...regions.filter((rr) => rr.id !== region.id), { ...savedR, saved: true }]);
                          }}
                          onClose={() => {
                            const r = regions.find((rr) => rr.id === region.id);
                            if (r && !r.saved && !r.comment.trim() && r.referenceImages.length === 0 && r.variations.length === 0) {
                              removeRegion(region.id);
                            } else {
                              setActiveRegionId(null);
                            }
                          }}
                          onGenerateVariation={(count) => generateVariation(region.id, count)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {/* Mobile bottom-sheet popover (rendered outside region loop to avoid clipping) */}
              {isMobile && activeRegion && !activeRegion.variationLoading && (
                <AnimatePresence>
                  <RegionPopover
                    key={activeRegion.id + "-mobile-sheet"}
                    region={activeRegion}
                    canvasRect={canvasRect}
                    isMobile={true}
                    onUpdate={(patch) => updateRegion(activeRegion.id, patch)}
                    onDelete={() => removeRegion(activeRegion.id)}
                    onSave={() => {
                      const savedR = regions.find((rr) => rr.id === activeRegion.id);
                      if (savedR) saveComposition(null, [...regions.filter((rr) => rr.id !== activeRegion.id), { ...savedR, saved: true }]);
                    }}
                    onClose={() => {
                      const r = regions.find((rr) => rr.id === activeRegion.id);
                      if (r && !r.saved && !r.comment.trim() && r.referenceImages.length === 0 && r.variations.length === 0) {
                        removeRegion(activeRegion.id);
                      } else {
                        setActiveRegionId(null);
                      }
                    }}
                    onGenerateVariation={(count) => generateVariation(activeRegion.id, count)}
                  />
                </AnimatePresence>
              )}

              {/* ── Tool dock — floating bottom center of canvas ────────────────── */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 p-1 rounded-2xl border border-border/60 bg-background/80 backdrop-blur-md shadow-xl">
                {(
                  [
                    { tool: "rect" as SelectionTool, icon: RectangleHorizontal, label: "Rectangle" },
                    { tool: "wand" as SelectionTool, icon: Wand2, label: "Magic Wand" },
                    { tool: "brush" as SelectionTool, icon: Brush, label: "Brush" },
                  ] as const
                ).map(({ tool, icon: Icon, label }) => (
                  <button
                    key={tool}
                    title={label}
                    onClick={(e) => { e.stopPropagation(); setSelectionTool(tool); }}
                    className={cn(
                      "relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-150 group",
                      selectionTool === tool
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {/* Tooltip */}
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-popover text-popover-foreground text-[10px] font-medium shadow border border-border whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Variation tabs — below canvas */}
            <AnimatePresence>
              {regionsWithVariations.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-xl border border-border bg-muted/20 p-4"
                >
                  <VariationTabs
                    regions={regions}
                    onFeedback={handleVariationFeedback}
                    onSelectVariation={handleSelectVariation}
                    onNewVariation={handleNewVariation}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inline before/after (shown if a full regen exists) */}
            {generatedImageUrl && (
              <div className="rounded-xl overflow-hidden border border-border shadow">
                <div className="flex items-center px-3 py-2 bg-muted/40 border-b border-border">
                  <span className="text-xs font-medium text-muted-foreground">Before / After</span>
                </div>
                <ImageCompareSlider originalUrl={uploadedImageUrl} renderedUrl={generatedImageUrl} initialPosition={50} />
              </div>
            )}

            {/* Mobile floating generate button */}
            {isMobile && hasContent && (
              <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
                <Button
                  onClick={handleGenerate}
                  disabled={!hasContent}
                  className="w-full h-14 rounded-2xl text-base font-semibold shadow-xl pointer-events-auto gap-2"
                >
                  <Wand2 className="w-5 h-5" /> Generate with AI
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Results phase ──────────────────────────────────────────────────────── */}
        {!compositionLoading && phase === "results" && generatedImageUrl && uploadedImageUrl && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col p-4 sm:p-6 gap-5 max-w-4xl mx-auto w-full"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-display font-bold text-xl text-foreground">Edit applied</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleDownload} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-border shadow-lg">
              <ImageCompareSlider originalUrl={uploadedImageUrl} renderedUrl={generatedImageUrl} initialPosition={50} />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setRegions([]);
                  setGeneratedImageUrl(null);
                  setPhase("annotating");
                  setUploadedImage(generatedImageUrl);
                  setUploadedImageUrl(generatedImageUrl);
                }}
                className="gap-1.5"
              >
                Continue editing
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase("upload");
                  setUploadedImage(null);
                  setUploadedImageUrl(null);
                  setRegions([]);
                  setGeneratedImageUrl(null);
                }}
              >
                Start over with new render
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
