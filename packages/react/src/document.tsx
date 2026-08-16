import React, { type ReactNode } from 'react';
import type { ResolvedMetadata } from './types.js';
import { MetadataHeadElements } from './metadata.js';

/**
 * Default HTML document shell used for root fallback documents (e.g. default 404 or 500 pages).
 */
export function DefaultDocumentShell({
  children,
  metadata,
  title,
}: {
  readonly children: ReactNode;
  readonly metadata?: ResolvedMetadata;
  readonly title?: string;
}): ReactNode {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {title ? <title>{title}</title> : null}
        <MetadataHeadElements metadata={metadata} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * Validates whether rendered HTML string contains required document-level structure.
 * According to 04_RENDERING_MODEL.md §11, at minimum the document must contain <html> and <body>.
 */
export function validateDocumentHtml(html: string): { readonly valid: boolean; readonly missing: readonly string[] } {
  const missing: string[] = [];
  if (!/<html[\s>]/i.test(html)) {
    missing.push('<html>');
  }
  if (!/<body[\s>]/i.test(html)) {
    missing.push('<body>');
  }
  return {
    valid: missing.length === 0,
    missing,
  };
}
