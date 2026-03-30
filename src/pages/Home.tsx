"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// setMobileOpen is a no-op in Next.js standalone page context
const setMobileOpen = (_v: boolean) => {};

export default function Home() {
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setIsLoggedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.href });
  };

  const [email, setEmail] = useState("");
  const [details, setDetails] = useState("");
  const [allowContact, setAllowContact] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleFeatureRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !details.trim()) return;
    setSubmitting(true);
    try {
      await (supabase.from as any)("feature_requests").insert({
        email: email.trim(),
        details: details.trim(),
        allow_contact: allowContact,
      });
      toast.success("Thanks! We'll review your request.");
      setEmail("");
      setDetails("");
      setAllowContact(true);
    } catch {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30 bg-background">
        <div className="flex items-center gap-2.5">
          <img src="/favicon-new.png" alt="RenderMe.Live" className="w-8 h-8 rounded-lg" />
          <h1 className="text-lg font-display font-bold tracking-tight text-foreground">
            RenderMe.Live
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {!authLoading && !isLoggedIn && (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in
            </button>
          )}
          {isLoggedIn && (
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold tracking-tight text-foreground leading-tight">
            Client briefs will keep changing.
            <br />
            <span className="text-primary">Your timeline doesn't have to.</span>
          </h2>
          <p className="text-muted-foreground mt-4 text-base sm:text-lg max-w-md mx-auto">
            Upload a sketch, single-line plan, or CAD screenshot and get a client-ready render in seconds. Go to bed on time :)
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-5 w-full max-w-2xl">
          <motion.button
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45 }}
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/render")}
            className="group relative rounded-2xl border-2 border-border bg-card hover:border-primary/60 transition-all duration-200 overflow-hidden text-left p-7 flex flex-col gap-4 shadow-sm hover:shadow-md"
          >
            <div>
              <h3 className="font-display font-bold text-xl text-foreground mb-1">Pick a Style</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Choose from 8 curated rendering styles — photorealistic, watercolor, marker, and more. Fast and ready to use.
              </p>
            </div>
            <div className="mt-auto pt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                Browse styles →
              </span>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.45 }}
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/clone")}
            className="group relative rounded-2xl border-2 border-border bg-card hover:border-primary/60 transition-all duration-200 overflow-hidden text-left p-7 flex flex-col gap-4 shadow-sm hover:shadow-md"
          >
            <div>
              <h3 className="font-display font-bold text-xl text-foreground mb-1">Clone a Style</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload 1–10 reference images and our AI will recreate that exact look on your floor plan — live, in seconds.
              </p>
            </div>
            <div className="mt-auto pt-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                Upload references →
              </span>
            </div>
          </motion.button>

        {/* Edit a Render and Composer tiles hidden temporarily — routes still accessible at /edit and /composer */}
        </div>

        {/* Feature Request */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.45 }}
          className="w-full max-w-2xl mt-10"
        >
          <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
            <h3 className="font-display font-bold text-lg text-foreground mb-5">Request a feature</h3>
            <form onSubmit={handleFeatureRequest} className="space-y-4">
              <div>
                <Label htmlFor="req-email" className="text-sm font-medium text-foreground mb-1.5 block">Your email</Label>
                <Input
                  id="req-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="req-details" className="text-sm font-medium text-foreground mb-1.5 block">Feature details</Label>
                <Textarea
                  id="req-details"
                  placeholder="e.g. I'd love to export renders as PDFs with a branded cover page…"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="resize-none"
                  rows={4}
                  required
                />
              </div>
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="req-contact"
                  checked={allowContact}
                  onCheckedChange={(v) => setAllowContact(!!v)}
                />
                <Label htmlFor="req-contact" className="text-sm text-muted-foreground cursor-pointer">
                  You can reach out to me for more details about this request
                </Label>
              </div>
              <Button type="submit" disabled={submitting || !email.trim() || !details.trim()} className="w-full sm:w-auto">
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </form>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
