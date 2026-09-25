/**
 * Security headers (ADR-012). The CSP uses a per-request nonce with 'strict-dynamic' so Next.js
 * scripts run and injected scripts do not. Inline style attributes remain allowed (used for bar
 * widths). Google is allowed only as a sign-in/consent navigation target.
 */
export function contentSecurityPolicy(
  nonce: string,
  opts: { dev: boolean; https: boolean; formTargets: string[] },
) {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self' ${opts.formTargets.join(' ')}`.trim(),
    `base-uri 'self'`,
    `object-src 'none'`,
    // Only over HTTPS: WebKit applies the upgrade to http://localhost too and breaks local previews.
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
/** Static headers for every response (see next.config.ts). HSTS only in production. */
export function staticSecurityHeaders(production: boolean) {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    },
    ...(production
      ? [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ]
      : []),
  ];
}
