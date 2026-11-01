import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { useFormAction } from '../src/forms/use-form-action.js';
import { renderReactToStream } from '../src/stream.js';

describe('@ranu/react useFormAction', () => {
  it('renders initial form state during SSR', async () => {
    const mockAction: any = vi.fn();
    mockAction.raw = vi.fn();

    function TestForm() {
      const { data, isPending } = useFormAction(mockAction, { initialData: { count: 0 } });
      return (
        <div>
          <span id="data">{data?.count}</span>
          <span id="pending">{String(isPending)}</span>
        </div>
      );
    }

    const stream = await renderReactToStream(<TestForm />);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value);
    }

    expect(html).toContain('0');
    expect(html).toContain('false');
  });

  it('submits form payload and processes results', async () => {
    let capturedState: any;

    const mockAction: any = vi.fn(async (input: any) => {
      if (!input.title) {
        return { success: false, errors: { title: ['Title is required'] }, formErrors: [] };
      }
      return { success: true, data: { id: 1, title: input.title } };
    });
    mockAction.raw = vi.fn();

    function TestComponent() {
      const form = useFormAction(mockAction);
      capturedState = form;
      return <div>Form</div>;
    }

    await renderReactToStream(<TestComponent />);
    expect(capturedState.isPending).toBe(false);
    expect(capturedState.errors).toEqual({});

    // 1. Submit invalid
    const failRes = await capturedState.submit({ title: '' });
    expect(failRes.success).toBe(false);
    expect(failRes.errors).toEqual({ title: ['Title is required'] });

    // 2. Submit valid
    const successRes = await capturedState.submit({ title: 'New Post' });
    expect(successRes.success).toBe(true);
    expect(successRes.data).toEqual({ id: 1, title: 'New Post' });
  });
});
