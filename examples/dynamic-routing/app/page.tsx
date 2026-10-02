import { Link } from 'ranu/react';

export default function HomePage() {
  return (
    <section>
      <h1>Dynamic Routing Example</h1>
      <p>Select an example route below to test dynamic segment resolution:</p>
      <ul>
        <li>
          <Link href="/posts/101">Blog Post #101 (Single Parameter [id])</Link>
        </li>
        <li>
          <Link href="/posts/202">Blog Post #202 (Single Parameter [id])</Link>
        </li>
        <li>
          <Link href="/shop/books/clean-code">Product (Multi-Segment [category]/[productId])</Link>
        </li>
        <li>
          <Link href="/archive/2026/framework/release-notes">Catch-All ([...slug])</Link>
        </li>
      </ul>
    </section>
  );
}
