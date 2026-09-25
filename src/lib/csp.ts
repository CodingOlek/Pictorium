/**
 * Origini extra per la Content-Security-Policy (img-src/connect-src).
 *
 * Quando POSTER_CDN_URL (o NEXT_PUBLIC_POSTER_CDN_URL) è impostato, gli URL
 * poster escono con quell'origin mentre la pagina gira altrove: senza
 * allowlist la CSP bloccherebbe <img> e XHR delle preview. Solo
 * scheme+host, mai path/query; env assente → lista vuota (policy invariata).
 * Lettura env iniettata per testabilità (la config passa process.env).
 */
export function cspExtraOrigins(env: Record<string, string | undefined>): string[] {
  const raw = (env.NEXT_PUBLIC_POSTER_CDN_URL || env.POSTER_CDN_URL || "").trim().replace(/\/+$/, "")
  if (!raw) return []
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`)
    if (url.protocol !== "http:" && url.protocol !== "https:") return []
    return [`${url.protocol}//${url.host}`]
  } catch {
    return []
  }
}
