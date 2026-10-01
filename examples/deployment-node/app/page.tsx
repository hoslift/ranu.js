export const render = 'server';

export default function NodeProductionPage() {
  return (
    <article>
      <h1>Production Node.js & Docker Deployment</h1>
      <p>
        This application is optimized for containerized cloud deployment and long-running production
        server lifecycles.
      </p>
      <ul>
        <li>
          Listening Host: <code>0.0.0.0</code> (Container friendly)
        </li>
        <li>
          Health Endpoint: <a href="/api/health">/api/health</a> (Kubernetes / Docker probe)
        </li>
      </ul>
    </article>
  );
}
