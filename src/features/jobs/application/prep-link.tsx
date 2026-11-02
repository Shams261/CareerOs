import Link from 'next/link';

/** Where a prep item points: a learning topic, a problem or a DSA topic. */
export function PrepLink({
  item,
}: {
  item: {
    learningTopic: {
      id: string;
      title: string;
      subject: { name: string };
    } | null;
    dsaProblem: { id: string; title: string } | null;
    dsaTopic: { id: string; name: string } | null;
  };
}) {
  if (item.learningTopic)
    return (
      <>
        {' · '}
        <Link
          prefetch={false}
          className="link"
          href={`/learn/topics/${item.learningTopic.id}`}
        >
          {item.learningTopic.subject.name} — {item.learningTopic.title}
        </Link>
      </>
    );
  if (item.dsaProblem)
    return (
      <>
        {' · '}
        <Link
          prefetch={false}
          className="link"
          href={`/dsa/${item.dsaProblem.id}`}
        >
          DSA: {item.dsaProblem.title}
        </Link>
      </>
    );
  if (item.dsaTopic)
    return <span className="muted"> · DSA topic: {item.dsaTopic.name}</span>;
  return null;
}
