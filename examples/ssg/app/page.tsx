export const render = 'static';

export default function StaticHomePage() {
  return (
    <article>
      <h1>Blazing Fast Static Site Generation</h1>
      <p>
        This entire page is pre-rendered at build time to pure HTML and served with zero server
        compute overhead.
      </p>
    </article>
  );
}
