"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, ImagePlus, X, Zap, AlertTriangle, CheckCircle2, Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import { FloorPlanUpload } from "@/components/FloorPlanUpload";
import { PdfPagePicker } from "@/components/PdfPagePicker";
import { AuthModal } from "@/components/AuthModal";
import { GeneratingState } from "@/components/GeneratingState";
import { SaveStyleModal } from "@/components/SaveStyleModal";
import { ImageCompareSlider } from "@/components/ImageCompareSlider";
// import { lovable } from "@/integrations/lovable"; // Removed Lovable
import { supabase } from "@/integrations/supabase/client";
import { PENDING_CLONE_KEY } from "@/components/CloneStyleModal";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { getRedirectUrl } from "@/lib/auth";

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
    const level = count === 0 ? null : count <= 2 ? "low" : count <= 5 ? "medium" : count <= 7 ? "good" : "excellent";
    const config = {
        low: { label: "Low accuracy", color: "bg-destructive", icon: AlertTriangle, tip: "Add more references for better results." },
        medium: { label: "Medium accuracy", color: "bg-amber-500", icon: AlertTriangle, tip: "Good start! More images will significantly improve style matching." },
        good: { label: "Good accuracy", color: "bg-primary", icon: Zap, tip: "Great! A few more images could push this to excellent accuracy." },
        excellent: { label: "Excellent accuracy", color: "bg-emerald-500", icon: CheckCircle2, tip: "Perfect! The AI has plenty of references to nail your style." },
    } as const;
    if (!level) return null;
    const { label, color, icon: Icon, tip } = config[level];
    return (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Icon className={`w-3.5 h-3.5 ${level === "low" || level === "medium" ? "text-amber-500" : level === "excellent" ? "text-emerald-500" : "text-primary"}`} />
                    <span className="text-xs font-semibold text-foreground">{label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{count}/{MAX_REFS} images</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", damping: 20, stiffness: 200 }} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">{tip}</p>
        </motion.div>
    );
}

