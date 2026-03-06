import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

interface CustomStyleModalProps {
  open: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
  onSubmitted: (request: { id: string; title: string; sampleUrls: string[] }) => void;
}

const MAX_SAMPLES = 5;
export const PENDING_STYLE_REQUEST_KEY = "pendingStyleRequest";

/** Convert a File to a base64 data-URL (needed to survive page reload) */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function completePendingStyleRequest(
  onSubmitted: (request: { id: string; title: string; sampleUrls: string[] }) => void
) {
  const raw = sessionStorage.getItem(PENDING_STYLE_REQUEST_KEY);
  if (!raw) return false;

  try {
    const { title, sampleBase64s } = JSON.parse(raw) as { title: string; sampleBase64s: string[] };
    sessionStorage.removeItem(PENDING_STYLE_REQUEST_KEY);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    // Insert immediately with base64 previews so the UI updates instantly
    const { data, error } = await supabase
      .from("style_requests")
      .insert({ user_id: session.user.id, title, sample_urls: sampleBase64s, status: "pending" })
      .select()
      .single();

    if (error) throw error;

    // Show the card right away using base64 previews
    onSubmitted({ id: data.id, title: data.title, sampleUrls: sampleBase64s });
    toast.success("Request submitted! Your style will be available soon.");

    // Upload to storage in the background and update the record quietly
    Promise.all(
      sampleBase64s.map(async (b64) => {
        const res = await fetch(b64);
        const blob = await res.blob();
        const ext = blob.type.split("/")[1] || "jpg";
        const path = `style-samples/${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("floor-plans").upload(path, blob, { upsert: false });
        if (upErr) return null;
        const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(path, 60 * 60 * 24 * 365);
        return signed?.signedUrl ?? null;
      })
    ).then((urls) => {
      const uploadedUrls = urls.filter(Boolean) as string[];
      if (uploadedUrls.length > 0) {
        supabase.from("style_requests").update({ sample_urls: uploadedUrls }).eq("id", data.id);
      }
    });

    return true;
  } catch (e: any) {
    sessionStorage.removeItem(PENDING_STYLE_REQUEST_KEY);
    toast.error(e.message || "Failed to submit style request.");
    return false;
  }
}

export function CustomStyleModal({ open, isLoggedIn, onClose, onSubmitted }: CustomStyleModalProps) {
  const [title, setTitle] = useState("");
  const [samples, setSamples] = useState<{ file: File; preview: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setSamples([]);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_SAMPLES - samples.length;
    const toAdd = files.slice(0, remaining).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setSamples((prev) => [...prev, ...toAdd]);
    e.target.value = "";
  };

  const removeSample = (i: number) => {
    setSamples((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const submitRequest = async () => {
    if (!title.trim()) {
      toast.error("Please enter a style name.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Persist title + sample images as base64 so they survive the OAuth redirect
        // Limit to first 2 samples and reduce quality to avoid sessionStorage quota errors
        const sampleBase64s = await Promise.all(samples.slice(0, 2).map(({ file }) => fileToBase64(file)));
        try {
          sessionStorage.setItem(
            PENDING_STYLE_REQUEST_KEY,
            JSON.stringify({ title: title.trim(), sampleBase64s })
          );
        } catch {
          // Quota exceeded — store title only, no previews
          try {
            sessionStorage.setItem(PENDING_STYLE_REQUEST_KEY, JSON.stringify({ title: title.trim(), sampleBase64s: [] }));
          } catch { /* ignore */ }
        }
        await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
        return; // browser redirects away — modal disappears with the page
      }

      // Already logged in — upload all in parallel
      const uploadedUrls: string[] = (await Promise.all(
        samples.map(async ({ file }) => {
          const path = `style-samples/${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
          const { error } = await supabase.storage.from("floor-plans").upload(path, file, { upsert: false });
          if (error) return null;
          const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(path, 60 * 60 * 24 * 365);
          return signed?.signedUrl ?? null;
        })
      )).filter(Boolean) as string[];

      const { data, error } = await supabase
        .from("style_requests")
        .insert({ user_id: session.user.id, title: title.trim(), sample_urls: uploadedUrls, status: "pending" })
        .select()
        .single();

      if (error) throw error;

      onSubmitted({
        id: data.id,
        title: data.title,
        sampleUrls: uploadedUrls.length > 0 ? uploadedUrls : samples.map((s) => s.preview),
      });
      toast.success("Request submitted! Your style will be available soon.");
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit request.");
      setSubmitting(false);
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
                  <h2 className="font-display text-xl font-bold text-foreground">Request a custom style</h2>
                  <p className="text-muted-foreground text-sm mt-0.5">Upload up to 5 sample images and name your style.</p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Style name */}
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1.5">Style name</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Neon Cyberpunk"
                    className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Sample images */}
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1.5">
                    Sample images{" "}
                    <span className="text-muted-foreground font-normal">({samples.length}/{MAX_SAMPLES})</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {samples.map((s, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
                        <img src={s.preview} alt={`Sample ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeSample(i)}
                          className="absolute inset-0 bg-foreground/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4 text-background" />
                        </button>
                      </div>
                    ))}
                    {samples.length < MAX_SAMPLES && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors"
                      >
                        <ImagePlus className="w-5 h-5 text-muted-foreground" />
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

                {/* Auth notice when not logged in */}
                {!isLoggedIn && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2.5 border border-border">
                    You'll be asked to sign in before submitting your request.
                  </p>
                )}
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
                  onClick={submitRequest}
                  disabled={submitting || !title.trim()}
                  className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  ) : (
                    "Send request"
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
