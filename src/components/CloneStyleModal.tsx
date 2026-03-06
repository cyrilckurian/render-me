import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ImagePlus, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";

export interface CloneStyleData {
  referenceImages: { file: File; preview: string; base64: string }[];
}

interface CloneStyleModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CloneStyleData) => void;
}

const MAX_REFS = 10;

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function QualityMeter({ count }: { count: number }) {
  const pct = Math.round((count / MAX_REFS) * 100);

  const level =
    count === 0 ? null :
    count <= 2 ? "low" :
    count <= 5 ? "medium" :
    count <= 7 ? "good" : "excellent";

  const config = {
    low:       { label: "Very slow generation",  color: "bg-destructive",  icon: AlertTriangle,   tip: "⚠️ Fewer images = significantly longer processing time. Expect slow results with limited accuracy." },
    medium:    { label: "Slow generation",        color: "bg-amber-500",    icon: AlertTriangle,   tip: "Still on the slower side. More references will speed things up and improve quality." },
    good:      { label: "Fast generation",        color: "bg-primary",      icon: Zap,             tip: "Good speed! A few more images will make generation even faster and more accurate." },
    excellent: { label: "Fastest generation",     color: "bg-emerald-500",  icon: CheckCircle2,    tip: "🚀 Optimal! More references = faster & better results. You're all set." },
  } as const;

  if (!level) return null;

  const { label, color, icon: Icon, tip } = config[level];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${level === "low" || level === "medium" ? "text-amber-500" : level === "excellent" ? "text-emerald-500" : "text-primary"}`} />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground">{count}/{MAX_REFS} images</span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">{tip}</p>
    </motion.div>
  );
}

export function CloneStyleModal({ open, onClose, onSubmit }: CloneStyleModalProps) {
  const [refs, setRefs] = useState<{ file: File; preview: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    refs.forEach(r => URL.revokeObjectURL(r.preview));
    setRefs([]);
    setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_REFS - refs.length;
    const toAdd = files.slice(0, remaining).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setRefs(prev => [...prev, ...toAdd]);
    e.target.value = "";
  };

  const removeRef = (i: number) => {
    setRefs(prev => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleSubmit = async () => {
    if (refs.length === 0) return;
    setLoading(true);
    try {
      const withBase64 = await Promise.all(
        refs.map(async r => ({
          file: r.file,
          preview: r.preview,
          base64: await fileToBase64(r.file),
        }))
      );
      onSubmit({ referenceImages: withBase64 });
      reset();
    } catch {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-md"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 24 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Clone a Style</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Upload reference images and we'll apply that style to your floor plan live.
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Quality meter */}
                <QualityMeter count={refs.length} />

                {/* Reference images grid */}
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-2">
                    Reference images{" "}
                    <span className="text-muted-foreground font-normal">({refs.length}/{MAX_REFS})</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {refs.map((r, i) => (
                      <div key={i} className="relative w-[72px] h-[72px] rounded-lg overflow-hidden border border-border group">
                        <img src={r.preview} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeRef(i)}
                          className="absolute inset-0 bg-foreground/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4 text-background" />
                        </button>
                      </div>
                    ))}
                    {refs.length < MAX_REFS && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-[72px] h-[72px] rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors"
                      >
                        <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Add</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Info callout */}
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 border border-border leading-relaxed">
                  <span className="font-semibold text-foreground">How it works:</span> The AI analyzes your reference images and recreates that visual style directly on your floor plan — no waiting, no requests.
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-2">
                <button
                  onClick={handleClose}
                  className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || refs.length === 0}
                  className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Preparing…</>
                  ) : (
                    "Apply to Floor Plan"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Session-storage key for persisting clone data across OAuth redirect */
export const PENDING_CLONE_KEY = "pendingCloneRender";
