"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RenderHistory } from "@/components/RenderHistory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

// NOTE: This file is kept for reference but DashboardLayout in src/app/dashboard-layout.tsx
// is now the active layout component for Next.js.
export function AppLayout({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session);
      if (!session) setMobileOpen(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSelectRender = useCallback(async (render: Tables<"renders">) => {
    router.push(`/render?id=${render.id}`);
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
        onViewGenerating={() => router.push("/render")}
        onNewRender={() => router.push("/")}
        isGenerating={isGenerating}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 md:ml-72">
        {children}
      </div>
    </div>
  );
}

