"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/PageLoader";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Exchange the PKCE code for a session, then redirect to saved destination
    supabase.auth.exchangeCodeForSession(window.location.search).finally(() => {
      const dest = localStorage.getItem("postAuthRedirect") || "/";
      localStorage.removeItem("postAuthRedirect");
      router.replace(dest);
    });
  }, [router]);

  return <PageLoader />;
}
