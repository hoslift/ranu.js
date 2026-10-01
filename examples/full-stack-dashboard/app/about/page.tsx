export const render = 'static';

export default function ArchitecturePage() {
  return (
    <article
      style={{
        background: '#fff',
        padding: '2rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}
    >
      <h1>Dashboard Architecture</h1>
      <p>
        This full-stack application serves as a complete reference implementation of{' '}
        <strong>Ranu.js</strong>, combining:
      </p>
      <ul>
        <li>
          <strong>Server-Side Rendering (SSR)</strong>: Live operational metrics generated per
          request on <code>/</code>
        </li>
        <li>
          <strong>Static Site Generation (SSG)</strong>: Pre-rendered documentation pages on{' '}
          <code>/about</code>
        </li>
        <li>
          <strong>Client Interactivity</strong>: React 19 hydrated stateful chart and filter
          controls
        </li>
        <li>
          <strong>REST API Routes</strong>: Data endpoints exposed under <code>/api/metrics</code>
        </li>
        <li>
          <strong>Edge/Server Middleware</strong>: Header injection and telemetry tagging
        </li>
      </ul>
    </article>
  );
}
