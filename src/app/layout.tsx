import type { Metadata } from 'next';
import { Navigation } from '@/components/navigation';
import './globals.css';
import type { Viewport } from 'next';
import { currentSession } from '@/server/session';
import { signOutAction } from '@/features/auth/actions';
export const metadata: Metadata = {
  title: { default: 'CareerOS', template: '%s · CareerOS' },
  description: 'Your personal space for focused work and steady progress',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'CareerOS', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = {
  themeColor: '#244e3b',
  width: 'device-width',
  initialScale: 1,
};
export const dynamic = 'force-dynamic';
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Signed-out pages (sign-in) render without navigation.
  if (!(await currentSession()))
    return (
      <html lang="en">
        <body>
          <main id="main" className="login-shell">
            {children}
          </main>
        </body>
      </html>
    );
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        <div className="shell">
          <aside className="sidebar">
            <div>
              <div className="brand">
                Career<span>OS</span>
              </div>
              <p className="eyebrow mt-2">A little better, every day</p>
            </div>
            <Navigation />
            <footer className="muted mt-auto">
              Your space. Your pace.
              <form action={signOutAction} className="mt-2">
                <button className="link">Sign out</button>
              </form>
            </footer>
          </aside>
          <main id="main" className="content">
            <div className="topbar">
              <span>PERSONAL WORKSPACE</span>
              <span>Make room for what matters.</span>
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
