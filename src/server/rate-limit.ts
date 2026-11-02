/**
 * Fixed-window, in-process rate limiter for public endpoints (sign-in, OAuth callback, webhook).
 * Adequate for a single-owner deployment on one process; a multi-instance deployment gets a
 * per-instance limit, which is documented rather than solved with Redis.
 */
const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60000,
  now = Date.now(),
) {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 5000)
      for (const [k, v] of windows)
        if (now - v.start >= windowMs) windows.delete(k);
    return true;
  }
  w.count++;
  return w.count <= limit;
}
/**
 * The client's address for the limits above. Production sits behind Cloudflare (Render's edge),
 * which sets `cf-connecting-ip` itself and overwrites any value a client sends; the leftmost
 * `x-forwarded-for` entry is client-controlled there, so it is only the fallback (WI-121).
 */
export const clientIp = (headers: Headers) =>
  headers.get('cf-connecting-ip')?.trim() ||
  headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  headers.get('x-real-ip') ||
  'local';
