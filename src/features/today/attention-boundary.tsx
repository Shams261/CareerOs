'use client';
import { Component, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/** When the whole attention list fails to load the agenda is unaffected; Retry re-renders. */
export class AttentionBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(
      'Attention list failed',
      error instanceof Error ? error.message : 'Unknown',
    );
  }
  render() {
    if (this.state.failed)
      return <AttentionRetry reset={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}
function AttentionRetry({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <p className="form-message" role="alert">
      Couldn’t load attention items.{' '}
      <button
        type="button"
        className="undo-link"
        onClick={() => {
          reset();
          router.refresh();
        }}
      >
        Retry
      </button>
    </p>
  );
}
