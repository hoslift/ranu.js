import { Link } from '@hoslift/ranu/react';

export default function NotFoundPage() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <h1>404 — Page Not Found</h1>
      <p>The requested route could not be found.</p>
      <Link href="/">Return to Home</Link>
    </div>
  );
}
