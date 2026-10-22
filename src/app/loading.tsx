/** The same quiet placeholder the aside cards use, so pages do not jump while loading. */
export default function Loading() {
  return (
    <div className="card skeleton" role="status" aria-label="Loading">
      <span className="skeleton-line w-40" />
      <span className="skeleton-line" />
      <span className="skeleton-line w-60" />
    </div>
  );
}
