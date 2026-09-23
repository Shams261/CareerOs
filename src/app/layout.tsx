import type { Metadata } from 'next';
import { Navigation } from '@/components/navigation';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'CareerOS', template: '%s · CareerOS' },
  description: 'Your personal space for focused work and steady progress',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
              <br />
              Personal workspace · WI-002
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
