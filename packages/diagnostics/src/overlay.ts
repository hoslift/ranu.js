declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Element {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface HTMLElement {}
}

export type MismatchType =
  | 'tag-mismatch'
  | 'attribute-mismatch'
  | 'attribute-missing'
  | 'attribute-extra'
  | 'text-mismatch'
  | 'children-count-mismatch'
  | 'missing-node'
  | 'extra-node';

export interface HydrationMismatch {
  type: MismatchType;
  path: string;
  message: string;
  serverValue?: string | undefined;
  clientValue?: string | undefined;
  tagName?: string | undefined;
  attributeName?: string | undefined;
}

/**
 * Extract attribute key-value pairs from any standard DOM Element or simulated Element.
 */
export function getElementAttributes(el: unknown): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!el || typeof el !== 'object') return attrs;

  const candidate = el as {
    getAttributeNames?: () => string[];
    getAttribute?: (name: string) => string | null;
    attributes?: Record<string, unknown> | Array<{ name: string; value: string }>;
  };

  if (typeof candidate.getAttributeNames === 'function') {
    for (const name of candidate.getAttributeNames()) {
      attrs[name] = candidate.getAttribute?.(name) ?? '';
    }
    return attrs;
  }

  if (candidate.attributes) {
    if (Array.isArray(candidate.attributes)) {
      for (const item of candidate.attributes) {
        if (item && item.name) {
          attrs[item.name] = item.value ?? '';
        }
      }
      return attrs;
    }

    if (typeof (candidate.attributes as any).item === 'function') {
      const namedMap = candidate.attributes as { length: number; item: (i: number) => { name: string; value: string } | null };
      for (let i = 0; i < namedMap.length; i++) {
        const item = namedMap.item(i);
        if (item && item.name) {
          attrs[item.name] = item.value ?? '';
        }
      }
      return attrs;
    }

    if (typeof candidate.attributes === 'object') {
      for (const [k, v] of Object.entries(candidate.attributes)) {
        if (v !== undefined && v !== null && typeof v !== 'function') {
          attrs[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
      }
      return attrs;
    }
  }

  return attrs;
}

/**
 * Extract element children from any DOM Element or simulated Element.
 */
export function getElementChildren(el: unknown): Element[] {
  if (!el || typeof el !== 'object') return [];

  const candidate = el as {
    children?: HTMLCollection | Element[] | NodeList;
    childNodes?: NodeList | Node[];
  };

  if (candidate.children && typeof (candidate.children as any).length === 'number') {
    return Array.from(candidate.children as any);
  }

  if (candidate.childNodes && typeof (candidate.childNodes as any).length === 'number') {
    return Array.from(candidate.childNodes as any).filter((node: any) => {
      return node && (node.nodeType === 1 || Boolean(node.tagName));
    }) as Element[];
  }

  return [];
}

/**
 * Extract direct text content from an element (excluding nested child element tags).
 */
export function getElementDirectText(el: unknown): string {
  if (!el || typeof el !== 'object') return '';
  const candidate = el as {
    children?: unknown;
    childNodes?: unknown[];
    textContent?: string | null;
  };

  const children = getElementChildren(el);
  if (children.length === 0) {
    return (candidate.textContent ?? '').trim();
  }

  if (Array.isArray(candidate.childNodes)) {
    let directText = '';
    for (const node of candidate.childNodes as any[]) {
      if (node && (node.nodeType === 3 || (!node.tagName && typeof node.textContent === 'string'))) {
        directText += node.textContent || '';
      }
    }
    return directText.trim();
  }

  return (candidate.textContent ?? '').trim();
}

/**
 * Parse an HTML string into an Element tree. Uses DOMParser or template in browser,
 * or a built-in lightweight tree builder fallback in headless Node environments.
 */
export function parseHtmlToElement(html: string): Element {
  const trimmed = html.trim();

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'text/html');
    const root = doc.body.firstElementChild || doc.body;
    if (root) return root;
  }

  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const template = document.createElement('template');
    template.innerHTML = trimmed;
    const root = template.content.firstElementChild || (template.content as unknown as Element);
    if (root) return root;
  }

  // Lightweight fallback element tree representation for pure Node test runners
  return createSimulatedElementFromHtml(trimmed);
}

/**
 * Simple recursive HTML string parser for test environments without DOMParser or JSDOM.
 * Uses linear scanning without regular expression backtracking to prevent ReDoS.
 */
