import localFont from 'next/font/local';
// Self-hosted, SIL Open Font License; no runtime requests to a font provider.
export const inter = localFont({
  src: '../assets/fonts/inter-latin.woff2',
  weight: '400 700',
  variable: '--font-inter',
  display: 'swap',
});
export const display = localFont({
  src: '../assets/fonts/cormorant-garamond-600.woff2',
  weight: '600',
  style: 'normal',
  variable: '--font-cormorant',
  display: 'swap',
});
