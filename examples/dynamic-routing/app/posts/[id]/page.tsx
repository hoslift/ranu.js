import { Link } from 'ranu/react';

export default function PostPage({ params }: { params?: { id?: string } }) {
  const postId = params?.id ?? 'Unknown';

  return (
    <article>
      <h2>Post Details</h2>
      <p>
        Dynamic Route Parameter: <strong>{postId}</strong>
      </p>
      <p>
        Resolved from pattern: <code>app/posts/[id]/page.tsx</code>
      </p>
      <Link href="/">Back to Overview</Link>
    </article>
  );
}
