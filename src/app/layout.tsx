import { savedTheme } from '@/server/theme';
import { themeColor } from '@/lib/theme';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { inter, display } from '@/lib/fonts';
import type { Metadata } from 'next';
import { Navigation } from '@/components/navigation';
import './globals.css';
import type { Viewport } from 'next';
import { currentSession } from '@/server/session';
import { signOutAction } from '@/features/auth/actions';
export const metadata: Metadata = {
  title: { default: 'Silsila', template: '%s · Silsila' },
  description:
    'Plan once. Show up daily. A calm system for daily execution and steady progress.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Silsila', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};
export async function generateViewport(): Promise<Viewport> {
  return {
    themeColor: themeColor(await savedTheme()),
    width: 'device-width',
    initialScale: 1,
  };
}
export const dynamic = 'force-dynamic';
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await savedTheme();
  // Signed-out pages (sign-in) render without navigation.
  if (!(await currentSession()))
    return (
      <html
        lang="en"
        className={`${theme} ${inter.variable} ${display.variable}`}
      >
        <body>
          <main id="main" className="login-shell">
            {children}
          </main>
        </body>
      </html>
    );
  return (
    <html
      lang="en"
      className={`${theme} ${inter.variable} ${display.variable}`}
    >
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <div className="shell">
          <aside className="sidebar">
            <div>
              <Link
                href="/today"
                className="brand-home"
                aria-label="Silsila — Today"
              >
                <BrandLogo />
              </Link>
            </div>
            <Navigation />
            <footer className="muted mt-auto">
              <form action={signOutAction} className="mt-2">
                <button className="link">Sign out</button>
              </form>
            </footer>
          </aside>
          <main id="main" className="content">
            <div className="topbar">
              <span>PERSONAL WORKSPACE</span>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
