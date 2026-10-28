'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
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
import type { DevToolsDockState, DevToolsTab, AIStudioPartner } from './types.js';
import { computeLineDiff } from './diff.js';
import { submitAIPrompt, abortAIGeneration } from './client-stream.js';

const PARTNERS: Array<{ id: AIStudioPartner; label: string }> = [
  { id: 'gemini', label: '✦ Gemini' },
  { id: 'groq', label: '⚡ Groq' },
  { id: 'claude', label: '▲ Claude' },
  { id: 'openai', label: '● OpenAI' },
  { id: 'custom', label: '⚙ Custom' },
];

const getServerSnapshot = (): DevToolsDockState => getDevToolsState();

/**
 * Checks whether a React dispatcher is available to prevent null dispatcher crashes
 * when evaluated in Server Components or environments without an active dispatcher.
 */
function isDispatcherAvailable(): boolean {
  try {
    const internals =
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
      (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    if (internals) {
      const dispatcher =
        internals.H !== undefined ? internals.H : internals.ReactCurrentDispatcher?.current;
      if (dispatcher === null) {
        return false;
      }
    }
  } catch {
    // Proceed if internals inspection fails
  }
  return true;
}

/**
 * React 19 component providing in-browser visual inspection for streaming, routes, hydration,
 * and the native AI Studio developer dock panel with Visual Diff review.
 */
export function RanuDevTools(): React.ReactElement | null {
  // Safe in production: no-op if not in development mode
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  // Safe in Server Component passes where React dispatcher is null
  if (!isDispatcherAvailable()) {
    return null;
  }

  const state = useSyncExternalStore(
    subscribeDevTools,
    getDevToolsState,
    getServerSnapshot
  );

  // Keyboard shortcut listener for Alt+D and Ctrl+Shift+D / Cmd+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
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
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, []);

  if (!state.isOpen) {
    const isTop = state.dockPosition === 'top';
    return (
      <button
        type="button"
        className="launcher"
        onClick={toggleDevToolsDock}
        style={{
          position: 'fixed',
          top: isTop ? '16px' : 'auto',
          bottom: isTop ? 'auto' : '16px',
          left: '16px',
          zIndex: 2147483646,
          background: '#0f172a',
          color: '#38bdf8',
          border: '1px solid #334155',
          borderRadius: '20px',
          padding: '6px 14px',
          fontWeight: 600,
          fontSize: '12px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>⚡</span>
        <span>Ranu DevTools</span>
        {state.streamingChunks.length > 0 && (
          <span
            style={{
              background: '#1e293b',
              padding: '1px 6px',
              borderRadius: '10px',
              fontSize: '10px',
            }}
          >
            {state.streamingChunks.length}
          </span>
        )}
      </button>
    );
  }

  const isTop = state.dockPosition === 'top';
  const tabList: Array<{ id: DevToolsTab; label: string }> = [
    { id: 'waterfall', label: `Waterfall (${state.streamingChunks.length})` },
    { id: 'routes', label: 'Route Hierarchy' },
    { id: 'hydration', label: `Hydration (${state.hydration.status})` },
    { id: 'diagnostics', label: `Diagnostics (${state.diagnostics.length})` },
    { id: 'ai-studio', label: 'AI Studio ✨' },
  ];

  return (
    <div
      className="panel"
      style={{
        position: 'fixed',
        top: isTop ? 0 : 'auto',
        bottom: isTop ? 'auto' : 0,
        left: 0,
        right: 0,
        height: '320px',
        background: '#0f172a',
        borderTop: isTop ? 'none' : '1px solid #334155',
        borderBottom: isTop ? '1px solid #334155' : 'none',
        boxShadow: isTop ? '0 8px 24px rgba(0,0,0,0.5)' : '0 -8px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483646,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        color: '#f8fafc',
      }}
    >
      <div
        className="header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#020617',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div
          className="brand"
          style={{ fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>⚡</span>
          <span>Ranu DevTools</span>
        </div>
        <div className="tabs" style={{ display: 'flex', gap: '4px' }}>
          {tabList.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${state.activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveDevToolsTab(t.id)}
              style={{
                background: state.activeTab === t.id ? '#1e293b' : 'transparent',
                border: 'none',
                color: state.activeTab === t.id ? '#f8fafc' : '#94a3b8',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="close-btn"
          onClick={toggleDevToolsDock}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px 8px',
          }}
        >
          ✕
        </button>
      </div>

      <div className="content" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {state.activeTab === 'waterfall' && (
          <div>
            {state.streamingChunks.length === 0 ? (
              <div style={{ color: '#64748b' }}>No streaming chunks recorded.</div>
            ) : (
              state.streamingChunks.map((c) => (
                <div
                  key={c.id}
                  className="waterfall-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #1e293b',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ width: '70px', color: '#94a3b8' }}>Chunk #{c.id}</span>
                  <span style={{ width: '80px', color: '#38bdf8' }}>+{c.deltaMs}ms</span>
                  <span style={{ width: '70px', color: '#e2e8f0' }}>{c.bytes} B</span>
                  <span style={{ marginLeft: '12px', color: '#64748b' }}>{c.preview}</span>
                </div>
              ))
            )}
          </div>
        )}

        {state.activeTab === 'routes' && (
          <div>
            {state.currentRoute ? (
              <div>
                <div>
                  <strong style={{ color: '#38bdf8' }}>Route:</strong> {state.currentRoute.routeId}
                </div>
                <div>
                  <strong>Path:</strong> {state.currentRoute.pathname}
                </div>
              </div>
            ) : (
              <div style={{ color: '#64748b' }}>No route active.</div>
            )}
          </div>
        )}

        {state.activeTab === 'hydration' && (
          <div>
            <div style={{ color: state.hydration.status === 'success' ? '#34d399' : '#fde047' }}>
              Status: {state.hydration.status.toUpperCase()}
            </div>
          </div>
        )}

        {state.activeTab === 'diagnostics' && (
          <div>
            {state.diagnostics.length === 0 ? (
              <div style={{ color: '#34d399' }}>✓ Zero diagnostics.</div>
            ) : (
              state.diagnostics.map((d, i) => (
                <div key={i} style={{ color: '#f87171' }}>
                  [{d.code}] {d.message}
                </div>
              ))
            )}
          </div>
        )}

        {state.activeTab === 'ai-studio' && (
          <div
            className="ai-studio-container"
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {/* Partner Switcher */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>PARTNER:</span>
              {PARTNERS.map((p) => {
                const isActive = state.aiStudio.selectedPartner === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`partner-pill ${isActive ? 'active' : ''}`}
                    onClick={() => setSelectedPartner(p.id)}
                    style={{
                      background: isActive ? '#1e293b' : 'transparent',
                      border: `1px solid ${isActive ? '#38bdf8' : '#334155'}`,
                      color: isActive ? '#38bdf8' : '#94a3b8',
                      borderRadius: '12px',
                      padding: '2px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Prompt Bar */}
            <div className="ai-prompt-bar" style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                type="text"
                className="ai-prompt-input"
                placeholder='Describe UI or API changes (e.g. "Add streaming counter", "Convert to Client Component")...'
                value={state.aiStudio.currentPrompt}
                disabled={state.aiStudio.isGenerating}
                onChange={(e) => setCurrentPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && state.aiStudio.currentPrompt.trim()) {
                    void submitAIPrompt(state.aiStudio.currentPrompt);
                  }
                }}
                style={{
                  flex: 1,
                  background: '#020617',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '8px 12px',
                  fontSize: '12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              {state.aiStudio.isGenerating ? (
                <button
                  type="button"
                  className="ai-btn-stop"
                  onClick={abortAIGeneration}
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="ai-btn-generate"
                  onClick={() => {
                    if (state.aiStudio.currentPrompt.trim()) {
                      void submitAIPrompt(state.aiStudio.currentPrompt);
                    }
                  }}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Generate
                </button>
              )}
            </div>

            {/* Error Message */}
            {state.aiStudio.error && (
              <div
                style={{
                  color: '#f87171',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                {`Error: ${state.aiStudio.error}`}
              </div>
            )}

            {/* Visual Diff or Streaming Preview or Placeholder */}
            {state.aiStudio.pendingDiff ? (
              <div
                className="diff-container"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  marginTop: '10px',
                }}
              >
                {/* Diff Toolbar */}
                <div
                  className="diff-toolbar"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#0f172a',
                    borderBottom: '1px solid #1e293b',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                      📄 {state.aiStudio.pendingDiff.filePath}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {state.aiStudio.pendingDiff.patchSummary}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="ai-btn-revert"
                      onClick={() => revertAIChanges()}
                      style={{
                        background: '#334155',
                        color: '#fca5a5',
                        border: '1px solid #475569',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ✕ Discard
                    </button>
                    <button
                      type="button"
                      className="ai-btn-accept"
                      onClick={() => {
                        void acceptAIChanges(state.aiStudio.pendingDiff!);
                      }}
                      style={{
                        background: '#059669',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '4px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ✓ Accept Changes
                    </button>
                  </div>
                </div>

                {/* Diff Table */}
                <div
                  className="diff-table"
                  style={{
                    overflowY: 'auto',
                    maxHeight: '180px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                >
                  {computeLineDiff(
                    state.aiStudio.pendingDiff.originalContent,
                    state.aiStudio.pendingDiff.proposedContent,
                  ).map((line, idx) => (
                    <div
                      key={idx}
                      className={`diff-line ${line.type}`}
                      style={{
                        display: 'flex',
                        padding: '2px 8px',
                        lineHeight: 1.4,
                        background:
                          line.type === 'added'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : line.type === 'removed'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'transparent',
                        color:
                          line.type === 'added'
                            ? '#4ade80'
                            : line.type === 'removed'
                              ? '#f87171'
                              : '#94a3b8',
                        borderLeft:
                          line.type === 'added'
                            ? '3px solid #22c55e'
                            : line.type === 'removed'
                              ? '3px solid #ef4444'
                              : '3px solid transparent',
                      }}
                    >
                      <span
                        className="diff-gutter"
                        style={{ width: '32px', color: '#64748b', userSelect: 'none', flexShrink: 0 }}
                      >
                        {line.originalLineNumber !== undefined ? line.originalLineNumber : ''}
                      </span>
                      <span
                        className="diff-gutter"
                        style={{ width: '32px', color: '#64748b', userSelect: 'none', flexShrink: 0 }}
                      >
                        {line.modifiedLineNumber !== undefined ? line.modifiedLineNumber : ''}
                      </span>
                      <span
                        className="diff-sign"
                        style={{ width: '16px', fontWeight: 'bold', userSelect: 'none', flexShrink: 0 }}
                      >
                        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                      </span>
                      <span
                        className="diff-text"
                        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                      >
                        {line.content}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : state.aiStudio.streamingResponse ? (
              <div
                className="code-block"
                style={{
                  background: '#020617',
                  padding: '8px',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#e2e8f0',
                  border: '1px solid #1e293b',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}
              >
                {state.aiStudio.streamingResponse}
              </div>
            ) : (
              <div style={{ color: '#64748b', textAlign: 'center', padding: '24px 0' }}>
                Select an AI partner, enter your instructions above, and review visual diffs in real-time.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
