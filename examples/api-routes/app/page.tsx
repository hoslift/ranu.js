export default function ApiRoutesHomePage() {
  return (
    <main>
      <h1>Ranu.js API Routes</h1>
      <p>Demonstrating standard REST endpoints using Web Standard Request and Response objects.</p>
      <ul>
        <li>
          <a href="/api/hello" target="_blank" rel="noreferrer">
            GET /api/hello
          </a>{' '}
          (JSON Message)
        </li>
        <li>
          <a href="/api/users" target="_blank" rel="noreferrer">
            GET /api/users
          </a>{' '}
          (User List)
        </li>
      </ul>
    </main>
  );
}
