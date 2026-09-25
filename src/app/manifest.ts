import type { MetadataRoute } from 'next';

/** Installable PWA metadata. The app works the same without installation. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CareerOS',
    short_name: 'CareerOS',
    description: 'Your personal space for focused work and steady progress',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f5f0',
    theme_color: '#244e3b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
