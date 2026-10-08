# Form Actions & Mutations

With React 19 native support in Ranu.js, data mutations and form submissions become declarative, resilient, and simple without relying on third-party state managers.

---

## 1. Using React 19 `useActionState`

React 19 introduces `useActionState`, which manages loading states, returned results, and optimistic updates automatically:

```tsx
// app/components/FeedbackForm.tsx
'use client';

import React, { useActionState } from 'react';

interface FormState {
  success?: boolean;
  message?: string;
}

async function submitFeedback(prevState: FormState, formData: FormData): Promise<FormState> {
  const comment = formData.get('comment') as string;

  if (!comment || comment.trim().length < 5) {
    return { success: false, message: 'Comment must be at least 5 characters long.' };
  }

  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });

  if (!response.ok) {
    return { success: false, message: 'Failed to submit feedback. Try again.' };
  }

  return { success: true, message: 'Thank you for your feedback!' };
}

export function FeedbackForm() {
  const [state, formAction, isPending] = useActionState(submitFeedback, {});

  return (
    <form action={formAction} style={{ maxWidth: '400px' }}>
      <label htmlFor="comment" style={{ display: 'block', marginBottom: '8px' }}>
        Your Feedback
      </label>
      <textarea
        id="comment"
        name="comment"
        rows={4}
        required
        style={{ width: '100%', padding: '8px', marginBottom: '12px' }}
      />

      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: '8px 16px',
          backgroundColor: '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Submitting...' : 'Submit'}
      </button>

      {state.message && (
        <p style={{ marginTop: '12px', color: state.success ? 'green' : 'red' }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
```

---

## 2. Progressive Enhancement

Forms driven by native HTML form actions and standard inputs submit cleanly with automatic pending indicators (`isPending`), simplifying frontend boilerplate.

---

## 3. Key Takeaways

1. **React 19 Native:** Eliminate `onSubmit` event preventions and manual loading hooks by using `useActionState`.
2. **Next Step:** Handle large data streams in **[Streaming Responses & Web Streams](./03_STREAMING_RESPONSES.md)**.
