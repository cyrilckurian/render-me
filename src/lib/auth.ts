/**
 * Handles dynamic authentication redirects based on the environment.
 * Uses NEXT_PUBLIC_SITE_URL if defined (for production), otherwise falls back to window.location.origin.
 */
export function getRedirectUrl(path: string = "") {
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // 1. Check for explicit environment variable (best for production)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) {
        // Remove trailing slash if present
        const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
        const finalUrl = `${baseUrl}${normalizedPath}`;
        console.log(`[Auth] Using NEXT_PUBLIC_SITE_URL: ${finalUrl}`);
        return finalUrl;
    }

    // 2. Fallback to window.location (best for local dev/preview)
    if (typeof window !== "undefined") {
        const finalUrl = `${window.location.origin}${normalizedPath}`;
        console.log(`[Auth] Fallback to window.location.origin: ${finalUrl}`);
        return finalUrl;
    }

    // 3. Last resort (should ideally not be hit for client-side auth)
    return normalizedPath;
}
