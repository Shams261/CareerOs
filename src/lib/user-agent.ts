/**
 * A device's name from its user agent, for the Sessions list (WI-057): "Safari on iPhone",
 * "Chrome on macOS". Only the browser family and the platform; never versions or the raw
 * string, which can carry more than the owner needs to see.
 */
export function deviceLabel(userAgent: string | null | undefined) {
  const ua = userAgent ?? '';
  if (!ua) return 'Unknown device';
  const platform = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  // Order matters: Edge and Chrome both say Safari; Chrome says Safari too.
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  if (browser && platform) return `${browser} on ${platform}`;
  return browser ?? platform ?? 'Unknown device';
}
