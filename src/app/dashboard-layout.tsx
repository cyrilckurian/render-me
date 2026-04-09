"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RenderHistory } from "@/components/RenderHistory";
import { supabase } from "@/integrations/supabase/client";
import { SidebarContext } from "@/lib/sidebar-context";
import type { Tables } from "@/integrations/supabase/types";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setIsLoggedIn(!!session);
            setUserId(session?.user?.id ?? null);
            if (event === "INITIAL_SESSION") setAuthReady(true);
            if (!session) { setMobileOpen(false); setOverlayOpen(false); }
            // After OAuth redirect, user may land on "/" with token in hash.
            // Redirect them to the intended destination (saved before OAuth) or /render.
            if (event === "SIGNED_IN" && typeof window !== "undefined" && window.location.pathname === "/") {
                const dest = sessionStorage.getItem("auth_redirect") || "/";
                sessionStorage.removeItem("auth_redirect");
                router.replace(dest);
            }
        });
        return () => subscription.unsubscribe();
    }, [router]);

    const handleSelectRender = useCallback(async (render: Tables<"renders">) => {
        router.push(`/render?id=${render.id}`);
        setOverlayOpen(false);
        setMobileOpen(false);
    }, [router]);

    const handleLogout = useCallback(async () => {
        await supabase.auth.signOut();
        router.push("/");
    }, [router]);

    return (
        <SidebarContext.Provider value={{ openOverlay: () => setOverlayOpen(true), isLoggedIn, userId, authReady, setIsGenerating }}>
            <div className="min-h-screen bg-background flex flex-col w-full">
                {isLoggedIn && (
                    <RenderHistory
                        onSelectRender={handleSelectRender}
                        onLogout={handleLogout}
                        onViewGenerating={() => { router.push("/render"); setOverlayOpen(false); }}
                        onNewRender={() => { router.push("/"); setOverlayOpen(false); setMobileOpen(false); }}
                        isGenerating={isGenerating}
                        mobileOpen={mobileOpen}
                        onMobileClose={() => setMobileOpen(false)}
                        overlayOpen={overlayOpen}
                        onOverlayClose={() => setOverlayOpen(false)}
                    />
                )}
                {/* Backdrop — only when overlay sidebar is open */}
                {overlayOpen && (
                    <div
                        className="fixed inset-0 z-40 bg-black/40"
                        onClick={() => setOverlayOpen(false)}
                    />
                )}
                <div className="flex-1 flex flex-col min-w-0">
                    {children}
                </div>
            </div>
        </SidebarContext.Provider>
    );
}