function createSimulatedElementFromHtml(html: string): Element {
  const trimmed = html.trim();
  if (!trimmed.startsWith('<')) {
    return {
      tagName: 'DIV',
      attributes: {},
      getAttribute: () => null,
      children: [],
      childNodes: [],
      textContent: trimmed,
      outerHTML: html,
    } as unknown as Element;
  }

  const firstGt = trimmed.indexOf('>');
  if (firstGt === -1) {
    return {
      tagName: 'DIV',
      attributes: {},
      getAttribute: () => null,
      children: [],
      childNodes: [],
      textContent: trimmed,
      outerHTML: html,
    } as unknown as Element;
  }

  let tagHeader = trimmed.slice(1, firstGt).trim();
  const isSelfClosing = tagHeader.endsWith('/');
  if (isSelfClosing) {
    tagHeader = tagHeader.slice(0, -1).trim();
  }

  const spaceIdx = tagHeader.search(/\s/);
  const tagName = (spaceIdx === -1 ? tagHeader : tagHeader.slice(0, spaceIdx)).toUpperCase();
  const rawAttrs = spaceIdx === -1 ? '' : tagHeader.slice(spaceIdx).trim();
  const attrs = parseAttributeString(rawAttrs);

  if (isSelfClosing) {
    return {
      tagName: tagName || 'DIV',
      attributes: attrs,
      getAttribute(name: string) { return attrs[name] ?? null; },
      children: [],
      childNodes: [],
      textContent: '',
      outerHTML: html,
    } as unknown as Element;
  }

  // Determine closing tag and inner content
  const closeTag = `</${tagName.toLowerCase()}>`;
  let innerContent = '';
  const lowerTrimmed = trimmed.toLowerCase();
  if (lowerTrimmed.endsWith(closeTag)) {
    innerContent = trimmed.slice(firstGt + 1, trimmed.length - closeTag.length);
  } else {
    innerContent = trimmed.slice(firstGt + 1);
  }

  const childSnippets = extractChildTagSnippets(innerContent);
  const children: Element[] = childSnippets.map((snippet) => createSimulatedElementFromHtml(snippet));
  const textContent = children.length > 0 ? '' : innerContent.trim();

  return {
    tagName: tagName || 'DIV',
    attributes: attrs,
    getAttribute(name: string) { return attrs[name] ?? null; },
    children,
    childNodes: children,
    textContent,
    outerHTML: html,
  } as unknown as Element;
}

/**
 * Scan an HTML snippet linearly to find top-level child tags without polynomial backtracking.
 */
function extractChildTagSnippets(html: string): string[] {
  const snippets: string[] = [];
  let i = 0;
  while (i < html.length) {
    const start = html.indexOf('<', i);
    if (start === -1) break;

    // Skip comments or closing tags if misplaced
    if (html[start + 1] === '/' || html[start + 1] === '!') {
      i = start + 1;
      continue;
    }

    const end = html.indexOf('>', start);
    if (end === -1) break;

    let tagContent = html.slice(start + 1, end).trim();
    if (tagContent.endsWith('/')) {
      // Self closing tag
      snippets.push(html.slice(start, end + 1));
      i = end + 1;
      continue;
    }

    const spaceIdx = tagContent.search(/\s/);
    const childTagName = (spaceIdx === -1 ? tagContent : tagContent.slice(0, spaceIdx)).toLowerCase();
    if (!childTagName || !/^[a-z0-9-]+$/.test(childTagName)) {
      i = end + 1;
      continue;
    }

    // Scan for matching closing tag, handling nested identical tags
    const openPattern = `<${childTagName}`;
    const closePattern = `</${childTagName}>`;
    let depth = 1;
    let searchPos = end + 1;
    let foundEnd = -1;

    while (depth > 0 && searchPos < html.length) {
      const nextOpen = html.toLowerCase().indexOf(openPattern, searchPos);
      const nextClose = html.toLowerCase().indexOf(closePattern, searchPos);

      if (nextClose === -1) {
        foundEnd = html.length;
        break;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        const charAfter = html[nextOpen + openPattern.length];
        if (charAfter === '>' || charAfter === '/' || /\s/.test(charAfter ?? '')) {
          depth++;
        }
        searchPos = nextOpen + openPattern.length;
      } else {
        depth--;
        if (depth === 0) {
          foundEnd = nextClose + closePattern.length;
        } else {
          searchPos = nextClose + closePattern.length;
        }
      }
    }

    if (foundEnd !== -1) {
      snippets.push(html.slice(start, foundEnd));
      i = foundEnd;
    } else {
      i = end + 1;
    }
  }
  return snippets;
}

