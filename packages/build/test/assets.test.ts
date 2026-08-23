import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isStaticAssetFile,
  emitStaticAsset,
  rewriteCssUrls,
} from '../src/assets/asset-emitter.js';
import { copyPublicDirectory } from '../src/assets/public-dir.js';

describe('Static Asset Handling and public/ Directory', () => {
  let tempDir: string;
  let staticOutDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-asset-test-'));
    staticOutDir = path.join(tempDir, 'static');
    fs.mkdirSync(staticOutDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('identifies valid static asset extensions matching Phase 17 scope', () => {
    // Images
    expect(isStaticAssetFile('logo.png')).toBe(true);
    expect(isStaticAssetFile('hero.jpg')).toBe(true);
    expect(isStaticAssetFile('hero.jpeg')).toBe(true);
    expect(isStaticAssetFile('icon.svg')).toBe(true);
    expect(isStaticAssetFile('image.webp')).toBe(true);
    expect(isStaticAssetFile('anim.gif')).toBe(true);
    expect(isStaticAssetFile('photo.avif')).toBe(true);
    expect(isStaticAssetFile('favicon.ico')).toBe(true);

    // Fonts
    expect(isStaticAssetFile('font.woff2')).toBe(true);
    expect(isStaticAssetFile('font.woff')).toBe(true);
    expect(isStaticAssetFile('font.ttf')).toBe(true);
    expect(isStaticAssetFile('font.otf')).toBe(true);

    // Media
    expect(isStaticAssetFile('video.mp4')).toBe(true);
    expect(isStaticAssetFile('video.webm')).toBe(true);
    expect(isStaticAssetFile('audio.mp3')).toBe(true);

    // Excluded / Unsupported extensions in Phase 17
    expect(isStaticAssetFile('font.eot')).toBe(false);
    expect(isStaticAssetFile('audio.ogg')).toBe(false);
    expect(isStaticAssetFile('audio.wav')).toBe(false);
    expect(isStaticAssetFile('script.js')).toBe(false);
    expect(isStaticAssetFile('page.tsx')).toBe(false);
  });

  it('emits static assets with deterministic content hashing', () => {
    const assetPath = path.join(tempDir, 'logo.png');
    fs.writeFileSync(assetPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));

    const emitted1 = emitStaticAsset(assetPath, staticOutDir, tempDir);
    const emitted2 = emitStaticAsset(assetPath, staticOutDir, tempDir);

    expect(emitted1.publicUrl).toBe(emitted2.publicUrl);
    expect(emitted1.publicUrl).toMatch(/^\/_ranu\/assets\/logo-[a-f0-9]{8}\.png$/);
    expect(fs.existsSync(emitted1.fullPath)).toBe(true);
  });

  it('prevents path traversal when emitting static assets', () => {
    const outsidePath = path.join(os.tmpdir(), 'outside-secret.png');
    fs.writeFileSync(outsidePath, 'secret');

    expect(() => {
      emitStaticAsset(outsidePath, staticOutDir, tempDir);
    }).toThrow(/escapes project root/);
  });

  it('rewrites relative url(...) paths in CSS', () => {
    const assetPath = path.join(tempDir, 'bg.svg');
    fs.writeFileSync(assetPath, '<svg></svg>');

    const cssPath = path.join(tempDir, 'styles.css');
    const cssContent = `
      .header {
        background-image: url('./bg.svg');
        background-color: red;
      }
      .footer {
        background: url("https://cdn.example.com/external.png");
        cursor: url('data:image/png;base64,abc');
      }
    `;

    const result = rewriteCssUrls(cssContent, cssPath, staticOutDir, tempDir);

    expect(result.code).toMatch(/background-image:\s*url\((['"])\/_ranu\/assets\/bg-[a-f0-9]{8}\.svg\1\)/);
    expect(result.code).toContain('https://cdn.example.com/external.png');
    expect(result.code).toContain('data:image/png;base64,abc');
  });

  it('copies public directory files to static output', () => {
    const publicDir = path.join(tempDir, 'public');
    fs.mkdirSync(path.join(publicDir, 'images'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), 'favicon');
    fs.writeFileSync(path.join(publicDir, 'images', 'banner.png'), 'banner');

    const result = copyPublicDirectory(tempDir, staticOutDir, []);

    expect(result.success).toBe(true);
    expect(result.copiedFiles).toContain('/favicon.ico');
    expect(result.copiedFiles).toContain('/images/banner.png');

    expect(fs.existsSync(path.join(staticOutDir, 'favicon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(staticOutDir, 'images', 'banner.png'))).toBe(true);
  });

  it('rejects public files in reserved _ranu namespace', () => {
    const publicDir = path.join(tempDir, 'public');
    fs.mkdirSync(path.join(publicDir, '_ranu'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, '_ranu', 'malicious.js'), 'hack');

    const result = copyPublicDirectory(tempDir, staticOutDir, []);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'RANU_BUILD_PUBLIC_RESERVED_NAMESPACE')).toBe(true);
  });

  it('detects collisions between public files and application routes', () => {
    const publicDir = path.join(tempDir, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'about.html'), 'about page');

    const routes: any[] = [
      { pathnameTemplate: '/about' },
    ];

    const result = copyPublicDirectory(tempDir, staticOutDir, routes);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'RANU_BUILD_PUBLIC_ROUTE_COLLISION')).toBe(true);
  });
});
