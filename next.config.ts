import type { NextConfig } from 'next';
import { staticSecurityHeaders } from './src/server/security';

const config: NextConfig = {
  poweredByHeader: false,
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
