/**
 * Handles dynamic authentication redirects based on the environment.
 * Always redirects through /auth/callback which reliably handles token exchange.
 * The `next` param tells the callback where to send the user after auth.
 */
export function getRedirectUrl(next: string = "/") {
    const normalizedNext = next.startsWith("/") ? next : `/${next}`;
    const base = typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // Store destination so the callback page can redirect after code exchange
    if (typeof window !== "undefined") {
        localStorage.setItem("postAuthRedirect", normalizedNext);
    }

    return `${base}/auth/callback`;
}
