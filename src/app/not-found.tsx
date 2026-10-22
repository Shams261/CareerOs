import Link from 'next/link';

export const metadata = { title: 'Not found' };
export default function NotFound() {
  return (
    <section className="card" aria-labelledby="not-found-heading">
      <p className="eyebrow">Not found</p>
      <h1 id="not-found-heading">That page is not here.</h1>
      <p className="muted mb-5">
        The link may be old, or the record was removed.
      </p>
      <Link className="button secondary" href="/today">
        Back to Today
      </Link>
    </section>
  );
}
