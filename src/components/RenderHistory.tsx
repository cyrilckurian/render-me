import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Image, LogOut, MessageSquarePlus, Plus, X } from "lucide-react";
import { FeedbackRequestModal } from "@/components/FeedbackRequestModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

type Render = Tables<"renders">;

const isStoragePath = (val: string) => !val.startsWith("http");

interface ContentProps {
  isMobileMenu?: boolean;
  renders: Render[];
  signedUrls: Record<string, string>;
  loading: boolean;
  isGenerating: boolean;
  onNewRender?: () => void;
  onMobileClose?: () => void;
  onViewGenerating?: () => void;
  onSelectRender: (render: Render) => void;
  onLogout: () => void;
  formatDate: (dateStr: string) => string;
}

function Content({
  isMobileMenu = false,
  renders,
  signedUrls,
  loading,
  isGenerating,
  onNewRender,
  onMobileClose,
  onViewGenerating,
  onSelectRender,
  onLogout,
  formatDate,
}: ContentProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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

      {/* New Render button — always visible below header */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <button
          onClick={() => { onNewRender?.(); onMobileClose?.(); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sidebar-foreground text-sidebar font-display font-semibold text-sm hover:bg-sidebar-foreground/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Render
        </button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading ? (
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
                const imgSrc = render.rendered_image_path
                  ? isStoragePath(render.rendered_image_path)
                    ? signedUrls[render.rendered_image_path]
                    : render.rendered_image_path
                  : null;
                return (
                  <button
                    key={render.id}
                    onClick={() => {
                      const resolvedPath = render.rendered_image_path;
                      const resolvedUrl = resolvedPath && isStoragePath(resolvedPath)
                        ? signedUrls[resolvedPath] ?? null
                        : resolvedPath;
                      onSelectRender({ ...render, rendered_image_path: resolvedUrl });
                      onMobileClose?.();
                    }}
                    className="relative aspect-square rounded-lg overflow-hidden bg-sidebar-accent border border-sidebar-border group"
                  >
                    {imgSrc ? (
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
}

export function RenderHistory({
  onSelectRender,
  onLogout,
  onViewGenerating,
  onNewRender,
  isGenerating = false,
  mobileOpen = false,
  onMobileClose,
}: RenderHistoryProps) {
  const [renders, setRenders] = useState<Render[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const generateSignedUrls = async (list: Render[]) => {
    const paths = list
      .filter((r) => r.rendered_image_path && isStoragePath(r.rendered_image_path))
      .map((r) => r.rendered_image_path as string);
    if (paths.length === 0) return;
    const { data } = await supabase.storage.from("floor-plans").createSignedUrls(paths, 3600);
    if (data) {
      const map: Record<string, string> = {};
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
      data.forEach((item) => {
        if (item.signedUrl && item.path) {
          const fullUrl = item.signedUrl.startsWith("http")
            ? item.signedUrl
            : `${supabaseUrl}/storage/v1${item.signedUrl}`;
          map[item.path] = fullUrl;
        }
      });
      setSignedUrls((prev) => ({ ...prev, ...map }));
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

    fetchRenders();

    const channel = supabase
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
        setRenders((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        );
        generateSignedUrls([updated]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "renders" }, (payload) => {
        const deleted = payload.old as Render;
        setRenders((prev) => prev.filter((r) => r.id !== deleted.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

  const sharedProps: ContentProps = {
    renders, signedUrls, loading, isGenerating,
    onNewRender, onMobileClose, onViewGenerating,
    onSelectRender, onLogout, formatDate,
  };

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex fixed left-0 top-0 bottom-0 z-40 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-col shadow-xl">
        <Content {...sharedProps} />
      </div>

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
