import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deriveStaticOutputPath, writeStaticPage } from '../src/index.js';

describe('Phase 15 Stage 15B: Static Output Path Derivation & Writing', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-static-output-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('deriveStaticOutputPath', () => {
    it.each(['/', '////', '  ////  '])('maps slash-only pathname %j to index', (pathname) => {
      expect(deriveStaticOutputPath(pathname)).toBe('static/pages/index.html');
    });
    it('maps root pathname to static/pages/index.html', () => {
      expect(deriveStaticOutputPath('/')).toBe('static/pages/index.html');
      expect(deriveStaticOutputPath('')).toBe('static/pages/index.html');
      expect(deriveStaticOutputPath('/', 'always')).toBe('static/pages/index.html');
    });

    it('maps single-level and nested pathnames with trailingSlash = never (default)', () => {
      expect(deriveStaticOutputPath('/about')).toBe('static/pages/about.html');
      expect(deriveStaticOutputPath('/contact')).toBe('static/pages/contact.html');
      expect(deriveStaticOutputPath('/blog/post-1')).toBe('static/pages/blog/post-1.html');
      expect(deriveStaticOutputPath('/docs/api/v1/reference')).toBe(
        'static/pages/docs/api/v1/reference.html',
      );
    });

    it('maps pathnames with trailingSlash = always to directory/index.html', () => {
      expect(deriveStaticOutputPath('/about', 'always')).toBe('static/pages/about/index.html');
      expect(deriveStaticOutputPath('/about/', 'always')).toBe('static/pages/about/index.html');
      expect(deriveStaticOutputPath('/blog/post-1', 'always')).toBe(
        'static/pages/blog/post-1/index.html',
      );
      expect(deriveStaticOutputPath('/blog/post-1/', 'always')).toBe(
        'static/pages/blog/post-1/index.html',
      );
    });

    it('preserves percent-encoded characters in output file paths', () => {
      expect(deriveStaticOutputPath('/search/hello%20world')).toBe(
        'static/pages/search/hello%20world.html',
      );
      expect(deriveStaticOutputPath('/tag/caf%C3%A9')).toBe('static/pages/tag/caf%C3%A9.html');
    });

    it('throws on path traversal attempts in pathname segments', () => {
      expect(() => deriveStaticOutputPath('/../escaped')).toThrow(
        'Traversal characters are strictly prohibited',
      );
      expect(() => deriveStaticOutputPath('/blog/../post')).toThrow(
        'Traversal characters are strictly prohibited',
      );
      expect(() => deriveStaticOutputPath('/./current')).toThrow(
        'Traversal characters are strictly prohibited',
      );
      expect(() => deriveStaticOutputPath('/win\\escape')).toThrow(
        'Traversal characters are strictly prohibited',
      );
      expect(() => deriveStaticOutputPath('/null\0byte')).toThrow(
        'Traversal characters are strictly prohibited',
      );
    });
  });

  describe('writeStaticPage', () => {
    it('writes static HTML content inside output directory with parent directories created', () => {
      const relPath = 'static/pages/blog/post-1.html';
      const content = '<!DOCTYPE html><html><body><h1>Post 1</h1></body></html>';

      const writtenPath = writeStaticPage(tempDir, relPath, content);
      expect(fs.existsSync(writtenPath)).toBe(true);
      expect(fs.readFileSync(writtenPath, 'utf8')).toBe(content);
    });

    it('throws security error if destination escapes base output directory', () => {
      const escapingPath = '../../escaped.html';
      const content = '<html></html>';

      expect(() => writeStaticPage(tempDir, escapingPath, content)).toThrow('Security violation');
    });
  });
});
