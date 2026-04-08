"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Image, LogOut, MessageSquarePlus, Plus, X, PenLine, Layers } from "lucide-react";
import { FeedbackRequestModal } from "@/components/FeedbackRequestModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

type Render = Tables<"renders">;
type Tab = "renders" | "edits" | "compositions";

interface Edit {
  id: string;
  user_id: string;
  title: string;
  original_file_name: string;
  original_image_path: string;
  result_image_path: string | null;
  regions_json: unknown;
  created_at: string;
  updated_at: string;
}

interface ComposerSession {
  id: string;
  user_id: string;
  title: string;
  base_sketch_path: string | null;
  regions_json: unknown;
  variations_json: unknown;
  created_at: string;
  updated_at: string;
}

const isStoragePath = (val: string) => !val.startsWith("http") && !val.startsWith("data:");

interface ContentProps {
  isMobileMenu?: boolean;
  renders: Render[];
  signedUrls: Record<string, string>;
  loading: boolean;
  isGenerating: boolean;
  edits: Edit[];
  editsLoading: boolean;
  editThumbUrls: Record<string, string>;
  composerSessions: ComposerSession[];
  composerSessionsLoading: boolean;
  composerThumbUrls: Record<string, string>;
  onNewRender?: () => void;
  onMobileClose?: () => void;
  onViewGenerating?: () => void;
  onSelectRender: (render: Render) => void;
  onSelectEdit: (edit: Edit) => void;
  onSelectComposerSession: (session: ComposerSession) => void;
  onLogout: () => void;
  formatDate: (dateStr: string) => string;
}

