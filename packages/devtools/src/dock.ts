import {
  getDevToolsState,
  subscribeDevTools,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  setSelectedPartner,
  setCurrentPrompt,
  acceptAIChanges,
  revertAIChanges,
} from './state.js';
import type { DevToolsDockState, AIStudioPartner } from './types.js';
import { computeLineDiff } from './diff.js';
import { submitAIPrompt, abortAIGeneration } from './client-stream.js';

/**
 * Injects or mounts the floating Ranu DevTools dock into the DOM.
 */
export function mountDevToolsDock(targetDocument?: Document): (() => void) | undefined {
  const doc = targetDocument || (typeof document !== 'undefined' ? document : undefined);
  if (!doc || !doc.body) {
    return undefined;
  }
  const activeDoc: Document = doc;

  const existing = activeDoc.getElementById('ranu-devtools-dock');
  if (existing) {
    return undefined;
  }

  // Keyboard shortcut listener for Alt+D and Ctrl+Shift+D / Cmd+Shift+D
  const handleKeyDown = (evt: Event): void => {
    const e = evt as KeyboardEvent;
    const isAltD = e.altKey && (e.key === 'd' || e.key === 'D');
    const isCtrlShiftD =
      (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D');
    if (isAltD || isCtrlShiftD) {
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      toggleDevToolsDock();
    }
  };
  if (typeof activeDoc.addEventListener === 'function') {
    activeDoc.addEventListener('keydown', handleKeyDown);
  }

  const container = activeDoc.createElement('div');
  container.id = 'ranu-devtools-dock';
  const shadow = container.attachShadow({ mode: 'open' });

  const style = activeDoc.createElement('style');
  style.textContent = `
    :host {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: #f8fafc;
      z-index: 2147483646;
    }
    .launcher {
      position: fixed;
      bottom: 16px;
      left: 16px;
      z-index: 2147483646;
      background: #0f172a;
      color: #38bdf8;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 6px 14px;
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .launcher:hover {
      background: #1e293b;
      border-color: #38bdf8;
      transform: translateY(-1px);
    }
    .panel {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 320px;
      background: #0f172a;
      border-top: 1px solid #334155;
      box-shadow: 0 -8px 24px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      z-index: 2147483646;
      animation: slideUp 0.15s ease-out;
    }
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: #020617;
      border-bottom: 1px solid #1e293b;
    }
    .brand {
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tabs {
      display: flex;
      gap: 4px;
    }
    .tab {
      background: transparent;
      border: none;
      color: #94a3b8;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }
    .tab.active {
      background: #1e293b;
      color: #f8fafc;
    }
    .tab:hover:not(.active) {
      color: #cbd5e1;
    }
    .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 16px;
      padding: 4px 8px;
    }
    .close-btn:hover {
      color: #f8fafc;
    }
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .waterfall-row {
      display: flex;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid #1e293b;
      font-family: monospace;
      font-size: 11px;
    }
    .waterfall-bar {
      height: 8px;
      background: #38bdf8;
      border-radius: 4px;
      margin-left: 12px;
      min-width: 4px;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-success { background: #064e3b; color: #34d399; }
    .badge-warning { background: #78350f; color: #fde047; }
    .badge-error { background: #7f1d1d; color: #fca5a5; }
    .code-block {
      background: #020617;
      padding: 8px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 11px;
      color: #e2e8f0;
      border: 1px solid #1e293b;
    }
    .partner-pill {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
      border-radius: 12px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .partner-pill.active {
      background: #1e293b;
      color: #38bdf8;
      border-color: #38bdf8;
    }
    .partner-pill:hover:not(.active) {
      color: #f8fafc;
      border-color: #64748b;
    }
    .ai-prompt-bar {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .ai-prompt-input {
      flex: 1;
      background: #020617;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #f8fafc;
      padding: 8px 12px;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }
    .ai-prompt-input:focus {
      border-color: #38bdf8;
    }
    .ai-btn-generate {
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .ai-btn-generate:hover {
      background: #0369a1;
    }
    .ai-btn-stop {
      background: #ef4444;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .ai-btn-stop:hover {
      background: #dc2626;
    }
    .ai-btn-accept {
      background: #059669;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .ai-btn-accept:hover {
      background: #047857;
    }
    .ai-btn-revert {
      background: #334155;
      color: #fca5a5;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .ai-btn-revert:hover {
      background: #475569;
      color: #ffffff;
    }
    .diff-container {
      display: flex;
      flex-direction: column;
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 10px;
    }
    .diff-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #0f172a;
      border-bottom: 1px solid #1e293b;
    }
    .diff-table {
      overflow-y: auto;
      max-height: 180px;
      font-family: monospace;
      font-size: 11px;
    }
    .diff-line {
      display: flex;
      padding: 2px 8px;
      line-height: 1.4;
    }
    .diff-line.added {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border-left: 3px solid #22c55e;
    }
    .diff-line.removed {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border-left: 3px solid #ef4444;
    }
    .diff-line.unchanged {
      color: #94a3b8;
      border-left: 3px solid transparent;
    }
    .diff-gutter {
      width: 32px;
      color: #64748b;
      user-select: none;
      flex-shrink: 0;
    }
    .diff-sign {
      width: 16px;
      font-weight: bold;
      user-select: none;
      flex-shrink: 0;
    }
    .diff-text {
      white-space: pre-wrap;
      word-break: break-all;
    }
  `;

  shadow.appendChild(style);

  const wrapper = activeDoc.createElement('div');
  shadow.appendChild(wrapper);

  function render(state: DevToolsDockState): void {
    wrapper.innerHTML = '';

    if (!state.isOpen) {
      const btn = activeDoc.createElement('button');
      btn.className = 'launcher';
      btn.innerHTML = '<span>⚡</span><span>Ranu DevTools</span>';
      if (state.streamingChunks.length > 0) {
        btn.innerHTML += `<span style="background:#1e293b;padding:1px 6px;border-radius:10px;font-size:10px;">${state.streamingChunks.length}</span>`;
      }
      btn.onclick = () => toggleDevToolsDock();
      wrapper.appendChild(btn);
      return;
    }

    const panel = activeDoc.createElement('div');
    panel.className = 'panel';

    const header = activeDoc.createElement('div');
    header.className = 'header';

    const brand = activeDoc.createElement('div');
    brand.className = 'brand';
    brand.innerHTML = '<span>⚡</span><span>Ranu DevTools</span>';

    const tabs = activeDoc.createElement('div');
    tabs.className = 'tabs';

    const tabList: Array<{ id: DevToolsDockState['activeTab']; label: string }> = [
      { id: 'waterfall', label: `Waterfall (${state.streamingChunks.length})` },
      { id: 'routes', label: 'Route Hierarchy' },
      { id: 'hydration', label: `Hydration (${state.hydration.status})` },
      { id: 'diagnostics', label: `Diagnostics (${state.diagnostics.length})` },
      { id: 'ai-studio', label: 'AI Studio ✨' },
    ];

    tabList.forEach((t) => {
      const tabBtn = activeDoc.createElement('button');
      tabBtn.className = `tab ${state.activeTab === t.id ? 'active' : ''}`;
      tabBtn.textContent = t.label;
      tabBtn.onclick = () => setActiveDevToolsTab(t.id);
      tabs.appendChild(tabBtn);
    });

    const closeBtn = activeDoc.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => toggleDevToolsDock();

    header.appendChild(brand);
    header.appendChild(tabs);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const content = activeDoc.createElement('div');
    content.className = 'content';

    if (state.activeTab === 'waterfall') {
      if (state.streamingChunks.length === 0) {
        content.innerHTML = '<div style="color:#64748b;">No streaming chunks recorded yet.</div>';
      } else {
        const list = activeDoc.createElement('div');
        state.streamingChunks.forEach((c) => {
          const row = activeDoc.createElement('div');
          row.className = 'waterfall-row';
          const maxDelta = Math.max(...state.streamingChunks.map((ch) => ch.deltaMs), 1);
          const barWidth = Math.max(10, Math.min(300, Math.round((c.deltaMs / maxDelta) * 250)));
          row.innerHTML = `
            <span style="width:70px;color:#94a3b8;">Chunk #${c.id}</span>
            <span style="width:80px;color:#38bdf8;">+${c.deltaMs}ms</span>
            <span style="width:70px;color:#e2e8f0;">${c.bytes} B</span>
            <div class="waterfall-bar" style="width:${barWidth}px;"></div>
            <span style="margin-left:12px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${c.preview}</span>
          `;
          list.appendChild(row);
        });
        content.appendChild(list);
      }
    } else if (state.activeTab === 'routes') {
      if (!state.currentRoute) {
        content.innerHTML = '<div style="color:#64748b;">No route hierarchy loaded.</div>';
      } else {
        content.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div><strong style="color:#38bdf8;">Active Route:</strong> <code>${state.currentRoute.routeId}</code></div>
            <div><strong>Pathname:</strong> <code>${state.currentRoute.pathname}</code></div>
            <div><strong>Layouts Stack:</strong> ${state.currentRoute.layouts.map((l) => `<code>${l}</code>`).join(' → ') || '<em>None</em>'}</div>
            <div><strong>Loading Boundary:</strong> <code>${state.currentRoute.loading || 'Default'}</code></div>
          </div>
        `;
      }
    } else if (state.activeTab === 'hydration') {
      const badgeClass =
        state.hydration.status === 'success'
          ? 'badge-success'
          : state.hydration.status === 'mismatch'
            ? 'badge-warning'
            : state.hydration.status === 'error'
              ? 'badge-error'
              : 'badge-warning';

      content.innerHTML = `
        <div style="margin-bottom:12px;">
          <span class="badge ${badgeClass}">Status: ${state.hydration.status.toUpperCase()}</span>
          ${state.hydration.hydrationTimeMs !== undefined ? `<span style="margin-left:10px;color:#94a3b8;">Hydrated in ${state.hydration.hydrationTimeMs}ms</span>` : ''}
        </div>
      `;

      if (state.hydration.mismatches.length > 0) {
        const table = activeDoc.createElement('div');
        state.hydration.mismatches.forEach((m) => {
          const item = activeDoc.createElement('div');
          item.style.borderBottom = '1px solid #1e293b';
          item.style.padding = '8px 0';
          item.innerHTML = `
            <div style="color:#fde047;font-weight:600;">${m.type}: <code>${m.path}</code></div>
            <div style="color:#cbd5e1;font-size:12px;margin:4px 0;">${m.message}</div>
          `;
          table.appendChild(item);
        });
        content.appendChild(table);
      } else {
        content.innerHTML += '<div style="color:#34d399;">✓ Perfect hydration. No DOM mismatches detected.</div>';
      }
    } else if (state.activeTab === 'diagnostics') {
      if (state.diagnostics.length === 0) {
        content.innerHTML = '<div style="color:#34d399;">✓ Zero compiler or AST invariant diagnostics.</div>';
      } else {
        const diagList = activeDoc.createElement('div');
        state.diagnostics.forEach((d) => {
          const card = activeDoc.createElement('div');
          card.style.marginBottom = '12px';
          card.innerHTML = `
            <div style="color:#f87171;font-weight:600;">[${d.code}] ${d.message}</div>
            ${d.location ? `<div style="color:#64748b;font-size:11px;">at ${d.location.file || ''}:${d.location.line || ''}</div>` : ''}
            ${d.hint ? `<div class="code-block" style="margin-top:4px;">💡 Hint: ${d.hint}</div>` : ''}
          `;
          diagList.appendChild(card);
        });
        content.appendChild(diagList);
      }
    } else if (state.activeTab === 'ai-studio') {
      const aiStudioContainer = activeDoc.createElement('div');
      aiStudioContainer.className = 'ai-studio-container';
      aiStudioContainer.style.display = 'flex';
      aiStudioContainer.style.flexDirection = 'column';
      aiStudioContainer.style.gap = '8px';

      // 1. Partner pills
      const partnersRow = activeDoc.createElement('div');
      partnersRow.style.display = 'flex';
      partnersRow.style.gap = '6px';
      partnersRow.style.alignItems = 'center';
      partnersRow.style.flexWrap = 'wrap';

      const partnerLabel = activeDoc.createElement('span');
      partnerLabel.style.fontSize = '11px';
      partnerLabel.style.color = '#94a3b8';
      partnerLabel.style.fontWeight = '600';
      partnerLabel.textContent = 'PARTNER:';
      partnersRow.appendChild(partnerLabel);

      const partners: Array<{ id: AIStudioPartner; label: string }> = [
        { id: 'gemini', label: '✦ Gemini' },
        { id: 'groq', label: '⚡ Groq' },
        { id: 'claude', label: '▲ Claude' },
        { id: 'openai', label: '● OpenAI' },
        { id: 'custom', label: '⚙ Custom' },
      ];

      partners.forEach((p) => {
        const pill = activeDoc.createElement('button');
        pill.className = `partner-pill ${state.aiStudio.selectedPartner === p.id ? 'active' : ''}`;
        pill.textContent = p.label;
        pill.onclick = () => setSelectedPartner(p.id);
        partnersRow.appendChild(pill);
      });
      aiStudioContainer.appendChild(partnersRow);

      // 2. Prompt bar
      const promptBar = activeDoc.createElement('div');
      promptBar.className = 'ai-prompt-bar';

      const promptInput = activeDoc.createElement('input') as HTMLInputElement;
      promptInput.className = 'ai-prompt-input';
      promptInput.placeholder =
        'Describe UI or API changes (e.g. "Add streaming counter", "Convert to Client Component")...';
      promptInput.value = state.aiStudio.currentPrompt;
      promptInput.disabled = state.aiStudio.isGenerating;
      promptInput.oninput = (e: Event) => {
        const target = e.target as HTMLInputElement | null;
        setCurrentPrompt(target?.value ?? promptInput.value);
      };
      promptInput.onkeydown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && promptInput.value.trim()) {
          void submitAIPrompt(promptInput.value);
        }
      };
      promptBar.appendChild(promptInput);

      if (state.aiStudio.isGenerating) {
        const stopBtn = activeDoc.createElement('button');
        stopBtn.className = 'ai-btn-stop';
        stopBtn.textContent = 'Stop';
        stopBtn.onclick = () => abortAIGeneration();
        promptBar.appendChild(stopBtn);
      } else {
        const generateBtn = activeDoc.createElement('button');
        generateBtn.className = 'ai-btn-generate';
        generateBtn.textContent = 'Generate';
        generateBtn.onclick = () => {
          if (promptInput.value.trim()) {
            void submitAIPrompt(promptInput.value);
          }
        };
        promptBar.appendChild(generateBtn);
      }
      aiStudioContainer.appendChild(promptBar);

      // 3. Error message if any
      if (state.aiStudio.error) {
        const errBox = activeDoc.createElement('div');
        errBox.style.color = '#f87171';
        errBox.style.background = 'rgba(239, 68, 68, 0.1)';
        errBox.style.border = '1px solid #ef4444';
        errBox.style.padding = '8px 12px';
        errBox.style.borderRadius = '6px';
        errBox.style.fontSize = '12px';
        errBox.textContent = `Error: ${state.aiStudio.error}`;
        aiStudioContainer.appendChild(errBox);
      }

      // 4. Visual Diff or Streaming Preview or Placeholder
      if (state.aiStudio.pendingDiff) {
        const diff = state.aiStudio.pendingDiff;
        const diffContainer = activeDoc.createElement('div');
        diffContainer.className = 'diff-container';

        const toolbar = activeDoc.createElement('div');
        toolbar.className = 'diff-toolbar';

        const info = activeDoc.createElement('div');
        info.style.display = 'flex';
        info.style.alignItems = 'center';
        info.style.gap = '8px';
        info.innerHTML = `
          <span style="color:#38bdf8;font-weight:600;">📄 ${diff.filePath}</span>
          <span style="font-size:11px;color:#94a3b8;">${diff.patchSummary}</span>
        `;
        toolbar.appendChild(info);

        const actions = activeDoc.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';

        const revertBtn = activeDoc.createElement('button');
        revertBtn.className = 'ai-btn-revert';
        revertBtn.textContent = '✕ Discard';
        revertBtn.onclick = () => revertAIChanges();
        actions.appendChild(revertBtn);

        const acceptBtn = activeDoc.createElement('button');
        acceptBtn.className = 'ai-btn-accept';
        acceptBtn.textContent = '✓ Accept Changes';
        acceptBtn.onclick = () => {
          void acceptAIChanges(diff);
        };
        actions.appendChild(acceptBtn);

        toolbar.appendChild(actions);
        diffContainer.appendChild(toolbar);

        const table = activeDoc.createElement('div');
        table.className = 'diff-table';

        const diffLines = computeLineDiff(diff.originalContent, diff.proposedContent);
        diffLines.forEach((line) => {
          const row = activeDoc.createElement('div');
          row.className = `diff-line ${line.type}`;

          const origGutter = activeDoc.createElement('span');
          origGutter.className = 'diff-gutter';
          origGutter.textContent =
            line.originalLineNumber !== undefined ? String(line.originalLineNumber) : '';
          row.appendChild(origGutter);

          const modGutter = activeDoc.createElement('span');
          modGutter.className = 'diff-gutter';
          modGutter.textContent =
            line.modifiedLineNumber !== undefined ? String(line.modifiedLineNumber) : '';
          row.appendChild(modGutter);

          const sign = activeDoc.createElement('span');
          sign.className = 'diff-sign';
          sign.textContent = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          row.appendChild(sign);

          const text = activeDoc.createElement('span');
          text.className = 'diff-text';
          text.textContent = line.content;
          row.appendChild(text);

          table.appendChild(row);
        });

        diffContainer.appendChild(table);
        aiStudioContainer.appendChild(diffContainer);
      } else if (state.aiStudio.streamingResponse) {
        const preview = activeDoc.createElement('div');
        preview.className = 'code-block';
        preview.style.whiteSpace = 'pre-wrap';
        preview.style.maxHeight = '180px';
        preview.style.overflowY = 'auto';
        preview.textContent = state.aiStudio.streamingResponse;
        aiStudioContainer.appendChild(preview);
      } else {
        const placeholder = activeDoc.createElement('div');
        placeholder.style.color = '#64748b';
        placeholder.style.textAlign = 'center';
        placeholder.style.padding = '24px 0';
        placeholder.textContent =
          'Select an AI partner, enter your instructions above, and review visual diffs in real-time.';
        aiStudioContainer.appendChild(placeholder);
      }

      content.appendChild(aiStudioContainer);
    }

    if (state.dockPosition === 'top') {
      panel.style.top = '0';
      panel.style.bottom = 'auto';
      panel.style.borderTop = 'none';
      panel.style.borderBottom = '1px solid #334155';
    }

    panel.appendChild(content);
    wrapper.appendChild(panel);
  }

  const unsubscribe = subscribeDevTools((state) => {
    render(state);
  });

  render(getDevToolsState());
  activeDoc.body.appendChild(container);

  return () => {
    unsubscribe();
    if (typeof activeDoc.removeEventListener === 'function') {
      activeDoc.removeEventListener('keydown', handleKeyDown);
    }
    container.remove();
  };
}