export default function ClonePage() {
    const router = useRouter();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const [refs, setRefs] = useState<{ file: File; preview: string; base64: string }[]>([]);
    const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
    const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
    const [floorPlanBase64, setFloorPlanBase64] = useState<string | null>(null);
    const [floorPlanIsPdf, setFloorPlanIsPdf] = useState(false);
    const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<"workspace" | "generating" | "authRequired" | "rendering" | "results">("workspace");
    const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);
    const [renderName, setRenderName] = useState<string>("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [shouldAutoRender, setShouldAutoRender] = useState(false);
    const [saveStyleModalOpen, setSaveStyleModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasManuallyLoggedOut = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [phase]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setIsLoggedIn(!!session);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
            setIsLoggedIn(!!session);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const raw = sessionStorage.getItem(PENDING_CLONE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as { referenceImages: { base64: string; preview: string }[]; floorPlanBase64?: string; floorPlanPreview?: string };
                sessionStorage.removeItem(PENDING_CLONE_KEY);
                setRefs(parsed.referenceImages.map(r => ({ ...r, file: new File([], "ref.png") })));
                if (parsed.floorPlanBase64) setFloorPlanBase64(parsed.floorPlanBase64);
                if (parsed.floorPlanPreview) setFloorPlanPreview(parsed.floorPlanPreview);
                setShouldAutoRender(true);
            } catch (err) { console.error("Failed to restore pending clone:", err); sessionStorage.removeItem(PENDING_CLONE_KEY); }
        }
    }, []);

    const handleRefFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const toAdd = await Promise.all(
            files.slice(0, MAX_REFS - refs.length).map(async (file) => ({ file, preview: URL.createObjectURL(file), base64: await fileToBase64(file) }))
        );
        setRefs(prev => [...prev, ...toAdd]);
        e.target.value = "";
    };

    const removeRef = (i: number) => {
        setRefs(prev => { URL.revokeObjectURL(prev[i].preview); return prev.filter((_, idx) => idx !== i); });
    };

    const handleUpload = useCallback(async (file: File) => {
        if (file.size > 5 * 1024 * 1024) { toast.error("File is too large. Please upload a file under 5 MB."); return; }
        const isPdf = file.type === "application/pdf";
        if (isPdf) { setFloorPlanFile(file); setFloorPlanIsPdf(true); setPendingPdfFile(file); return; }
        setFloorPlanFile(file); setFloorPlanIsPdf(false);
        setFloorPlanPreview(URL.createObjectURL(file));
        const reader = new FileReader();
        reader.onload = () => setFloorPlanBase64(reader.result as string);
        reader.readAsDataURL(file);
    }, []);

    const handlePdfPageSelected = useCallback((dataUrl: string) => { setPendingPdfFile(null); setFloorPlanPreview(dataUrl); setFloorPlanBase64(dataUrl); }, []);
    const handlePdfPickerCancel = useCallback(() => { setPendingPdfFile(null); setFloorPlanFile(null); setFloorPlanIsPdf(false); }, []);
    const handleRemoveUpload = useCallback(() => { setFloorPlanFile(null); setFloorPlanPreview(null); setFloorPlanBase64(null); setFloorPlanIsPdf(false); setPendingPdfFile(null); }, []);

    const generateRender = useCallback(async (base64?: string) => {
        const currentBase64 = base64 || floorPlanBase64;
        if (!currentBase64 || refs.length === 0) return;
        setPhase("rendering"); setIsGenerating(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { setPhase("authRequired"); setIsGenerating(false); return; }
            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/render-floor-plan`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    floorPlanBase64: currentBase64, prompt: `__CLONE_STYLE__:${refs.length}`,
                    styleId: "clone", styleName: "Cloned Style",
                    floorPlanName: floorPlanFile?.name || "floor-plan.png",
                    referenceImages: refs.map(r => r.base64),
                }),
            });
            if (!response.ok) { const err = await response.json(); throw new Error(err.error || "Failed to generate rendering"); }
            const data = await response.json();
            setRenderedImageUrl(data.renderedBase64 || data.imageUrl);
            if (data.renderId) {
                setCurrentRenderId(data.renderId);
                if (data.renderPath) {
                    const { data: render } = await supabase.from("renders").select("floor_plan_path").eq("id", data.renderId).single();
                    if (render?.floor_plan_path) {
                        const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(render.floor_plan_path, 3600);
                        if (signed?.signedUrl) setOriginalImageUrl(signed.signedUrl);
                    }
                }
            }
            setRenderName("Cloned Style Render");
            setPhase("results"); setIsGenerating(false);
            setTimeout(() => setSaveStyleModalOpen(true), 800);
        } catch (e: any) {
            toast.error(e.message || "Failed to generate rendering. Please try again.");
            setPhase("workspace"); setIsGenerating(false);
        }
    }, [floorPlanBase64, refs, floorPlanFile]);

    useEffect(() => {
        if (shouldAutoRender && isLoggedIn && floorPlanBase64 && refs.length > 0) {
            setShouldAutoRender(false);
            console.log("[Clone] Auto-rendering started...");
            generateRender();
        }
    }, [shouldAutoRender, isLoggedIn, floorPlanBase64, refs.length, generateRender]);

    useEffect(() => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (supabaseUrl === "https://placeholder.supabase.co" && typeof window !== "undefined") {
            toast.error("Supabase URL is not configured. Please check your Vercel environment variables.");
        }
    }, [isLoggedIn]);

    const savePendingClone = useCallback((): boolean => {
        if (!floorPlanBase64 || refs.length === 0) return false;
        try {
            sessionStorage.setItem(PENDING_CLONE_KEY, JSON.stringify({ referenceImages: refs.map(r => ({ base64: r.base64, preview: r.preview })), floorPlanBase64, floorPlanPreview }));
            return true;
        } catch { toast.error("References too large. Please sign in first."); return false; }
    }, [refs, floorPlanBase64, floorPlanPreview]);

    const handleCloneAndGenerate = useCallback(() => {
        if (!floorPlanBase64 || refs.length === 0) return;
        if (isLoggedIn) { generateRender(); }
        else { savePendingClone(); setPhase("generating"); setTimeout(() => setPhase("authRequired"), 3500); }
    }, [isLoggedIn, floorPlanBase64, refs, generateRender, savePendingClone]);

    const handleAuth = useCallback(() => { hasManuallyLoggedOut.current = false; setIsLoggedIn(true); generateRender(); }, [generateRender]);

    const handleReset = useCallback(() => {
        refs.forEach(r => URL.revokeObjectURL(r.preview));
        setRefs([]); setFloorPlanFile(null); setFloorPlanPreview(null); setFloorPlanBase64(null);
        setPhase("workspace"); setRenderedImageUrl(null); setOriginalImageUrl(null); setCurrentRenderId(null); setRenderName("");
    }, [refs]);

    const canGenerate = refs.length > 0 && !!floorPlanPreview;

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30 bg-background">
                <div className="flex items-center gap-3 h-8">
                    <button onClick={() => router.push("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-display font-bold tracking-tight text-foreground">
                        {phase === "results" && renderName ? renderName : "Clone a Style"}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {!isLoggedIn && (
                        <button
                            onClick={() => {
                                if (floorPlanBase64) savePendingClone();
                                supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: getRedirectUrl("/clone") } });
                            }}
                            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                            <svg viewBox="0 0 24 24" className="w-4 h-4">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Sign in
                        </button>
                    )}
                    {isLoggedIn && (
                        <button onClick={() => setMobileOpen(true)} className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                            <Menu className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </header>

            <div ref={scrollRef} className="flex-1 flex flex-col overflow-y-auto">
                <AnimatePresence mode="wait">
                    {phase === "workspace" && (
                        <motion.div key="workspace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                            <div className="flex-1 px-4 sm:px-6 py-6 sm:py-10">
                                <div className="max-w-3xl mx-auto space-y-10">
                                    <div>
                                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">Step 1 — Upload reference images</h2>
                                        <p className="text-xs text-muted-foreground mb-4">The more references you upload, the more accurate and faster your output will be.</p>
                                        <div className="space-y-4">
                                            <QualityMeter count={refs.length} />
                                            <div className="flex flex-wrap gap-2">
                                                {refs.map((r, i) => (
                                                    <div key={i} className="relative w-[80px] h-[80px] rounded-lg overflow-hidden border border-border group">
                                                        <img src={r.preview} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                                                        <button onClick={() => removeRef(i)} className="absolute inset-0 bg-foreground/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <X className="w-4 h-4 text-background" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {refs.length < MAX_REFS && (
                                                    <button onClick={() => fileInputRef.current?.click()} className="w-[80px] h-[80px] rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1.5 transition-colors">
                                                        <ImagePlus className="w-5 h-5 text-muted-foreground" />
                                                        <span className="text-[10px] text-muted-foreground font-medium">Add</span>
                                                    </button>
                                                )}
                                            </div>
                                            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleRefFileChange} />
                                            <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 border border-border leading-relaxed">
                                                <span className="font-semibold text-foreground">How it works:</span> The AI analyzes your reference images and recreates that visual style on your floor plan — live, in seconds.
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Step 2 — Upload your floor plan</h2>
                                        {pendingPdfFile ? (
                                            <PdfPagePicker file={pendingPdfFile} onSelect={handlePdfPageSelected} onCancel={handlePdfPickerCancel} />
                                        ) : (
                                            <FloorPlanUpload preview={floorPlanPreview} isPdf={floorPlanIsPdf} fileName={floorPlanFile?.name} onUpload={handleUpload} onRemove={handleRemoveUpload} />
                                        )}
                                    </div>
                                </div>
                            </div>
                            {canGenerate && (
                                <>
                                    <div className="hidden sm:block px-4 sm:px-6 pb-6 shrink-0">
                                        <div className="max-w-3xl mx-auto">
                                            <button onClick={handleCloneAndGenerate} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 transition-colors">
                                                Generate Cloned Style Render
                                            </button>
                                        </div>
                                    </div>
                                    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
                                        <button onClick={handleCloneAndGenerate} className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-base shadow-xl hover:bg-primary/90 transition-colors pointer-events-auto">
                                            Generate Cloned Style Render
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}

                    {(phase === "generating" || phase === "rendering") && (
                        <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center">
                            <GeneratingState
                                styleName="Cloned Style"
                                initialProgress={phase === "rendering" ? 25 : 0}
                                headingText={phase === "generating" ? "Render is almost ready…" : undefined}
                            />
                        </motion.div>
                    )}

                    {phase === "results" && renderedImageUrl && (
                        <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col p-4 sm:p-6 lg:p-10">
                            <div className="flex items-center justify-between mb-5 sm:mb-8">
                                <input
                                    type="text" value={renderName}
                                    onChange={(e) => setRenderName(e.target.value)}
                                    onBlur={async () => { if (!currentRenderId || !renderName.trim()) return; await supabase.from("renders").update({ style_name: renderName.trim() }).eq("id", currentRenderId); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    className="font-display font-bold text-foreground text-lg bg-transparent border-none outline-none focus:underline decoration-dotted underline-offset-4 truncate max-w-[180px] sm:max-w-xs"
                                    placeholder="Name this render…"
                                />
                                <button
                                    onClick={async () => {
                                        if (!renderedImageUrl) return;
                                        try {
                                            const res = await fetch(renderedImageUrl); const blob = await res.blob();
                                            const url = URL.createObjectURL(blob); const a = document.createElement("a");
                                            a.href = url; a.download = `clone_render.png`; a.click(); URL.revokeObjectURL(url);
                                        } catch { toast.error("Failed to download image."); }
                                    }}
                                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors px-3 py-2 rounded-lg hover:bg-primary/10"
                                >
                                    <Download className="w-4 h-4" /> Download
                                </button>
                            </div>
                            <div className="max-w-2xl mx-auto w-full space-y-4">
                                {originalImageUrl ? (
                                    <ImageCompareSlider originalUrl={originalImageUrl} renderedUrl={renderedImageUrl} initialPosition={0} />
                                ) : (
                                    <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-card">
                                        <img src={renderedImageUrl} alt="Cloned style render" className="w-full block" />
                                    </div>
                                )}
                            </div>
                            <div className="max-w-2xl mx-auto w-full pt-5 pb-1">
                                <button onClick={handleReset} className="w-full h-11 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors font-medium">
                                    New Render
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AuthModal open={phase === "authRequired"} onAuth={handleAuth} isCloneMode={true} />
            <SaveStyleModal
                open={saveStyleModalOpen}
                referencePreviews={refs.map(r => r.preview)}
                renderedImageUrl={renderedImageUrl}
                onClose={() => setSaveStyleModalOpen(false)}
                onSave={async (name, thumbnailUrl) => {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session) return;
                    await supabase.from("style_requests").insert({ user_id: session.user.id, title: name, sample_urls: [thumbnailUrl], status: "saved" });
                    setSaveStyleModalOpen(false);
                    toast.success(`"${name}" saved to your styles!`);
                }}
            />
        </div>
    );
}
