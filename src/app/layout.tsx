import { savedTheme } from '@/server/theme';
import { themeColor } from '@/lib/theme';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand';
import { inter, display } from '@/lib/fonts';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Navigation } from '@/components/navigation';
import { RunningNow } from '@/features/execution/running';
import { PresenceBeat } from '@/features/nudges/presence';
import { RumiDrawer } from '@/features/agent/drawer';
import { aiConfig } from '@/lib/env';
import './globals.css';
import type { Viewport } from 'next';
import { currentSession } from '@/server/session';
import { signOutAction } from '@/features/auth/actions';
import { NavigationProgress } from '@/components/progress-bar-top';
import { CommandBar, CommandButton } from '@/features/command/bar';
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
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <div className="shell">
          <aside className="sidebar" aria-label="Workspace">
            <div className="sidebar-head">
              <Link
                prefetch={false}
                href="/today"
                className="brand-home"
                aria-label="Silsila — Today"
              >
                <BrandLogo />
              </Link>
              <CommandButton className="command-button" />
            </div>
            <Navigation />
            <Suspense fallback={null}>
              <RunningNow />
            </Suspense>
            <footer className="muted mt-auto">
              <form action={signOutAction} className="mt-2">
                <button className="link">Sign out</button>
              </form>
            </footer>
          </aside>
          <main id="main" className="content">
            {children}
          </main>
          <PresenceBeat />
          <CommandBar />
          {/* Rumi from any page (WI-060), only where the server has AI. */}
          {aiConfig() && <RumiDrawer />}
        </div>
      </body>
    </html>
  );
}
