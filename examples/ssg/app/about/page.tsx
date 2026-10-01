export const render = 'static';

export default function StaticAboutPage() {
  return (
    <article>
      <h1>About Us (Static HTML)</h1>
      <p>
        Pre-rendered static page emitted to <code>.ranu/build/static/pages/about.html</code>.
      </p>
    </article>
  );
}