function Content({
  isMobileMenu = false,
  renders,
  signedUrls,
  loading,
  isGenerating,
  edits,
  editsLoading,
  editThumbUrls,
  composerSessions,
  composerSessionsLoading,
  composerThumbUrls,
  onNewRender,
  onMobileClose,
  onViewGenerating,
  onSelectRender,
  onSelectEdit,
  onSelectComposerSession,
  onLogout,
  formatDate,
}: ContentProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("renders");

  const TAB_LABELS: { key: Tab; label: string }[] = [
    { key: "renders", label: "Renders" },
    { key: "edits", label: "Edits" },
    { key: "compositions", label: "Compositions" },
  ];

  return (
    <>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 border-b border-sidebar-border shrink-0 ${isMobileMenu ? "py-5" : "py-4"}`}>
        <span className={`font-display font-semibold ${isMobileMenu ? "text-base" : "text-sm"}`}>History</span>
        {isMobileMenu && (
          <button
            onClick={onMobileClose}
            className="flex items-center justify-center w-8 h-8 rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* New Render button */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <button
          onClick={() => { onNewRender?.(); onMobileClose?.(); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sidebar-foreground text-sidebar font-display font-semibold text-sm hover:bg-sidebar-foreground/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Render
        </button>
      </div>

      {/* Tab bar */}
      <div className="px-3 pt-2 pb-0 shrink-0 flex gap-1">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              tab === key
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {/* ── Renders ── */}
          {tab === "renders" && (
            loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse aspect-square rounded-lg bg-sidebar-accent" />
                ))}
              </div>
            ) : renders.length === 0 && !isGenerating ? (
              <div className="text-center py-10 px-4">
                <Image className="w-8 h-8 mx-auto mb-3 text-sidebar-foreground/30" />
                <p className="text-xs text-sidebar-foreground/50">
                  No renders yet. Upload a floor plan and generate your first render!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {isGenerating && (
                  <button
                    onClick={onViewGenerating}
                    className="aspect-square rounded-lg bg-sidebar-accent/40 animate-pulse hover:bg-sidebar-accent/60 transition-colors cursor-pointer"
                  />
                )}
                {renders.map((render) => {
                  const thumbPath = render.thumbnail_path;
                  const thumbnailReady = !!thumbPath;
                  const imgSrc = thumbPath && isStoragePath(thumbPath)
                    ? signedUrls[thumbPath]
                    : null;
                  return (
                    <button
                      key={render.id}
                      onClick={() => {
                        onSelectRender(render);
                        onMobileClose?.();
                      }}
                      className="relative aspect-square rounded-lg overflow-hidden bg-sidebar-accent border border-sidebar-border group"
                    >
                      {!thumbnailReady ? (
                        <div className="w-full h-full animate-pulse bg-sidebar-accent" />
                      ) : imgSrc ? (
                        <img src={imgSrc} alt={render.style_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="w-5 h-5 text-sidebar-foreground/30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-left">
                        <p className="text-xs font-semibold text-white truncate leading-tight">{render.style_name}</p>
                        <p className="text-[10px] text-white/60 mt-0.5">{formatDate(render.created_at)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* ── Edits ── */}
          {tab === "edits" && (
            editsLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse aspect-square rounded-lg bg-sidebar-accent" />
                ))}
              </div>
            ) : edits.length === 0 ? (
              <div className="text-center py-10 px-4">
                <PenLine className="w-8 h-8 mx-auto mb-3 text-sidebar-foreground/30" />
                <p className="text-xs text-sidebar-foreground/50">
                  No edits yet. Use <span className="font-semibold">Edit a Render</span> to mark changes and regenerate.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {edits.map((edit) => {
                  const storagePath = edit.original_image_path;
                  const imgSrc = (storagePath && editThumbUrls[storagePath])
                    ? editThumbUrls[storagePath]
                    : (storagePath?.startsWith("data:") ? storagePath : null);
                  return (
                    <button
                      key={edit.id}
                      onClick={() => { onSelectEdit(edit); onMobileClose?.(); }}
                      className="relative aspect-square rounded-lg overflow-hidden bg-sidebar-accent border border-sidebar-border group"
                    >
                      {imgSrc ? (
                        <img src={imgSrc} alt={edit.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <PenLine className="w-5 h-5 text-sidebar-foreground/30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-left">
                        <p className="text-xs font-semibold text-white truncate leading-tight">{edit.title}</p>
                        <p className="text-[10px] text-white/60 mt-0.5">{formatDate(edit.updated_at)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* ── Compositions (Composer sessions) ── */}
          {tab === "compositions" && (
            composerSessionsLoading ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse aspect-square rounded-lg bg-sidebar-accent" />
                ))}
              </div>
            ) : composerSessions.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Layers className="w-8 h-8 mx-auto mb-3 text-sidebar-foreground/30" />
                <p className="text-xs text-sidebar-foreground/50">
                  No compositions yet. Use <span className="font-semibold">Composer</span> to start a mood board.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {composerSessions.map((session) => {
                  // Prefer last-generated variation as thumbnail; fall back to sketch
                  const variationPath = (() => {
                    try {
                      const vj = session.variations_json as any;
                      const history = vj?.history;
                      if (Array.isArray(history) && history.length > 0) {
                        const lastSet = history[history.length - 1];
                        const sp = lastSet?.variations?.[0]?.storagePath;
                        if (sp && isStoragePath(sp)) return sp;
                      }
                    } catch { return null; }
                    return null;
                  })();
                  const sketchPath = session.base_sketch_path;
                  const imgSrc = variationPath
                    ? composerThumbUrls[variationPath]
                    : sketchPath
                      ? isStoragePath(sketchPath)
                        ? composerThumbUrls[sketchPath]
                        : sketchPath
                      : null;
                  return (
                    <button
                      key={session.id}
                      onClick={() => { onSelectComposerSession(session); onMobileClose?.(); }}
                      className="relative aspect-square rounded-lg overflow-hidden bg-sidebar-accent border border-sidebar-border group"
                    >
                      {imgSrc ? (
                        <img src={imgSrc} alt={session.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Layers className="w-5 h-5 text-sidebar-foreground/30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-left">
                        <p className="text-xs font-semibold text-white truncate leading-tight">{session.title}</p>
                        <p className="text-[10px] text-white/60 mt-0.5">{formatDate(session.updated_at)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </ScrollArea>

      {/* Logout + Feedback */}
      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
        <button
          onClick={() => setFeedbackOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <MessageSquarePlus className="w-4 h-4" />
          Feedback or feature request
        </button>
      </div>
      <FeedbackRequestModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}

interface RenderHistoryProps {
  onSelectRender: (render: Render) => void;
  onLogout: () => void;
  onViewGenerating?: () => void;
  onNewRender?: () => void;
  isGenerating?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  overlayOpen?: boolean;
  onOverlayClose?: () => void;
}

export function RenderHistory({
  onSelectRender,
  onLogout,
  onViewGenerating,
  onNewRender,
  isGenerating = false,
  mobileOpen = false,
  onMobileClose,
  overlayOpen = false,
  onOverlayClose,
}: RenderHistoryProps) {
  const router = useRouter();
  const [renders, setRenders] = useState<Render[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const signedUrlsRef = useState<Set<string>>(() => new Set())[0];
  const [loading, setLoading] = useState(true);

  // Edits (from Edit a Render workflow → compositions table)
  const [edits, setEdits] = useState<Edit[]>([]);
  const [editsLoading, setEditsLoading] = useState(true);
  const [editThumbUrls, setEditThumbUrls] = useState<Record<string, string>>({});

  // Composer sessions (Composer workflow → composer_sessions table)
  const [composerSessions, setComposerSessions] = useState<ComposerSession[]>([]);
  const [composerSessionsLoading, setComposerSessionsLoading] = useState(true);
  const [composerThumbUrls, setComposerThumbUrls] = useState<Record<string, string>>({});

  const generateSignedUrls = async (list: Render[]) => {
    // Only sign thumbnail_path — rendered_image_path is signed by the render page when needed
    const newPaths = list
      .map((r) => r.thumbnail_path)
      .filter((p): p is string => !!p && isStoragePath(p) && !signedUrlsRef.has(p));
    const allPaths = [...new Set(newPaths)];
    if (allPaths.length === 0) return;

    allPaths.forEach((p) => signedUrlsRef.add(p));
    const { data } = await supabase.storage.from("floor-plans").createSignedUrls(allPaths, 3600);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((item) => { if (item.signedUrl && item.path) map[item.path] = item.signedUrl; });
      setSignedUrls((prev) => ({ ...prev, ...map }));
    }
  };

  const generateEditThumbUrls = async (list: Edit[]) => {
    const storagePaths = list
      .map((c) => c.original_image_path)
      .filter((p) => p && !p.startsWith("data:") && !p.startsWith("http"));
    if (storagePaths.length === 0) return;
    const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrls(storagePaths as string[], 3600);
    if (signed) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const map: Record<string, string> = {};
      signed.forEach((item) => {
        if (item.signedUrl && item.path) {
          map[item.path] = item.signedUrl.startsWith("http")
            ? item.signedUrl
            : `${supabaseUrl}/storage/v1${item.signedUrl}`;
        }
      });
      setEditThumbUrls((prev) => ({ ...prev, ...map }));
    }
  };

  const generateComposerThumbUrls = async (list: ComposerSession[]) => {
    // Prefer first variation image; fall back to base sketch
    const storagePaths: string[] = [];
    for (const s of list) {
      const variationPath = (() => {
        try {
          const vj = s.variations_json as any;
          const history = vj?.history;
          if (Array.isArray(history) && history.length > 0) {
            const lastSet = history[history.length - 1];
            const sp = lastSet?.variations?.[0]?.storagePath;
            if (sp && isStoragePath(sp)) return sp;
          }
        } catch { /* ignore */ }
        return null;
      })();
      const sketchPath = s.base_sketch_path;
      const preferred = variationPath ?? (sketchPath && isStoragePath(sketchPath) ? sketchPath : null);
      if (preferred) storagePaths.push(preferred);
    }
    if (storagePaths.length === 0) return;
    const { data: signed } = await supabase.storage.from("floor-plans").createSignedUrls(storagePaths, 3600);
    if (signed) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      const map: Record<string, string> = {};
      signed.forEach((item) => {
        if (item.signedUrl && item.path) {
          map[item.path] = item.signedUrl.startsWith("http")
            ? item.signedUrl
            : `${supabaseUrl}/storage/v1${item.signedUrl}`;
        }
      });
      setComposerThumbUrls((prev) => ({ ...prev, ...map }));
    }
  };

  useEffect(() => {
    const fetchRenders = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("renders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      const list = data || [];
      setRenders(list);
      setLoading(false);
      generateSignedUrls(list);
    };

    const fetchEdits = async () => {
      setEditsLoading(true);
      const { data } = await (supabase.from as any)("compositions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);
      const list: Edit[] = data || [];
      setEdits(list);
      setEditsLoading(false);
      generateEditThumbUrls(list);
    };

    const fetchComposerSessions = async () => {
      setComposerSessionsLoading(true);
      const { data } = await (supabase.from as any)("composer_sessions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);
      const list: ComposerSession[] = data || [];
      setComposerSessions(list);
      setComposerSessionsLoading(false);
      generateComposerThumbUrls(list);
    };

    fetchRenders();
    fetchEdits();
    fetchComposerSessions();

    const rendersChannel = supabase
      .channel("renders-history")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "renders" }, (payload) => {
        const newRender = payload.new as Render;
        setRenders((prev) => {
          if (prev.some((r) => r.id === newRender.id)) return prev;
          generateSignedUrls([newRender]);
          return [newRender, ...prev];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "renders" }, (payload) => {
        const updated = payload.new as Render;
        setRenders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        // Only sign if thumbnail_path is new (not already signed)
        if (updated.thumbnail_path && isStoragePath(updated.thumbnail_path) && !signedUrlsRef.has(updated.thumbnail_path)) {
          generateSignedUrls([updated]);
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "renders" }, (payload) => {
        const deleted = payload.old as Render;
        setRenders((prev) => prev.filter((r) => r.id !== deleted.id));
      })
      .subscribe();

    const editsChannel = supabase
      .channel("edits-history")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "compositions" }, (payload) => {
        const newEdit = payload.new as Edit;
        setEdits((prev) => {
          if (prev.some((c) => c.id === newEdit.id)) return prev;
          generateEditThumbUrls([newEdit]);
          return [newEdit, ...prev];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "compositions" }, (payload) => {
        const updated = payload.new as Edit;
        setEdits((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "compositions" }, (payload) => {
        const deleted = payload.old as Edit;
        setEdits((prev) => prev.filter((c) => c.id !== deleted.id));
      })
      .subscribe();

    const composerChannel = supabase
      .channel("composer-sessions-history")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "composer_sessions" }, (payload) => {
        const newSession = payload.new as ComposerSession;
        setComposerSessions((prev) => {
          if (prev.some((s) => s.id === newSession.id)) return prev;
          generateComposerThumbUrls([newSession]);
          return [newSession, ...prev];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "composer_sessions" }, (payload) => {
        const updated = payload.new as ComposerSession;
        setComposerSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "composer_sessions" }, (payload) => {
        const deleted = payload.old as ComposerSession;
        setComposerSessions((prev) => prev.filter((s) => s.id !== deleted.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(rendersChannel);
      supabase.removeChannel(editsChannel);
      supabase.removeChannel(composerChannel);
    };
  }, []);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const handleSelectEdit = (edit: Edit) => {
    router.push(`/edit?composition=${edit.id}`);
  };

  const handleSelectComposerSession = (session: ComposerSession) => {
    router.push(`/composer?session=${session.id}`);
  };

  const sharedProps: ContentProps = {
    renders, signedUrls, loading, isGenerating,
    edits, editsLoading, editThumbUrls,
    composerSessions, composerSessionsLoading, composerThumbUrls,
    onNewRender, onMobileClose: onOverlayClose ?? onMobileClose, onViewGenerating,
    onSelectRender,
    onSelectEdit: handleSelectEdit,
    onSelectComposerSession: handleSelectComposerSession,
    onLogout, formatDate,
  };

  return (
    <>
      {/* Overlay sidebar — slides in from left on desktop */}
      <AnimatePresence>
        {overlayOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shadow-2xl"
          >
            <Content {...sharedProps} isMobileMenu={true} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile fullscreen menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="md:hidden fixed inset-0 z-50 bg-sidebar text-sidebar-foreground flex flex-col"
          >
            <Content {...sharedProps} isMobileMenu={true} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
