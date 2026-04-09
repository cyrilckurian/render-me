"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Download, ImagePlus, X, AlertTriangle, CircleCheck, Bookmark, Menu, Images, ArrowLeft, Trash2, MoreVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/lib/sidebar-context";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    if (count === 0) return null;
    const pct = Math.round((count / MAX_REFS) * 100);

    // Tier definitions matching the reference design
    const tier =
        count >= 8 ? {
            label: "Excellent accuracy",
            barColor: "bg-emerald-500",
            iconColor: "text-emerald-500",
            Icon: CircleCheck,
            tip: "Perfect! The AI has plenty of references to nail your style.",
        } : count >= 6 ? {
            label: "Good accuracy",
            barColor: "bg-blue-500",
            iconColor: "text-blue-500",
            Icon: CircleCheck,
            tip: "Nice! The AI has enough data to capture your style well.",
        } : count >= 3 ? {
            label: "Medium accuracy",
            barColor: "bg-orange-500",
            iconColor: "text-orange-500",
            Icon: AlertTriangle,
            tip: "Getting better! More images improve style accuracy.",
        } : {
            label: "Low accuracy",
            barColor: "bg-red-500",
            iconColor: "text-red-500",
            Icon: AlertTriangle,
            tip: "Add more references for better results.",
        };

    return (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <tier.Icon className={`w-3.5 h-3.5 ${tier.iconColor}`} />
                    <span className="text-xs font-semibold text-foreground">{tier.label}</span>
                </div>
                <span className="text-xs text-muted-foreground">{count}/{MAX_REFS} images</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <motion.div
                    className={`h-full rounded-full ${tier.barColor}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: "spring", damping: 20, stiffness: 200 }}
                />
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">{tier.tip}</p>
        </motion.div>
    );
}

export default function ClonePage() {
    const router = useRouter();
    const { openOverlay, isLoggedIn, userId } = useSidebar();

    const [refs, setRefs] = useState<{ file: File; preview: string; base64: string }[]>([]);
    const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
    const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
    const [floorPlanBase64, setFloorPlanBase64] = useState<string | null>(null);
    const [floorPlanIsPdf, setFloorPlanIsPdf] = useState(false);
    const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
    const [phase, setPhase] = useState<"workspace" | "generating" | "authRequired" | "rendering" | "results">(
        typeof window !== "undefined" && sessionStorage.getItem(PENDING_CLONE_KEY) ? "rendering" : "workspace"
    );
    const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);
    const [renderName, setRenderName] = useState<string>("");
    const [shouldAutoRender, setShouldAutoRender] = useState(false);
    const [saveStyleModalOpen, setSaveStyleModalOpen] = useState(false);
    const [refsModalOpen, setRefsModalOpen] = useState(false);
    const [extractedStylePrompt, setExtractedStylePrompt] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [phase]);


    useEffect(() => {
        const raw = sessionStorage.getItem(PENDING_CLONE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw) as { referenceImages: { base64: string; preview: string }[]; floorPlanBase64?: string; floorPlanPreview?: string };
                sessionStorage.removeItem(PENDING_CLONE_KEY);

                if (!parsed.floorPlanBase64 || !parsed.referenceImages || parsed.referenceImages.length === 0) {
                    throw new Error("Missing required clone data");
                }

                setRefs(parsed.referenceImages.map(r => ({ ...r, file: new File([], "ref.png") })));
                if (parsed.floorPlanBase64) setFloorPlanBase64(parsed.floorPlanBase64);
                if (parsed.floorPlanPreview) setFloorPlanPreview(parsed.floorPlanPreview);
                setShouldAutoRender(true);
                setPhase("rendering"); // Set phase immediately to show progress bar
            } catch (err: any) {
                console.error("Failed to restore pending clone:", err);
                toast.error("Failed to resume clone: " + (err.message || "Unknown error"));
                sessionStorage.removeItem(PENDING_CLONE_KEY);
                setPhase("workspace");
            }
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
        setPhase("rendering");
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { setPhase("authRequired"); return; }
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
            setRenderedImageUrl(data.imageUrl);
            if (data.renderId) {
                setCurrentRenderId(data.renderId);
                if (data.originalPath) {
                    const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(data.originalPath, 3600);
                    if (signed?.signedUrl) setOriginalImageUrl(signed.signedUrl);
                }
            }
            setExtractedStylePrompt(data.extractedStylePrompt || null);
            setRenderName("Cloned Style Render");
            setPhase("results");
            setTimeout(() => setSaveStyleModalOpen(true), 800);
        } catch (e: any) {
            toast.error(e.message || "Failed to generate rendering. Please try again.");
            setPhase("workspace");
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
        else {
            const saved = savePendingClone();
            if (saved) {
                setPhase("generating");
                setTimeout(() => setPhase("authRequired"), 3500);
            }
        }
    }, [isLoggedIn, floorPlanBase64, refs, generateRender, savePendingClone]);

    const handleAuth = useCallback(() => { generateRender(); }, [generateRender]);

    const handleReset = useCallback(() => {
        refs.forEach(r => URL.revokeObjectURL(r.preview));
        setRefs([]); setFloorPlanFile(null); setFloorPlanPreview(null); setFloorPlanBase64(null);
        setPhase("workspace"); setRenderedImageUrl(null); setOriginalImageUrl(null); setCurrentRenderId(null); setRenderName("");
    }, [refs]);

    const canGenerate = refs.length > 0 && !!floorPlanPreview;

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30 bg-background">
                <div className="flex items-center gap-2 h-8">
                    {isLoggedIn && (
                        <button
                            onClick={() => openOverlay()}
                            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <Menu className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => router.push("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                        <Home className="w-4 h-4" />
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
                                sessionStorage.setItem("auth_redirect", "/clone");
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
                                <div className="flex items-center gap-1">
                                    {refs.length > 0 && (
                                        <button
                                            onClick={() => setRefsModalOpen(true)}
                                            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-accent"
                                        >
                                            <Images className="w-4 h-4" />
                                            References
                                        </button>
                                    )}
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
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2"
                                                onClick={async () => {
                                                    if (!currentRenderId) return;
                                                    const { error } = await supabase.from("renders").delete().eq("id", currentRenderId);
                                                    if (error) toast.error("Failed to delete render."); else { toast.success("Render deleted."); handleReset(); }
                                                }}
                                            >
                                                <Trash2 className="w-4 h-4" /> Delete render
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
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
                            <div className="max-w-2xl mx-auto w-full pt-5 pb-1 flex flex-col gap-3">
                                <button
                                    onClick={() => setSaveStyleModalOpen(true)}
                                    className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Bookmark className="w-4 h-4" /> Save Style
                                </button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="w-full h-11 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors font-medium flex items-center justify-center gap-2">
                                            More options <MoreVertical className="w-3.5 h-3.5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-48">
                                        <DropdownMenuItem className="gap-2" onClick={handleReset}>
                                            <ArrowLeft className="w-4 h-4" /> New Render
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2"
                                            onClick={async () => {
                                                if (!currentRenderId) return;
                                                const { error } = await supabase.from("renders").delete().eq("id", currentRenderId);
                                                if (error) toast.error("Failed to delete render."); else { toast.success("Render deleted."); handleReset(); }
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" /> Delete render
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AuthModal open={phase === "authRequired"} onAuth={handleAuth} isCloneMode={true} />

            {/* References Modal */}
            <AnimatePresence>
                {refsModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                        onClick={() => setRefsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-background rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                                <div className="flex items-center gap-2.5">
                                    <Images className="w-5 h-5 text-muted-foreground" />
                                    <span className="font-semibold text-base">Reference images · {refs.length}</span>
                                </div>
                                <button
                                    onClick={() => setRefsModalOpen(false)}
                                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                                {refs.map((r, i) => (
                                    <div key={i} className="aspect-square rounded-xl overflow-hidden bg-muted border border-border">
                                        <img src={r.preview} alt={`Reference ${i + 1}`} className="w-full h-full object-cover" />
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <SaveStyleModal
                open={saveStyleModalOpen}
                referencePreviews={refs.map(r => r.preview)}
                renderedImageUrl={renderedImageUrl}
                onClose={() => setSaveStyleModalOpen(false)}
                onSave={async (name, chosenThumbnailUrl) => {
                    if (!userId) return;

                    const isResultChosen = chosenThumbnailUrl === renderedImageUrl;
                    let sampleUrl = "";

                    if (isResultChosen && currentRenderId) {
                        // Result chosen — use already-created thumbnail_path (150px JPEG q50)
                        const { data: render } = await supabase.from("renders" as any)
                            .select("thumbnail_path, rendered_image_path")
                            .eq("id", currentRenderId)
                            .single();
                        sampleUrl = (render as any)?.thumbnail_path || (render as any)?.rendered_image_path || "";
                    } else {
                        // Reference image chosen — resize to 150px client-side and upload
                        try {
                            const thumb = await new Promise<Blob>((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => {
                                    const canvas = document.createElement("canvas");
                                    const scale = 150 / img.width;
                                    canvas.width = 150;
                                    canvas.height = Math.round(img.height * scale);
                                    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                                    canvas.toBlob(b => b ? resolve(b) : reject(), "image/jpeg", 0.5);
                                };
                                img.onerror = reject;
                                img.src = chosenThumbnailUrl;
                            });
                            const thumbPath = `style-thumbs/${userId}/${crypto.randomUUID()}.jpg`;
                            const { error } = await supabase.storage.from("floor-plans").upload(thumbPath, thumb, { contentType: "image/jpeg" });
                            if (!error) sampleUrl = thumbPath;
                        } catch {
                            // Fall back to original reference path if resize fails
                            sampleUrl = chosenThumbnailUrl;
                        }
                    }

                    await supabase.from("style_requests" as any).insert({
                        user_id: userId,
                        title: name,
                        sample_urls: sampleUrl ? [sampleUrl] : [],
                        style_prompt: extractedStylePrompt || null,
                        status: "saved",
                    });
                    setSaveStyleModalOpen(false);
                    toast.success(`"${name}" saved to your styles!`);
                }}
            />
        </div>
    );
}
