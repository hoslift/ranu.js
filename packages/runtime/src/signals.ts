const RANU_SIGNAL_BRAND = Symbol('ranu.signal');

export class RanuControlSignal extends Error {
  readonly [RANU_SIGNAL_BRAND] = true;
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RedirectSignal extends RanuControlSignal {
  constructor(public readonly url: string, public readonly status: number) {
    super(`Redirect to ${url} (${status})`);
    if (status !== 307 && status !== 308) {
      throw new Error(`Invalid redirect status: ${status}. Only 307 and 308 are allowed.`);
    }
  }
}

export class NotFoundSignal extends RanuControlSignal {
  constructor() {
    super('Not Found');
  }
}

export function isControlSignal(error: unknown): error is RanuControlSignal {
  return (
    error instanceof Error &&
    typeof error === 'object' &&
    error !== null &&
    (error as any)[RANU_SIGNAL_BRAND] === true
  );
}
