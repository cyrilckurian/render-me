/**
 * Handles dynamic authentication redirects based on the environment.
 * Uses NEXT_PUBLIC_SITE_URL if defined (for production), otherwise falls back to window.location.origin.
 */
export function getRedirectUrl(path: string = "") {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // 1. Fallback to current window location FIRST to preserve sessionStorage
    if (typeof window !== "undefined") {
        return `${window.location.origin}${normalizedPath}`;
    }

    // 2. Check for explicit environment variable (server-side or fallback)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl && !siteUrl.includes("localhost")) {
        const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
        return `${baseUrl}${normalizedPath}`;
    }

    return normalizedPath;
}
