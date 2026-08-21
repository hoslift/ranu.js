import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  Link,
  ClientRouterProvider,
  renderReactToStream,
  handleLinkClick,
  type RouterNavigationActions,
  type RanuRouter,
} from '../src/index.js';

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe('Phase 14 Stage 14B: Public <Link> Component', () => {
  describe('Progressive Enhancement & HTML Anchor Rendering', () => {
    it('renders a real <a> tag with href, className, and children', async () => {
      function App(): React.JSX.Element {
        return (
          <ClientRouterProvider>
            <Link href="/about" className="nav-link" id="test-link">
              <span>About Us</span>
            </Link>
          </ClientRouterProvider>
        );
      }

      const stream = await renderReactToStream(<App />);
      const html = await streamToString(stream);

      expect(html).toContain('<a');
      expect(html).toContain('href="/about"');
      expect(html).toContain('class="nav-link"');
      expect(html).toContain('id="test-link"');
      expect(html).toContain('<span>About Us</span>');
      expect(html).toContain('</a>');
    });

    it('renders standard target and download attributes on anchor', async () => {
      function App(): React.JSX.Element {
        return (
          <ClientRouterProvider>
            <Link href="/docs/guide.pdf" target="_blank" download="guide.pdf">
              Download PDF
            </Link>
          </ClientRouterProvider>
        );
      }

      const stream = await renderReactToStream(<App />);
      const html = await streamToString(stream);

      expect(html).toContain('href="/docs/guide.pdf"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('download="guide.pdf"');
    });
  });

  describe('Click Interception & Delegation', () => {
    let pushSpy: ReturnType<typeof vi.fn>;
    let replaceSpy: ReturnType<typeof vi.fn>;
    let router: RanuRouter;

    beforeEach(() => {
      pushSpy = vi.fn();
      replaceSpy = vi.fn();
      router = {
        push: pushSpy,
        replace: replaceSpy,
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
      };
    });

    it('intercepts standard left-click on internal same-origin href and delegates to router.push', () => {
      const preventDefault = vi.fn();
      const mockEvent = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockEvent, {
        href: '/dashboard',
        scroll: true,
        router,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledWith('/dashboard', { scroll: true });
    });

    it('delegates to router.replace when replace prop is true', () => {
      const preventDefault = vi.fn();
      const mockEvent = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockEvent, {
        href: '/settings',
        replace: true,
        scroll: false,
        router,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(replaceSpy).toHaveBeenCalledWith('/settings', { scroll: false });
    });

    it('does NOT intercept when modifier keys (Cmd, Ctrl, Alt, Shift) are pressed', () => {
      const preventDefault = vi.fn();
      const mockMetaEvent = {
        defaultPrevented: false,
        button: 0,
        metaKey: true,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockMetaEvent, {
        href: '/blog',
        router,
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('does NOT intercept non-primary clicks (e.g. middle click)', () => {
      const preventDefault = vi.fn();
      const mockMiddleClickEvent = {
        defaultPrevented: false,
        button: 1, // middle click
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockMiddleClickEvent, {
        href: '/blog',
        router,
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('does NOT intercept when target is non-_self or download is present', () => {
      const preventDefault = vi.fn();
      const mockEvent = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockEvent, {
        href: '/external',
        target: '_blank',
        router,
      });
      expect(preventDefault).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();

      handleLinkClick(mockEvent, {
        href: '/report.csv',
        download: true,
        router,
      });
      expect(preventDefault).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('does NOT intercept unsupported or special schemes (javascript:, mailto:, tel:)', () => {
      const preventDefault = vi.fn();
      const mockEvent = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockEvent, {
        href: 'javascript:void(0)',
        router,
      });
      handleLinkClick(mockEvent, {
        href: 'mailto:test@example.com',
        router,
      });

      expect(preventDefault).not.toHaveBeenCalled();
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it('executes custom onClick callback before interception', () => {
      const customOnClick = vi.fn();
      const preventDefault = vi.fn();
      const mockEvent = {
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLAnchorElement>;

      handleLinkClick(mockEvent, {
        href: '/analytics',
        scroll: true,
        onClick: customOnClick,
        router,
      });

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(customOnClick).toHaveBeenCalledWith(mockEvent);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledWith('/analytics', { scroll: true });
    });
  });
});
