export const render = 'server';

export default function VercelDeploymentPage() {
  return (
    <article>
      <h1>Serverless Deployment on Vercel</h1>
      <p>Compiled to Vercel Build Output API v3 with atomic serverless edge routing.</p>
      <ul>
        <li>
          Adapter: <code>@ranujs/adapter-vercel</code>
        </li>
        <li>
          Function Target: <code>nodejs22.x</code>
        </li>
        <li>
          Serverless Health API: <a href="/api/status">/api/status</a>
        </li>
      </ul>
    </article>
  );
}
