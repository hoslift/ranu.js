import React, { forwardRef } from 'react';
import { useRouter } from './hooks.js';
import { useClientRouterContext } from './router-context.js';
import { isModifiedEvent, isLeftClick } from './navigation.js';
import type { LinkProps, RanuRouter } from '../types.js';

export interface HandleLinkClickOptions {
  readonly href: string;
  readonly replace?: boolean | undefined;
  readonly scroll?: boolean | undefined;
  readonly target?: string | undefined;
  readonly download?: boolean | string | undefined;
  readonly onClick?: ((event: React.MouseEvent<HTMLAnchorElement>) => void) | undefined;
  readonly router: RanuRouter;
}

/**
 * Handles client link click interception and progressive enhancement.
 */
export function handleLinkClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  options: HandleLinkClickOptions
): void {
  if (options.onClick) {
    options.onClick(event);
  }

  if (
    event.defaultPrevented ||
    !isLeftClick(event) ||
    isModifiedEvent(event) ||
    (options.target && options.target !== '_self') ||
    options.download != null
  ) {
    return;
  }

  const trimmed = options.href.trim();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return;
  }

  if (typeof window !== 'undefined') {
    try {
      const url = new URL(options.href, window.location.href);
      if (url.origin !== window.location.origin) {
        // Cross-origin link: allow native browser navigation
        return;
      }
    } catch {
      // Invalid URL: do not intercept
      return;
    }
  }

  // Intercept same-origin internal navigation
  event.preventDefault();
  if (options.replace) {
    options.router.replace(options.href, { scroll: options.scroll });
  } else {
    options.router.push(options.href, { scroll: options.scroll });
  }
}

/**
 * Client navigation Link component.
 * Renders a standard <a> tag for progressive enhancement and intercepts same-origin clicks.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    href,
    replace = false,
    scroll = true,
    prefetch = true,
    target,
    download,
    onClick,
    onMouseEnter,
    onFocus,
    children,
    ...rest
  },
  ref
) {
  const router = useRouter();
  const { prefetch: prefetchFn } = useClientRouterContext();

  const handleMouseEnter = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    onMouseEnter?.(event);
    if (prefetch !== false && prefetchFn) {
      void prefetchFn(href, { kind: 'hover' });
    }
  };

  const handleFocus = (event: React.FocusEvent<HTMLAnchorElement>): void => {
    onFocus?.(event);
    if (prefetch !== false && prefetchFn) {
      void prefetchFn(href, { kind: 'hover' });
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    handleLinkClick(event, {
      href,
      replace,
      scroll,
      target,
      download,
      onClick,
      router,
    });
  };

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      download={download}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...rest}
    >
      {children}
    </a>
  );
});

Link.displayName = 'Link';
