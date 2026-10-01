import { Link } from 'ranu/react';

export default function ProductDetailPage({
  params,
}: {
  params?: { category?: string; productId?: string };
}) {
  const category = params?.category ?? 'all';
  const productId = params?.productId ?? 'unknown';

  return (
    <article>
      <h2>Product Details</h2>
      <p>
        Category: <strong>{category}</strong>
      </p>
      <p>
        Product ID: <strong>{productId}</strong>
      </p>
      <p>
        Resolved from pattern: <code>app/shop/[category]/[productId]/page.tsx</code>
      </p>
      <Link href="/">Back to Overview</Link>
    </article>
  );
}
