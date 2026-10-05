export const config = {
  matcher: ['/*'],
};

export default function middleware(_request: Request) {
  const response = new Response();
  response.headers.set('X-Framework-Origin', 'Ranu.js');
  response.headers.set('X-Dashboard-Tier', 'Enterprise');
  return response;
}
