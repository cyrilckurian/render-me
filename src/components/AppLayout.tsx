"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RenderHistory } from "@/components/RenderHistory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// NOTE: This is the AppLayout component adapted for Next.js.
// DashboardLayout in src/app/dashboard-layout.tsx is also used as an active layout.
export function AppLayout({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [isGenerating, _setIsGenerating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
      if (!session) { setMobileOpen(false); setOverlayOpen(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSelectRender = useCallback(async (render: Tables<"renders">) => {
    router.push(`/render?id=${render.id}`);
    setOverlayOpen(false);
  }, [router]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
  }, [router]);

  if (!isLoggedIn) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-row w-full">
      <RenderHistory
        onSelectRender={handleSelectRender}
        onLogout={handleLogout}
        onViewGenerating={() => { router.push("/render"); setOverlayOpen(false); }}
        onNewRender={() => { router.push("/"); setOverlayOpen(false); }}
        isGenerating={isGenerating}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        overlayOpen={overlayOpen}
        onOverlayClose={() => setOverlayOpen(false)}
      />
      {/* Backdrop — only when overlay is open */}
      {overlayOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOverlayOpen(false)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 md:ml-72">
        {children}
      </div>
    </div>
  );
}
