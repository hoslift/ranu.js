import { describe, it, expect } from 'vitest';
import { RedirectSignal, NotFoundSignal, isControlSignal } from '../src/signals.js';

describe('Private Control Signals', () => {
  it('RedirectSignal accepts 307 and 308 statuses', () => {
    const sig307 = new RedirectSignal('/login', 307);
    expect(sig307.url).toBe('/login');
    expect(sig307.status).toBe(307);

    const sig308 = new RedirectSignal('/home', 308);
    expect(sig308.url).toBe('/home');
    expect(sig308.status).toBe(308);
  });

  it('RedirectSignal rejects invalid status values', () => {
    expect(() => new RedirectSignal('/test', 301)).toThrow(/Invalid redirect status: 301/);
    expect(() => new RedirectSignal('/test', 302)).toThrow(/Invalid redirect status: 302/);
    expect(() => new RedirectSignal('/test', 200)).toThrow(/Invalid redirect status: 200/);
  });

  it('NotFoundSignal initializes correctly', () => {
    const sig = new NotFoundSignal();
    expect(sig.message).toBe('Not Found');
  });

  it('isControlSignal identifies RedirectSignal and NotFoundSignal', () => {
    const redirect = new RedirectSignal('/login', 307);
    const notFound = new NotFoundSignal();

    expect(isControlSignal(redirect)).toBe(true);
    expect(isControlSignal(notFound)).toBe(true);
  });

  it('isControlSignal returns false for standard Errors and arbitrary objects', () => {
    const stdError = new Error('Some error');
    expect(isControlSignal(stdError)).toBe(false);

    expect(isControlSignal(null)).toBe(false);
    expect(isControlSignal(undefined)).toBe(false);
    expect(isControlSignal({})).toBe(false);
    expect(isControlSignal({ message: 'Not Found' })).toBe(false);
  });

  it('isControlSignal protects against spoofing with symbol-mimicking properties', () => {
    // Ordinary object attempting to spoof the branding Symbol
    const spoofObject = {
      message: 'Spoofed Not Found',
      [Symbol.for('ranu.signal')]: true,
    };
    expect(isControlSignal(spoofObject)).toBe(false);

    const spoofError = Object.assign(new Error('Spoof'), {
      [Symbol.for('ranu.signal')]: true,
    });
    expect(isControlSignal(spoofError)).toBe(false);
  });
});
