import { describe, it, expect } from 'vitest';
import { validateDocumentHtml } from '../src/document.js';

describe('Document Validation', () => {
  it('validates complete document with <html> and <body>', () => {
    const validHtml = '<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body><h1>Hello</h1></body></html>';
    const result = validateDocumentHtml(validHtml);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('detects missing <html> tag', () => {
    const incompleteHtml = '<body><h1>Hello</h1></body>';
    const result = validateDocumentHtml(incompleteHtml);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('<html>');
  });

  it('detects missing <body> tag', () => {
    const incompleteHtml = '<html><head><title>Test</title></head><div>No body</div></html>';
    const result = validateDocumentHtml(incompleteHtml);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('<body>');
  });
});
