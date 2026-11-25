/**
 * Resolve the public application origin.
 *
 * Behind Docker/a reverse proxy, `request.url` can contain the container
 * bind address (0.0.0.0:3000) instead of the public host. Always prefer APP_URL
 * for user-facing redirects.
 */
export function appOrigin(fallback?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }
  if (fallback && /^https?:\/\//i.test(fallback)) return fallback.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/** Absolute URL on the public origin. */
export function appUrl(path: string, fallback?: string): URL {
  return new URL(path.startsWith("/") ? path : `/${path}`, appOrigin(fallback));
}