function parseAttributeString(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(raw)) !== null) {
    const key = match[1]!;
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = val;
  }
  return attrs;
}

/**
 * Compare Server DOM against Client DOM recursively, producing a structured mismatch report.
 *
 * @param serverHtml - Server-rendered HTML string or DOM Element.
 * @param clientElement - Live Client DOM Element to inspect.
 * @returns Array of identified HydrationMismatch objects.
 */
export function diffServerClientDOM(
  serverHtml: string | Element,
  clientElement: Element
): HydrationMismatch[] {
  const mismatches: HydrationMismatch[] = [];

  const serverEl = typeof serverHtml === 'string'
    ? parseHtmlToElement(serverHtml)
    : serverHtml;

  function diffNodes(serverNode: Element, clientNode: Element, currentPath: string): void {
    const sTag = (serverNode.tagName || '').toLowerCase();
    const cTag = (clientNode.tagName || '').toLowerCase();

    // 1. Tag Mismatch
    if (sTag !== cTag) {
      mismatches.push({
        type: 'tag-mismatch',
        path: currentPath,
        message: `Expected server tag <${sTag}> but client rendered <${cTag}>`,
        serverValue: sTag,
        clientValue: cTag,
        tagName: cTag,
      });
      // Differing tags usually alter subtree semantics, continue comparing attributes on current
    }

    // 2. Attributes Comparison
    const serverAttrs = getElementAttributes(serverNode);
    const clientAttrs = getElementAttributes(clientNode);

    // Missing attributes or Value mismatches
    for (const [key, sVal] of Object.entries(serverAttrs)) {
      if (!(key in clientAttrs)) {
        mismatches.push({
          type: 'attribute-missing',
          path: currentPath,
          message: `Attribute "${key}" present on server ("${sVal}") but missing on client`,
          serverValue: sVal,
          attributeName: key,
        });
      } else if (clientAttrs[key] !== sVal) {
        const cVal = clientAttrs[key] ?? '';
        mismatches.push({
          type: 'attribute-mismatch',
          path: currentPath,
          message: `Attribute "${key}" mismatch: server="${sVal}", client="${cVal}"`,
          serverValue: sVal,
          clientValue: cVal,
          attributeName: key,
        });
      }
    }

    // Extra attributes on client
    for (const [key, cVal] of Object.entries(clientAttrs)) {
      if (!(key in serverAttrs)) {
        mismatches.push({
          type: 'attribute-extra',
          path: currentPath,
          message: `Extra attribute "${key}" ("${cVal}") on client not present on server`,
          clientValue: cVal,
          attributeName: key,
        });
      }
    }

    // 3. Text Mismatch
    const serverChildren = getElementChildren(serverNode);
    const clientChildren = getElementChildren(clientNode);

    if (serverChildren.length === 0 && clientChildren.length === 0) {
      const sText = getElementDirectText(serverNode);
      const cText = getElementDirectText(clientNode);
      if (sText !== cText) {
        mismatches.push({
          type: 'text-mismatch',
          path: `${currentPath}/text()`,
          message: `Text content mismatch: server="${sText}", client="${cText}"`,
          serverValue: sText,
          clientValue: cText,
        });
      }
    }

    // 4. Children Count Mismatch
    if (serverChildren.length !== clientChildren.length) {
      mismatches.push({
        type: 'children-count-mismatch',
        path: currentPath,
        message: `Children count mismatch: server has ${serverChildren.length} child elements, client has ${clientChildren.length}`,
        serverValue: String(serverChildren.length),
        clientValue: String(clientChildren.length),
      });
    }

    // Missing nodes (server had extra children that client lacks)
    if (serverChildren.length > clientChildren.length) {
      for (let i = clientChildren.length; i < serverChildren.length; i++) {
        const child = serverChildren[i]!;
        const tag = (child.tagName || 'element').toLowerCase();
        mismatches.push({
          type: 'missing-node',
          path: `${currentPath} > ${tag}:nth-child(${i + 1})`,
          message: `Missing node on client: <${tag}> at child index ${i}`,
          serverValue: (child as any).outerHTML || `<${tag}>`,
          tagName: tag,
        });
      }
    }

    // Extra nodes (client rendered extra children not on server)
    if (clientChildren.length > serverChildren.length) {
      for (let i = serverChildren.length; i < clientChildren.length; i++) {
        const child = clientChildren[i]!;
        const tag = (child.tagName || 'element').toLowerCase();
        mismatches.push({
          type: 'extra-node',
          path: `${currentPath} > ${tag}:nth-child(${i + 1})`,
          message: `Extra node on client: <${tag}> at child index ${i}`,
          clientValue: (child as any).outerHTML || `<${tag}>`,
          tagName: tag,
        });
      }
    }

    // Recurse common child range
    const commonCount = Math.min(serverChildren.length, clientChildren.length);
    for (let i = 0; i < commonCount; i++) {
      const sChild = serverChildren[i]!;
      const cChild = clientChildren[i]!;
      const sChildTag = (sChild.tagName || 'element').toLowerCase();
      diffNodes(sChild, cChild, `${currentPath} > ${sChildTag}:nth-child(${i + 1})`);
    }
  }

  const initialTag = (clientElement.tagName || 'root').toLowerCase();
  diffNodes(serverEl, clientElement, initialTag);

  return mismatches;
}

