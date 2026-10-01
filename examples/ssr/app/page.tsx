// Declare explicit server render mode (04_RENDERING_MODEL.md)
export const render = 'server';

export default function ServerRenderedPage() {
  const renderedAt = new Date().toISOString();

  return (
    <main>
      <h1>Server-Side Rendered (SSR) Page</h1>
      <p>This page is rendered dynamically on each incoming HTTP request.</p>
      <div
        style={{ padding: '1rem', background: '#f3f4f6', borderRadius: '6px', marginTop: '1rem' }}
      >
        <strong>Server Render Timestamp:</strong> <code>{renderedAt}</code>
      </div>
      <p style={{ marginTop: '1rem' }}>
        Refresh the page to observe the server timestamp update dynamically on the server runtime.
      </p>
    </main>
  );
}
