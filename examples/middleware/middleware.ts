export const config = {
  matcher: ['/*'],
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  // Authentication check: redirect to /login if unauthenticated access to /protected
  if (url.pathname.startsWith('/protected')) {
    const cookie = request.headers.get('cookie') || '';
    const hasAuth = cookie.includes('auth_token=valid');

    if (!hasAuth) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', url.pathname);
      return Response.redirect(loginUrl.toString(), 307);
    }
  }

  // Rewrite /account internally to /protected
  if (url.pathname === '/account') {
    return { type: 'rewrite', url: '/protected' };
  }
}
