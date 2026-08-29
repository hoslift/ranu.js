import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeRenderError } from '../src/sanitizer.js';

describe('Sanitizer & Security Utilities', () => {
  describe('escapeHtml', () => {
    it('escapes &, <, >, ", and \'', () => {
      expect(escapeHtml('<script>alert("XSS & \'attack\'")</script>')).toBe(
        '&lt;script&gt;alert(&quot;XSS &amp; &#39;attack&#39;&quot;)&lt;/script&gt;',
      );
    });

    it('preserves clean alphanumeric text without modifications', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });
  });

  describe('sanitizeRenderError', () => {
    it('sanitizes errors in production mode without leaking stack traces or paths', () => {
      const error = new Error('Database connection failed at /var/www/secret/db.ts:42');
      const sanitized = sanitizeRenderError(error, 'production', 'req-12345');

      expect(sanitized.message).toBe('Internal Server Error');
      expect(sanitized.stack).toBeUndefined();
      expect(sanitized.requestId).toBe('req-12345');
    });

    it('provides diagnostic message and stack trace in development mode', () => {
      const error = new Error('Syntax error in component');
      const sanitized = sanitizeRenderError(error, 'development', 'req-debug-1');

      expect(sanitized.message).toBe('Syntax error in component');
      expect(sanitized.stack).toBeDefined();
      expect(sanitized.requestId).toBe('req-debug-1');
    });

    it('handles non-Error objects safely', () => {
      const sanitized = sanitizeRenderError('plain string error', 'development');
      expect(sanitized.message).toBe('plain string error');
    });
  });
});
