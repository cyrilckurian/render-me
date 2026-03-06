"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, MoreVertical, Trash2, Menu, Loader2, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FloorPlanUpload } from "@/components/FloorPlanUpload";
import { PdfPagePicker } from "@/components/PdfPagePicker";
import { StyleCarousel } from "@/components/StyleCarousel";
import { AuthModal } from "@/components/AuthModal";
import { FeedbackModal } from "@/components/FeedbackModal";
import { GeneratingState } from "@/components/GeneratingState";
import { ImageCompareSlider } from "@/components/ImageCompareSlider";
// import { lovable } from "@/integrations/lovable"; // Removed Lovable
import { renderingStyles, type RenderingStyle } from "@/data/renderingStyles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { getRedirectUrl } from "@/lib/auth";

function RenderPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isGeneratingShared, setIsGeneratingShared] = useState(false);

    const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
    const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
    const [floorPlanBase64, setFloorPlanBase64] = useState<string | null>(null);
    const [floorPlanIsPdf, setFloorPlanIsPdf] = useState(false);
    const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
    const [savedCustomStyles, setSavedCustomStyles] = useState<RenderingStyle[]>([]);
    const [selectedStyle, setSelectedStyle] = useState<RenderingStyle | null>(null);
    const [phase, setPhase] = useState<"workspace" | "generating" | "authRequired" | "rendering" | "results">(
        typeof window !== "undefined" && sessionStorage.getItem("pendingRender") ? "rendering" : "workspace"
    );
    const [promptText, setPromptText] = useState("");
    const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);
    const [renderName, setRenderName] = useState<string>("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [shouldAutoRender, setShouldAutoRender] = useState(false);
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    const [thumbsFeedback, setThumbsFeedback] = useState<"up" | "down" | null>(null);
    const hasManuallyLoggedOut = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const PENDING_RENDER_KEY = "pendingRender";

    useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [phase]);

    useEffect(() => {
        const renderId = searchParams.get("id");
        if (renderId) {
            supabase.from("renders").select("*").eq("id", renderId).single().then(async ({ data: render }) => {
                if (!render) return;
                setPhase("results");
                setRenderedImageUrl(render.rendered_image_path); // Note: Should probably check for storage vs URL
                setOriginalImageUrl(null); // Will fill in below
                setCurrentRenderId(render.id);
                setRenderName(render.style_name || "Render");
                const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(render.floor_plan_path, 3600);
                if (signed?.signedUrl) setOriginalImageUrl(signed.signedUrl);
                if (render.rendered_image_path && !render.rendered_image_path.startsWith("http")) {
                    const { data: renderSigned } = await supabase.storage.from("floor-plans").createSignedUrl(render.rendered_image_path, 3600);
                    if (renderSigned?.signedUrl) setRenderedImageUrl(renderSigned.signedUrl);
                }
            });
            return;
        }

        const pending = sessionStorage.getItem(PENDING_RENDER_KEY);
        if (pending) {
            try {
                const parsed = JSON.parse(pending);
                const { base64, preview, prompt, styleId, fileName } = parsed;
                sessionStorage.removeItem(PENDING_RENDER_KEY);

                if (!base64 || !prompt) throw new Error("Missing required render data");

                const style = renderingStyles.find((s) => s.id === styleId) || null;
                setFloorPlanBase64(base64); setFloorPlanPreview(preview); setPromptText(prompt);
                setSelectedStyle(style); setShouldAutoRender(true);
                setPhase("rendering"); // Set phase immediately to show progress bar

                try {
                    const byteString = atob(base64.split(",")[1]);
                    const mimeString = base64.split(",")[0].split(":")[1].split(";")[0];
                    const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                    setFloorPlanFile(new File([ab], fileName || "floor-plan.png", { type: mimeString }));
                } catch (fileErr) {
                    console.error("Failed to reconstruct File object, but proceeding with base64:", fileErr);
                }
            } catch (err: any) {
                console.error("Failed to restore pending render:", err);
                toast.error("Failed to resume render: " + (err.message || "Unknown error"));
                sessionStorage.removeItem(PENDING_RENDER_KEY);
                setPhase("workspace");
            }
        }
    }, []);

    const applySession = useCallback((session: { user: { id: string } } | null) => {
        if (!session?.user) return;
        setIsLoggedIn(true);
        const userId = session.user.id;
        // Load saved custom styles
        supabase.from("style_requests").select("id, title, sample_urls, status").eq("user_id", userId).eq("status", "saved").then(async ({ data }) => {
            if (!data || data.length === 0) return;
            const loaded: RenderingStyle[] = await Promise.all(
                data.map(async (r) => {
                    const rawPath = (r.sample_urls as string[])[0] ?? "";
                    let image = rawPath;
                    if (rawPath && !rawPath.startsWith("data:") && !rawPath.startsWith("blob:") && !rawPath.startsWith("http")) {
                        const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(rawPath, 3600);
                        if (signed?.signedUrl) image = signed.signedUrl;
                    }
                    return { id: r.id, name: r.title, description: "Your saved style", prompt: "", image };
                })
            );
            setSavedCustomStyles(loaded);
        });
    }, []);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (hasManuallyLoggedOut.current) return;
            if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
                if (session?.user) setTimeout(() => applySession(session), 0); else setIsLoggedIn(false);
            } else if (event === "SIGNED_OUT") { setIsLoggedIn(false); }
        });
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!hasManuallyLoggedOut.current && session?.user) applySession(session);
        });
        return () => { subscription.unsubscribe(); };
    }, [applySession]);

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
    const handleRemoveUpload = useCallback(() => { setFloorPlanFile(null); setFloorPlanPreview(null); setFloorPlanBase64(null); setFloorPlanIsPdf(false); setPendingPdfFile(null); setSelectedStyle(null); setPromptText(""); }, []);

    const generateRender = useCallback(async (base64?: string, prompt?: string) => {
        const currentBase64 = base64 || floorPlanBase64;
        const currentPrompt = prompt || promptText;
        const isCustomStyle = selectedStyle && !selectedStyle.prompt;
        if (!currentBase64 || (!currentPrompt && !isCustomStyle)) return;
        setPhase("rendering"); setIsGenerating(true); setIsGeneratingShared(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { setPhase("authRequired"); setIsGenerating(false); setIsGeneratingShared(false); return; }

            // For custom (clone) styles, fetch reference images from storage
            let referenceImages: string[] | undefined;
            let effectivePrompt = currentPrompt;
            if (isCustomStyle && selectedStyle) {
                const { data: styleData } = await supabase
                    .from("style_requests")
                    .select("sample_urls")
                    .eq("id", selectedStyle.id)
                    .single();
                if (styleData?.sample_urls?.length) {
                    const refs = await Promise.all(
                        (styleData.sample_urls as string[]).map(async (path) => {
                            if (path.startsWith("data:") || path.startsWith("http")) return path;
                            const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(path, 300);
                            if (!signed?.signedUrl) return null;
                            // Fetch and convert to base64
                            const res = await fetch(signed.signedUrl);
                            const blob = await res.blob();
                            return new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                        })
                    );
                    referenceImages = refs.filter(Boolean) as string[];
                    effectivePrompt = `__CLONE_STYLE__ ${selectedStyle.name}`;
                }
            }

            const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/render-floor-plan`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    floorPlanBase64: currentBase64, prompt: effectivePrompt,
                    styleId: selectedStyle?.id || "custom", styleName: selectedStyle?.name || "Custom",
                    floorPlanName: floorPlanFile?.name || "floor-plan.png",
                    ...(referenceImages ? { referenceImages } : {}),
                }),
            });
            if (!response.ok) { const err = await response.json(); throw new Error(err.error || "Failed to generate rendering"); }
            const data = await response.json();
            setRenderedImageUrl(data.renderedBase64 || data.imageUrl);
            if (data.renderId && data.renderPath) {
                setCurrentRenderId(data.renderId);
                const { data: render } = await supabase.from("renders").select("floor_plan_path").eq("id", data.renderId).single();
                if (render?.floor_plan_path) {
                    const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrl(render.floor_plan_path, 3600);
                    if (signed?.signedUrl) setOriginalImageUrl(signed.signedUrl);
                }
            }
            setRenderName(selectedStyle?.name ? `${selectedStyle.name} Render` : "Custom Render");
            setPhase("results"); setIsGenerating(false); setIsGeneratingShared(false);
        } catch (e: any) {
            toast.error(e.message || "Failed to generate rendering. Please try again.");
            setPhase("workspace"); setIsGenerating(false); setIsGeneratingShared(false);
        }
    }, [floorPlanBase64, promptText, selectedStyle, floorPlanFile]);

    useEffect(() => {
        const isCustomStyle = selectedStyle && !selectedStyle.prompt;
        if (shouldAutoRender && isLoggedIn && floorPlanBase64 && (promptText || isCustomStyle)) {
            setShouldAutoRender(false);
            console.log("[Render] Auto-rendering started...");
            generateRender(floorPlanBase64, promptText);
        }
    }, [shouldAutoRender, isLoggedIn, floorPlanBase64, promptText, selectedStyle, generateRender]);

    useEffect(() => {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (supabaseUrl === "https://placeholder.supabase.co" && typeof window !== "undefined") {
            toast.error("Supabase URL is not configured. Please check your Vercel environment variables.");
        }
    }, [isLoggedIn]);

    const savePendingRender = useCallback((text: string): boolean => {
        if (!floorPlanBase64 || !floorPlanFile) return false;
        try {
            sessionStorage.setItem(PENDING_RENDER_KEY, JSON.stringify({ base64: floorPlanBase64, preview: floorPlanPreview, prompt: text, styleId: selectedStyle?.id || null, fileName: floorPlanFile.name }));
            return true;
        } catch { toast.error("Floor plan is too large to save. Please sign in first, then upload again."); return false; }
    }, [floorPlanBase64, floorPlanFile, floorPlanPreview, selectedStyle]);

    const handleGenerate = useCallback(() => {
        if (!promptText) return;
        if (isLoggedIn) { generateRender(floorPlanBase64 || undefined, promptText); }
        else {
            const saved = savePendingRender(promptText);
            if (saved) {
                setPhase("generating");
                setTimeout(() => setPhase("authRequired"), 3500);
            }
        }
    }, [isLoggedIn, floorPlanBase64, promptText, savePendingRender, generateRender]);

    const handleAuth = useCallback(() => { hasManuallyLoggedOut.current = false; setIsLoggedIn(true); generateRender(); }, [generateRender]);

    const handleReset = useCallback(() => {
        setFloorPlanFile(null); setFloorPlanPreview(null); setFloorPlanBase64(null);
        setSelectedStyle(null); setPhase("workspace"); setPromptText("");
        setRenderedImageUrl(null); setOriginalImageUrl(null); setCurrentRenderId(null); setRenderName("");
        setThumbsFeedback(null);
    }, []);

    const handleDeleteRender = useCallback(async () => {
        if (!currentRenderId) return;
        const { error } = await supabase.from("renders").delete().eq("id", currentRenderId);
        if (error) toast.error("Failed to delete render."); else { toast.success("Render deleted."); handleReset(); }
    }, [currentRenderId, handleReset]);

    const canGenerate = !!floorPlanPreview && !!selectedStyle;

    return (
        <div className="min-h-screen flex flex-col">
            <header className="border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30 bg-background">
                <div className="flex items-center gap-3 h-8">
                    <button onClick={() => router.push("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-display font-bold tracking-tight text-foreground">
                        {phase === "results" && renderName ? renderName : "Pick a Style"}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {!isLoggedIn && (
                        <button
                            onClick={() => {
                                if (floorPlanBase64 && promptText) savePendingRender(promptText);
                                supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: getRedirectUrl("/render") } });
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
                            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-10">
                                <div className="max-w-3xl mx-auto space-y-8">
                                    <div>
                                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Step 1 — Upload your floor plan</h2>
                                        {pendingPdfFile ? (
                                            <PdfPagePicker file={pendingPdfFile} onSelect={handlePdfPageSelected} onCancel={handlePdfPickerCancel} />
                                        ) : (
                                            <FloorPlanUpload preview={floorPlanPreview} isPdf={floorPlanIsPdf} fileName={floorPlanFile?.name} onUpload={handleUpload} onRemove={handleRemoveUpload} />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Step 2 — Choose a rendering style</h2>
                                        <StyleCarousel
                                            styles={[...savedCustomStyles, ...renderingStyles]} selectedId={selectedStyle?.id ?? null} pendingStyles={[]}
                                            onSelect={(style) => { setSelectedStyle(style); setPromptText(style.prompt); }}
                                            onDeselect={() => setSelectedStyle(null)}
                                            onClone={() => router.push("/clone")}
                                        />
                                    </div>
                                </div>
                            </div>
                            {canGenerate && (
                                <>
                                    <div className="hidden sm:block px-4 sm:px-6 pb-6 shrink-0">
                                        <div className="max-w-3xl mx-auto">
                                            <button onClick={handleGenerate} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 transition-colors">
                                                Generate {selectedStyle!.name} Render
                                            </button>
                                        </div>
                                    </div>
                                    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
                                        <button onClick={handleGenerate} className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-display font-semibold text-base shadow-xl hover:bg-primary/90 transition-colors pointer-events-auto">
                                            Generate {selectedStyle!.name} Render
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}

                    {(phase === "generating" || phase === "rendering") && (
                        <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center">
                            <GeneratingState
                                styleName={selectedStyle?.name ?? "Custom"}
                                initialProgress={phase === "rendering" ? 25 : 0}
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
                                    <button
                                        onClick={async () => {
                                            if (!renderedImageUrl) return;
                                            try {
                                                const res = await fetch(renderedImageUrl); const blob = await res.blob();
                                                const baseName = floorPlanFile?.name.replace(/\.[^.]+$/, "") || "floor_plan";
                                                const url = URL.createObjectURL(blob); const a = document.createElement("a");
                                                a.href = url; a.download = `${baseName}_${selectedStyle?.id || "custom"}.png`; a.click(); URL.revokeObjectURL(url);
                                            } catch { toast.error("Failed to download image."); }
                                        }}
                                        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors px-3 py-2 rounded-lg hover:bg-primary/10"
                                    >
                                        <Download className="w-4 h-4" /> Download
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const shareUrl = window.location.origin;
                                            const shareText = `Hey, check out this render I created in a few seconds using RenderMe.Live. Try it out: ${shareUrl}`;
                                            if (navigator.share && renderedImageUrl) {
                                                try {
                                                    const res = await fetch(renderedImageUrl); const blob = await res.blob();
                                                    const file = new File([blob], "render.png", { type: "image/png" });
                                                    await navigator.share({ title: "My RenderMe.Live render", text: shareText, files: [file] }); return;
                                                } catch { /* fall through */ }
                                            }
                                            try { await navigator.clipboard.writeText(shareText); toast.success("Share text copied to clipboard!"); }
                                            catch { toast.error("Could not share."); }
                                        }}
                                        className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Share"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2" onClick={handleDeleteRender}>
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
                                        <img src={renderedImageUrl} alt="Rendered floor plan" className="w-full block" />
                                    </div>
                                )}
                            </div>
                            <div className="max-w-2xl mx-auto w-full pt-5 pb-1 flex flex-col items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">How did this render turn out?</span>
                                    <button
                                        onClick={async () => {
                                            setThumbsFeedback("up");
                                            const { data: { session } } = await supabase.auth.getSession();
                                            await supabase.from("render_feedback" as never).insert({ render_id: currentRenderId, user_id: session?.user?.id || null, rating: "thumbs_up" } as never);
                                            toast.success("Glad you liked it! 🎉");
                                        }}
                                        className={cn("flex items-center justify-center w-9 h-9 rounded-lg transition-colors", thumbsFeedback === "up" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent")}
                                    >
                                        <ThumbsUp className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => { setThumbsFeedback("down"); setFeedbackModalOpen(true); }}
                                        className={cn("flex items-center justify-center w-9 h-9 rounded-lg transition-colors", thumbsFeedback === "down" ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:text-foreground hover:bg-accent")}
                                    >
                                        <ThumbsDown className="w-4 h-4" />
                                    </button>
                                </div>
                                <button onClick={handleReset} className="w-full h-11 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors font-medium">
                                    New Render
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AuthModal open={phase === "authRequired"} onAuth={handleAuth} isCloneMode={false} />
            <FeedbackModal open={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} renderId={currentRenderId} />
        </div>
    );
}

export default function RenderPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        }>
            <RenderPageContent />
        </Suspense>
    );
}
