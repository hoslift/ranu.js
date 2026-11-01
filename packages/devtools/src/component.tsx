import React, { useEffect, useState } from 'react';
import {
  getDevToolsState,
  subscribeDevTools,
  toggleDevToolsDock,
  setActiveDevToolsTab,
} from './state.js';
import type { DevToolsDockState } from './types.js';

/**
 * React 19 component providing in-browser visual inspection for streaming, routes, and hydration.
 */
export function RanuDevTools(): React.ReactElement | null {
  const [state, setState] = useState<DevToolsDockState>(getDevToolsState);

  useEffect(() => {
    return subscribeDevTools((nextState) => {
      setState(nextState);
    });
  }, []);

  // Safe in production: no-op if not in development mode
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  if (!state.isOpen) {
    return (
      <button
        type="button"
        onClick={toggleDevToolsDock}
        style={{
          position: 'fixed',
          bottom: '16px',
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

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '320px',
        background: '#0f172a',
        borderTop: '1px solid #334155',
        boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2147483646,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#020617',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div style={{ fontWeight: 700, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>⚡</span>
          <span>Ranu DevTools</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['waterfall', 'routes', 'hydration', 'diagnostics'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveDevToolsTab(tab)}
              style={{
                background: state.activeTab === tab ? '#1e293b' : 'transparent',
                border: 'none',
                color: state.activeTab === tab ? '#f8fafc' : '#94a3b8',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {state.activeTab === 'waterfall' && (
          <div>
            {state.streamingChunks.length === 0 ? (
              <div style={{ color: '#64748b' }}>No streaming chunks recorded.</div>
            ) : (
              state.streamingChunks.map((c) => (
                <div
                  key={c.id}
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
                <div><strong style={{ color: '#38bdf8' }}>Route:</strong> {state.currentRoute.routeId}</div>
                <div><strong>Path:</strong> {state.currentRoute.pathname}</div>
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
      </div>
    </div>
  );
}
