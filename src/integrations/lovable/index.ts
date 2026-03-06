// Lovable integration removed - replaced with standard Supabase auth
// Use supabase.auth.signInWithOAuth({ provider: "google" }) directly instead.
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple", opts?: SignInOptions) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri || window.location.origin,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error };
      return { redirected: true, data };
    },
  },
};