/**
 * Render the visual hydration diff overlay inside an isolated Shadow DOM.
 *
 * @param mismatches - Array of mismatches detected during hydration.
 * @returns Host container HTMLElement mounting the Shadow Root.
 */
export function renderHydrationOverlay(mismatches: HydrationMismatch[]): HTMLElement {
  const container = document.createElement('div');
  container.id = 'ranu-hydration-overlay-root';
  container.style.position = 'fixed';
  container.style.zIndex = '999999';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.maxWidth = '680px';
  container.style.width = 'calc(100vw - 40px)';
  container.style.maxHeight = '80vh';
  container.style.pointerEvents = 'auto';

  const shadow = container.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .overlay-card {
      background: #0f172a;
      border: 1px solid #e11d48;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
      color: #f8fafc;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 80vh;
    }
    .header {
      background: #1e1e38;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
    }
    .title-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .title {
      font-size: 13px;
      font-weight: 700;
      color: #f43f5e;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .badge {
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 9999px;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    button {
      background: #334155;
      color: #f8fafc;
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    button:hover {
      background: #475569;
    }
    button.dismiss-btn {
      background: #ef4444;
      color: #ffffff;
    }
    button.dismiss-btn:hover {
      background: #dc2626;
    }
    .content {
      overflow-y: auto;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .mismatch-item {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mismatch-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .type-pill {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .type-tag-mismatch, .type-missing-node, .type-extra-node { background: #991b1b; color: #fecaca; }
    .type-attribute-mismatch, .type-attribute-missing, .type-attribute-extra { background: #854d0e; color: #fef08a; }
    .type-text-mismatch, .type-children-count-mismatch { background: #1e40af; color: #bfdbfe; }
    .path-label {
      font-size: 11px;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .message-text {
      font-size: 12px;
      color: #f1f5f9;
      line-height: 1.4;
    }
    .diff-table {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 4px;
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 8px;
      font-size: 11px;
    }
    .diff-col {
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-x: auto;
    }
    .diff-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
    }
    .diff-server { color: #f87171; word-break: break-all; }
    .diff-client { color: #4ade80; word-break: break-all; }
  `;

  const card = document.createElement('div');
  card.className = 'overlay-card';

  const header = document.createElement('div');
  header.className = 'header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'title-group';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = 'Hydration Mismatch';

  const countBadge = document.createElement('span');
  countBadge.className = 'badge';
  countBadge.textContent = `${mismatches.length} ${mismatches.length === 1 ? 'issue' : 'issues'}`;

  titleGroup.appendChild(title);
  titleGroup.appendChild(countBadge);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const copyBtn = document.createElement('button');
  copyBtn.id = 'ranu-overlay-copy';
  copyBtn.textContent = 'Copy JSON';
  copyBtn.addEventListener('click', () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(mismatches, null, 2)).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
      }).catch(() => {
        copyBtn.textContent = 'Error';
      });
    }
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.id = 'ranu-overlay-dismiss';
  dismissBtn.className = 'dismiss-btn';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', () => {
    container.remove();
  });

  actions.appendChild(copyBtn);
  actions.appendChild(dismissBtn);

  header.appendChild(titleGroup);
  header.appendChild(actions);

  const content = document.createElement('div');
  content.className = 'content';

  for (const m of mismatches) {
    const item = document.createElement('div');
    item.className = 'mismatch-item';

    const itemHeader = document.createElement('div');
    itemHeader.className = 'mismatch-header';

    const pill = document.createElement('span');
    pill.className = `type-pill type-${m.type}`;
    pill.textContent = m.type;

    const pathEl = document.createElement('span');
    pathEl.className = 'path-label';
    pathEl.textContent = m.path;

    itemHeader.appendChild(pill);
    itemHeader.appendChild(pathEl);

    const msg = document.createElement('div');
    msg.className = 'message-text';
    msg.textContent = m.message;

    item.appendChild(itemHeader);
    item.appendChild(msg);

    if (m.serverValue !== undefined || m.clientValue !== undefined) {
      const diffTable = document.createElement('div');
      diffTable.className = 'diff-table';

      const serverCol = document.createElement('div');
      serverCol.className = 'diff-col';
      const sTitle = document.createElement('span');
      sTitle.className = 'diff-title';
      sTitle.textContent = 'Server (SSR)';
      const sVal = document.createElement('code');
      sVal.className = 'diff-server';
      sVal.textContent = m.serverValue ?? '(empty)';
      serverCol.appendChild(sTitle);
      serverCol.appendChild(sVal);

      const clientCol = document.createElement('div');
      clientCol.className = 'diff-col';
      const cTitle = document.createElement('span');
      cTitle.className = 'diff-title';
      cTitle.textContent = 'Client (DOM)';
      const cVal = document.createElement('code');
      cVal.className = 'diff-client';
      cVal.textContent = m.clientValue ?? '(empty)';
      clientCol.appendChild(cTitle);
      clientCol.appendChild(cVal);

      diffTable.appendChild(serverCol);
      diffTable.appendChild(clientCol);
      item.appendChild(diffTable);
    }

    content.appendChild(item);
  }

  card.appendChild(header);
  card.appendChild(content);

  shadow.appendChild(style);
  shadow.appendChild(card);

  return container;
}

/**
 * Auto-initialize the browser hydration overlay listener.
 * Hooks console.error and window error events to detect React 19 hydration mismatches.
 */
export function attachHydrationOverlay(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const globalScope = window as any;
  if (globalScope.__ranu_hydration_overlay_attached__) {
    return;
  }
  globalScope.__ranu_hydration_overlay_attached__ = true;

  // Cache initial SSR markup if available
  let initialServerHtml = '';
  if (document.body) {
    initialServerHtml = document.body.innerHTML;
  }

  function triggerOverlay(detectedMismatches?: HydrationMismatch[]) {
    // Check if overlay already displayed
    if (document.getElementById('ranu-hydration-overlay-root')) {
      return;
    }

    let mismatches = detectedMismatches;
    if (!mismatches || mismatches.length === 0) {
      const rootEl = document.getElementById('root') || document.body.firstElementChild || document.body;
      if (initialServerHtml && rootEl) {
        mismatches = diffServerClientDOM(initialServerHtml, rootEl);
      }
    }

    if (mismatches && mismatches.length > 0) {
      const overlay = renderHydrationOverlay(mismatches);
      document.body.appendChild(overlay);
    }
  }

  // Intercept React hydration mismatch messages on console.error
  const originalConsoleError = console.error;
  console.error = function (...args: unknown[]) {
    originalConsoleError.apply(console, args);

    const joined = args.map((a) => (typeof a === 'string' ? a : (a as any)?.message || '')).join(' ');
    const isHydrationMismatch =
      /hydration/i.test(joined) &&
      (/mismatch/i.test(joined) ||
        /did not match/i.test(joined) ||
        /server-rendered/i.test(joined) ||
        /recoverable error/i.test(joined));

    if (isHydrationMismatch) {
      triggerOverlay();
    }
  };

  // Listen for window error events
  window.addEventListener('error', (event) => {
    const msg = event?.message || '';
    if (/hydration/i.test(msg) && /mismatch/i.test(msg)) {
      triggerOverlay();
    }
  });

  // Listen for explicit custom event
  window.addEventListener('ranu:hydration-error', (event: any) => {
    triggerOverlay(event?.detail?.mismatches);
  });
}
