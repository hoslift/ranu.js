import { Link } from 'ranu/react';

export default function ArchiveCatchAllPage({
  params,
}: {
  params?: { slug?: string[] };
}) {
  const segments = Array.isArray(params?.slug)
    ? params.slug
    : typeof params?.slug === 'string'
      ? [params.slug]
      : [];
  const fullPath = segments.join('/');

  return (
    <article>
      <h2>Archive Catch-All Route</h2>
      <p>
        Matched Path: <strong>/{fullPath}</strong>
      </p>
      <p>
        Segments count: <strong>{segments.length}</strong>
      </p>
      <ul>
        {segments.map((seg, i) => (
          <li key={i}>
            Segment {i + 1}: <code>{seg}</code>
          </li>
        ))}
      </ul>
      <Link href="/">Back to Overview</Link>
    </article>
  );
}
