import type { MetadataRoute } from 'next';

/** Installable PWA metadata. The app works the same without installation. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Silsila',
    short_name: 'Silsila',
    description: 'A calm system for daily execution and steady progress.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    background_color: '#F6F3EC',
    theme_color: '#F6F3EC',
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
