import { resourceUrl } from '@/lib/validation';
export function ResourceLink({
  url,
  children,
}: {
  url: string | null;
  children: React.ReactNode;
}) {
  if (!url || !resourceUrl.safeParse(url).success)
    return <span className="muted">No valid link saved</span>;
  return (
    <a className="link" href={url} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}
