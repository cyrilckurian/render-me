import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

interface SaveStyleModalProps {
  open: boolean;
  referencePreviews: string[];   // blob/base64 URLs from uploaded refs
  renderedImageUrl: string | null; // the AI output
  onClose: () => void;
  onSave: (name: string, thumbnailUrl: string) => Promise<void>;
}

const MAX_NAME = 20;

export function SaveStyleModal({
  open, referencePreviews, renderedImageUrl, onClose, onSave
}: SaveStyleModalProps) {
  const [name, setName] = useState("");
  const [selectedThumb, setSelectedThumb] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // All thumbnail candidates: rendered output first, then references
  const thumbs = [
    ...(renderedImageUrl ? [renderedImageUrl] : []),
    ...referencePreviews,
  ];

  const chosen = selectedThumb ?? thumbs[0] ?? null;

  const handleSave = async () => {
    if (!name.trim() || !chosen) return;
    setSaving(true);
    try {
      await onSave(name.trim(), chosen);
      setName("");
      setSelectedThumb(null);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName("");
    setSelectedThumb(null);
    onClose();
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
            <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">Save as a style</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    Save this cloned style to reuse on future renders.
                  </p>
                </div>
                <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Style name */}
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1.5">
                    Style name{" "}
                    <span className="text-muted-foreground font-normal text-xs">({name.length}/{MAX_NAME})</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    maxLength={MAX_NAME}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Warm Watercolor"
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Thumbnail picker */}
                {thumbs.length > 0 && (
                  <div>
                    <label className="text-sm font-semibold text-foreground block mb-2">Pick a thumbnail</label>
                    <div className="flex flex-wrap gap-2">
                      {thumbs.map((url, i) => {
                        const isSelected = (selectedThumb ?? thumbs[0]) === url;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedThumb(url)}
                            className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${isSelected ? "border-primary" : "border-transparent hover:border-border"}`}
                          >
                            <img src={url} alt={`thumb ${i}`} className="w-full h-full object-cover" />
                            {isSelected && (
                              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-primary-foreground" />
                              </div>
                            )}
                            {i === 0 && renderedImageUrl && (
                              <div className="absolute bottom-0 left-0 right-0 bg-foreground/60 text-[8px] text-background text-center font-medium py-0.5">Result</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-2">
                <button
                  onClick={handleClose}
                  className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim() || !chosen}
                  className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" /> Saving…</>
                  ) : "Save style"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
