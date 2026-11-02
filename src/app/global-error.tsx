'use client';

/**
 * Shown when the root layout itself fails (WI-121). It replaces the whole document, so it carries
 * its own html, body and inline styles in the light theme's colours; the global stylesheet and
 * the theme cookie do not reach it. The digest ties it to the server log without exposing details.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest =
    error && typeof error === 'object' && 'digest' in error
      ? String((error as { digest?: unknown }).digest ?? '')
      : '';
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '16px',
          background: '#F4F1EA',
          color: '#1B1A16',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <title>Silsila · Something went wrong</title>
        <main
          role="alert"
          style={{
            maxWidth: '28rem',
            background: '#FFFFFF',
            border: '1px solid #E6E1D7',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <p style={{ margin: 0, fontSize: '13px', color: '#716C63' }}>
            Something went wrong
          </p>
          <h1 style={{ margin: '6px 0 10px', fontSize: '22px' }}>
            Silsila could not be loaded.
          </h1>
          <p style={{ margin: '0 0 20px', color: '#4F4B44', lineHeight: 1.5 }}>
            Nothing you saved is lost. Try again, or reload the page.
            {digest ? ` Reference ${digest}.` : ''}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: 'inherit',
              fontWeight: 600,
              minHeight: '44px',
              padding: '0 18px',
              border: 0,
              borderRadius: '8px',
              background: '#1E6B5B',
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
