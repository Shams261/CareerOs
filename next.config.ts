import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/server/security';

const config: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // WI-061: a page seen in the last 30 s shows at once on Back, Forward or a revisit, then
    // refreshes; a write still clears it (server actions revalidate). Menu links prefetched on
    // intent keep their data no longer than that either.
    staleTimes: { dynamic: 30, static: 30 },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: staticSecurityHeaders(process.env.NODE_ENV === 'production'),
      },
      {
        // The service worker must always be revalidated so fixes reach devices.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
export default config;
