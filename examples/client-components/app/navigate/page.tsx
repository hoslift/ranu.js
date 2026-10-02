import { useRouter, usePathname, useSearchParams } from 'ranu/react';

export default function ProgrammaticNavigationPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <article>
      <h2>Programmatic Navigation Hooks</h2>
      <p>
        Current Pathname: <code>{pathname}</code>
      </p>
      <p>
        Search Query: <code>{searchParams.toString() || '(none)'}</code>
      </p>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <button
          onClick={() => router.push('/')}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          router.push('/')
        </button>
        <button
          onClick={() => router.replace('/navigate?ref=btn')}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          router.replace('?ref=btn')
        </button>
      </div>
    </article>
  );
}
