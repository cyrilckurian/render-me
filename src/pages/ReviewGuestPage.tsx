"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, MessageSquare, Mic, MicOff,
  Square, Send, Loader2, Check, X, Volume2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ReviewLink = {
  id: string;
  project_id: string;
  reviewer_name: string;
  token: string;
};

type ReviewPage = {
  id: string;
  file_id: string;
  project_id: string;
  page_number: number;
  image_path: string;
};

type AnnotationRect = { x: number; y: number; width: number; height: number } | null;

type Comment = {
  id: string;
  reviewer_name: string;
  comment_text: string | null;
  voice_path: string | null;
  annotation_rect: AnnotationRect;
  page_id: string;
  created_at: string;
};

export default function ReviewGuestPage() {
  const params = useParams<{ projectId: string; token: string }>();
  const projectId = params?.projectId;
  const token = params?.token;

  // Auth state
  const [linkData, setLinkData] = useState<ReviewLink | null>(null);
  const [validating, setValidating] = useState(true);
  const [invalid, setInvalid] = useState(false);

  // Pages
  const [pages, setPages] = useState<ReviewPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loadingPages, setLoadingPages] = useState(true);

  // Annotation drawing
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<AnnotationRect>(null);
  const [drawMode, setDrawMode] = useState(false);

  // Comment form
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Voice recording
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // My comments on this page
  const [myComments, setMyComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const currentPage = pages[pageIndex] || null;

  // ─── Validate token ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId || !token) { setInvalid(true); setValidating(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("review_links" as any)
        .select("*")
        .eq("project_id", projectId)
        .eq("token", token)
        .single();
      if (error || !data) { setInvalid(true); setValidating(false); return; }
      setLinkData(data as unknown as ReviewLink);
      setValidating(false);
    })();
  }, [projectId, token]);

  // ─── Load pages ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!linkData) return;
    (async () => {
      setLoadingPages(true);
      const { data, error } = await supabase
        .from("review_pages" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at");
      if (error || !data) { setLoadingPages(false); return; }
      const pagesData = data as unknown as ReviewPage[];
      setPages(pagesData);

      // Pre-fetch signed URLs for all pages
      const urls: Record<string, string> = {};
      await Promise.all(
        pagesData.map(async (p) => {
          const { data: signed } = await supabase.storage
            .from("review-files")
            .createSignedUrl(p.image_path, 60 * 60 * 2);
          if (signed?.signedUrl) urls[p.id] = signed.signedUrl;
        })
      );
      setImageUrls(urls);
      setLoadingPages(false);
    })();
  }, [linkData]);

  // ─── Load my comments for current page ───────────────────────────────────
  useEffect(() => {
    if (!currentPage || !linkData) return;
    loadMyComments(currentPage.id);
  }, [currentPage?.id, linkData?.id]);

  async function loadMyComments(pageId: string) {
    setLoadingComments(true);
    const { data } = await supabase
      .from("review_comments" as any)
      .select("*")
      .eq("page_id", pageId)
      .eq("link_id", linkData!.id)
      .order("created_at");
    setMyComments((data as unknown as Comment[]) || []);
    setLoadingComments(false);
  }

  // ─── Drawing handlers ─────────────────────────────────────────────────────
  function getRelativePos(e: React.MouseEvent<HTMLDivElement>) {
    const rect = imageContainerRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!drawMode) return;
    const pos = getRelativePos(e);
    setDrawStart(pos);
    setCurrentRect(null);
    setDrawing(true);
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drawing || !drawStart) return;
    const pos = getRelativePos(e);
    setCurrentRect({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      width: Math.abs(pos.x - drawStart.x),
      height: Math.abs(pos.y - drawStart.y),
    });
  }

  function onMouseUp() {
    if (!drawing) return;
    setDrawing(false);
    if (currentRect && currentRect.width > 1 && currentRect.height > 1) {
      setDrawMode(false);
      setShowCommentForm(true);
    } else {
      setCurrentRect(null);
    }
  }

  // Touch equivalents
  function getTouchRelativePos(e: React.TouchEvent<HTMLDivElement>) {
    const rect = imageContainerRef.current!.getBoundingClientRect();
    const touch = e.touches[0] || e.changedTouches[0];
    return {
      x: ((touch.clientX - rect.left) / rect.width) * 100,
      y: ((touch.clientY - rect.top) / rect.height) * 100,
    };
  }

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!drawMode) return;
    e.preventDefault();
    const pos = getTouchRelativePos(e);
    setDrawStart(pos);
    setCurrentRect(null);
    setDrawing(true);
  }

  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!drawing || !drawStart) return;
    e.preventDefault();
    const pos = getTouchRelativePos(e);
    setCurrentRect({
      x: Math.min(drawStart.x, pos.x),
      y: Math.min(drawStart.y, pos.y),
      width: Math.abs(pos.x - drawStart.x),
      height: Math.abs(pos.y - drawStart.y),
    });
  }

  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    e.preventDefault();
    onMouseUp();
  }

  // ─── Voice recording ──────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function clearAudio() {
    setAudioBlob(null);
    setAudioUrl(null);
  }

  // ─── Submit comment ───────────────────────────────────────────────────────
  async function submitComment() {
    if (!currentPage || !linkData) return;
    if (!commentText.trim() && !audioBlob) { toast.error("Add a comment or voice note"); return; }
    setSubmitting(true);

    let voicePath: string | null = null;

    // Upload voice recording if present
    if (audioBlob) {
      const path = `guest/${linkData.id}/${currentPage.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from("review-files").upload(path, audioBlob, { contentType: "audio/webm" });
      if (error) { toast.error("Failed to upload voice note"); setSubmitting(false); return; }
      voicePath = path;
    }

    const { error } = await supabase.from("review_comments" as any).insert({
      page_id: currentPage.id,
      project_id: currentPage.project_id,
      link_id: linkData.id,
      reviewer_name: linkData.reviewer_name,
      comment_text: commentText.trim() || null,
      voice_path: voicePath,
      annotation_rect: currentRect || null,
    });

    if (error) { toast.error("Failed to submit comment"); setSubmitting(false); return; }

    toast.success("Feedback submitted!");
    setCommentText("");
    clearAudio();
    setCurrentRect(null);
    setShowCommentForm(false);
    loadMyComments(currentPage.id);
    setSubmitting(false);
  }

  // ─── Navigation ───────────────────────────────────────────────────────────
  function goNext() {
    setPageIndex((i) => Math.min(i + 1, pages.length - 1));
    setCurrentRect(null);
    setShowCommentForm(false);
    setDrawMode(false);
  }

  function goPrev() {
    setPageIndex((i) => Math.max(i - 1, 0));
    setCurrentRect(null);
    setShowCommentForm(false);
    setDrawMode(false);
  }

  // ─── Voice playback signed URL ────────────────────────────────────────────
  const [voiceUrls, setVoiceUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    myComments.forEach(async (c) => {
      if (c.voice_path && !voiceUrls[c.id]) {
        const { data } = await supabase.storage.from("review-files").createSignedUrl(c.voice_path, 3600);
        if (data?.signedUrl) setVoiceUrls((prev) => ({ ...prev, [c.id]: data.signedUrl }));
      }
    });
  }, [myComments]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
            <X className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="text-xl font-display font-bold text-foreground">Invalid review link</h1>
          <p className="text-sm text-muted-foreground">This link is invalid or has been removed. Please ask the designer for a new link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between shrink-0 bg-background sticky top-0 z-30">
        <p className="text-sm font-semibold text-foreground">Design Review</p>
        <div className="flex items-center gap-2">
          {pages.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {pageIndex + 1} / {pages.length}
            </span>
          )}
        </div>
      </header>

      {loadingPages ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">No pages uploaded yet.</p>
            <p className="text-xs text-muted-foreground">Check back once the designer adds content.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Image viewer */}
          <div className="flex-1 relative flex items-center justify-center bg-muted/30 overflow-hidden min-h-0">
            <div
              ref={imageContainerRef}
              className="relative max-w-full max-h-[65vh] w-full select-none"
              style={{ cursor: drawMode ? "crosshair" : "default" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {imageUrls[currentPage!.id] ? (
                <img
                  src={imageUrls[currentPage!.id]}
                  alt={`Page ${currentPage!.page_number}`}
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-64 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Draw overlay */}
              {currentRect && (
                <div
                  className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                  style={{
                    left: `${currentRect.x}%`,
                    top: `${currentRect.y}%`,
                    width: `${currentRect.width}%`,
                    height: `${currentRect.height}%`,
                  }}
                />
              )}

              {/* Existing annotations */}
              {myComments.filter((c) => c.annotation_rect).map((c) => (
                <div
                  key={c.id}
                  className="absolute border-2 border-primary/60 bg-primary/5 pointer-events-none"
                  style={{
                    left: `${(c.annotation_rect as any).x}%`,
                    top: `${(c.annotation_rect as any).y}%`,
                    width: `${(c.annotation_rect as any).width}%`,
                    height: `${(c.annotation_rect as any).height}%`,
                  }}
                />
              ))}
            </div>

            {/* Left/Right navigation */}
            {pages.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  disabled={pageIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background border border-border shadow flex items-center justify-center disabled:opacity-30 hover:bg-accent transition-colors z-10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goNext}
                  disabled={pageIndex === pages.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background border border-border shadow flex items-center justify-center disabled:opacity-30 hover:bg-accent transition-colors z-10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Action bar */}
          <div className="border-t border-border bg-background px-4 py-3 flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={drawMode ? "default" : "outline"}
              className="gap-1.5 text-xs"
              onClick={() => { setDrawMode((v) => !v); setCurrentRect(null); }}
            >
              <Square className="w-3.5 h-3.5" />
              {drawMode ? "Drawing… (drag to select)" : "Annotate region"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => { setCurrentRect(null); setShowCommentForm(true); }}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Comment on page
            </Button>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              {loadingComments ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span>{myComments.length} comment{myComments.length !== 1 ? "s" : ""} on this page</span>
              )}
            </div>
          </div>

          {/* Comment form */}
          <AnimatePresence>
            {showCommentForm && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="border-t border-border bg-background px-4 py-4 space-y-3"
              >
                {currentRect && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                    <Square className="w-3 h-3 text-primary" />
                    Annotated region selected
                    <button onClick={() => setCurrentRect(null)} className="ml-auto hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <Textarea
                  placeholder="Add your comment here…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                  autoFocus
                />

                {/* Voice recording */}
                <div className="flex items-center gap-2">
                  {!audioBlob ? (
                    <button
                      type="button"
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                      onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors select-none ${
                        recording
                          ? "bg-destructive text-white border-destructive animate-pulse"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      {recording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {recording ? "Release to stop" : "Hold to record"}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <audio src={audioUrl!} controls className="h-8 w-40 sm:w-48" />
                      <button onClick={clearAudio} className="text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { setShowCommentForm(false); setCurrentRect(null); clearAudio(); setCommentText(""); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="text-xs h-8 gap-1.5" onClick={submitComment} disabled={submitting || (!commentText.trim() && !audioBlob)}>
                      {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Submit
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* My comments list */}
          {myComments.length > 0 && !showCommentForm && (
            <div className="border-t border-border bg-background px-4 py-3 max-h-44 overflow-y-auto space-y-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Your comments on this page</p>
              {myComments.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  {c.annotation_rect && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      <Square className="w-2.5 h-2.5" /> Region annotated
                    </span>
                  )}
                  {c.comment_text && <p className="text-xs text-foreground">{c.comment_text}</p>}
                  {voiceUrls[c.id] && (
                    <audio src={voiceUrls[c.id]} controls className="h-7 w-full max-w-xs" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
