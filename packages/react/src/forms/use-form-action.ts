import React, { useState, useTransition, useCallback } from 'react';
import type { FormAction, FormActionResult } from '@ranu/core';

export interface UseFormActionOptions<TOutput> {
  readonly onSuccess?: (data: TOutput) => void;
  readonly onError?: (errors: Record<string, string[]>, formErrors: string[]) => void;
  readonly initialData?: TOutput;
}

export interface UseFormActionResult<TOutput> {
  readonly submit: (
    eventOrData: React.FormEvent<HTMLFormElement> | FormData | Record<string, unknown>,
  ) => Promise<FormActionResult<TOutput>>;
  readonly data: TOutput | undefined;
  readonly errors: Record<string, string[]>;
  readonly formErrors: string[];
  readonly isPending: boolean;
  readonly reset: () => void;
}

/**
 * React 19 hook providing reactive state, validation errors, and pending state for type-safe form actions.
 */
export function useFormAction<TInput, TOutput>(
  action: FormAction<TInput, TOutput>,
  options: UseFormActionOptions<TOutput> = {},
): UseFormActionResult<TOutput> {
  const [data, setData] = useState<TOutput | undefined>(options.initialData);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setData(options.initialData);
    setErrors({});
    setFormErrors([]);
  }, [options.initialData]);

  const submit = useCallback(
    async (
      eventOrData: React.FormEvent<HTMLFormElement> | FormData | Record<string, unknown>,
    ): Promise<FormActionResult<TOutput>> => {
      let payload: FormData | Record<string, unknown>;

      if (eventOrData && typeof (eventOrData as any).preventDefault === 'function') {
        (eventOrData as any).preventDefault();
        const target = (eventOrData as any).currentTarget || (eventOrData as any).target;
        payload = new FormData(target as HTMLFormElement);
      } else {
        payload = eventOrData as FormData | Record<string, unknown>;
      }

      setErrors({});
      setFormErrors([]);

      if (typeof window === 'undefined') {
        const result = await action(payload);
        if (result.success) {
          setData(result.data);
          setErrors({});
          setFormErrors([]);
          options.onSuccess?.(result.data);
        } else {
          setErrors(result.errors);
          setFormErrors(result.formErrors);
          options.onError?.(result.errors, result.formErrors);
        }
        return result;
      }

      return new Promise<FormActionResult<TOutput>>((resolve) => {
        startTransition(async () => {
          const result = await action(payload);
          if (result.success) {
            setData(result.data);
            setErrors({});
            setFormErrors([]);
            options.onSuccess?.(result.data);
          } else {
            setErrors(result.errors);
            setFormErrors(result.formErrors);
            options.onError?.(result.errors, result.formErrors);
          }
          resolve(result);
        });
      });
    },
    [action, options],
  );

  return {
    submit,
    data,
    errors,
    formErrors,
    isPending,
    reset,
  };
}
