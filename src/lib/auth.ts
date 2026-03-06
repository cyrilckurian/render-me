/**
 * Handles dynamic authentication redirects based on the environment.
 * Uses NEXT_PUBLIC_SITE_URL if defined (for production), otherwise falls back to window.location.origin.
 */
export function getRedirectUrl(path: string = "") {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // 1. Check for explicit environment variable
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl && !siteUrl.includes("localhost")) {
        const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
        return `${baseUrl}${normalizedPath}`;
    }

    // 2. Fallback to current window location
    if (typeof window !== "undefined") {
        // Double check: if we are on a .vercel.app or custom domain, window.location.origin will be correct
        return `${window.location.origin}${normalizedPath}`;
    }

    return normalizedPath;
}
