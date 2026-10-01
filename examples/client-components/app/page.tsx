import { Counter } from './components/counter.js';
import { TextFilter } from './components/text-filter.js';

export default function ClientWidgetsPage() {
  return (
    <article>
      <h1>Client-Side Interactivity</h1>
      <p>Demonstrating React 19 hydration, state updates, and event listeners in Ranu.js.</p>
      <Counter />
      <TextFilter />
    </article>
  );
}
