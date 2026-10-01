import { Link } from '@hoslift/ranu/react';

export default function MiddlewareHomePage() {
  return (
    <article>
      <h1>Ranu.js Middleware Example</h1>
      <p>
        This example demonstrates how middleware intercepts incoming requests before route
        rendering.
      </p>
      <ul>
        <li>
          <Link href="/protected">Visit /protected</Link> (Redirects to /login if unauthenticated)
        </li>
        <li>
          <Link href="/login">Visit /login</Link>
        </li>
      </ul>
    </article>
  );
}
