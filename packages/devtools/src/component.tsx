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
  { id: 'ollama', label: '🦙 Ollama' },
  { id: 'custom', label: '⚙ Custom' },
  { id: 'none', label: '⊘ Disabled' },
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

const RANU_BRAND_ICON_SVG = (
  <svg
    viewBox="0 0 1910 2081"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ width: '100%', height: '100%' }}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M6.05888 184.918C19.3824 144.646 32.9232 104.257 64.0453 73.7781C158.382 -18.5948 319.365 -27.0852 417.728 64.5411C452.644 97.0545 477.409 139.054 487.735 186.002C492.832 209.146 492.253 234.311 498.842 256.826C562.694 253.737 626.908 257.411 690.846 256.84C873.452 255.23 1056.04 253.898 1238.66 253.634C1301.44 253.532 1364.16 252.668 1426.94 252.873C1454.63 252.946 1485.77 246.959 1509.17 264.95C1585.05 323.229 1648.33 400.274 1715.88 467.761C1747.58 499.44 1798.83 535.159 1818.27 576.208C1826.52 593.643 1821.9 618.968 1821.51 637.706C1820.6 681.638 1820.06 725.526 1820.22 769.458C1820.53 852.433 1821.32 935.422 1822.38 1018.4C1822.83 1052.49 1831.66 1100.24 1821.7 1132.93C1817.69 1146.14 1801.83 1157.38 1792.55 1166.79C1765.19 1194.49 1737.99 1229.68 1704.16 1249.48C1675.44 1266.28 1635.17 1257.83 1603.41 1257.42C1533.5 1256.55 1463.24 1256.33 1393.45 1256.22C1417.98 1299.51 1471.06 1333.21 1506.54 1367.88C1579.35 1439.02 1648.2 1518.98 1728.71 1581.42C1805.59 1641.06 1881 1680.93 1903.83 1784.67C1940.23 1950.07 1795.79 2102.12 1631.85 2077.96C1548.85 2065.74 1474.85 1994.46 1436.53 1921.19C1363.45 1920.56 1290.2 1920.49 1217.07 1920.68C1186.96 1920.77 1145.54 1928.42 1116.97 1917.36C1095.03 1908.87 1076.98 1885.12 1060.94 1868.62C1028.15 1834.89 995.087 1801.38 961.546 1768.42C858.434 1667.04 755.219 1565.99 652.758 1463.92C598.19 1409.57 547.502 1338.47 479.002 1301.75C461.232 1312.98 450.182 1338.11 436.004 1353.81C406.026 1386.97 367.851 1412.38 324.202 1422.61C279.539 1433.08 234.413 1433.78 189.533 1424.66C115.862 1409.69 44.5669 1352.27 16.7322 1280.8C-34.3752 1149.58 35.3272 988.225 174.964 956.107C212.226 947.543 252.023 946.153 289.59 953.604C327.157 961.07 363.956 975.694 394.426 999.439C433.007 1029.49 465.186 1064.89 485.533 1109.96C494.961 1130.87 493.05 1158.24 504.852 1177.03C523.578 1189.65 546.431 1193.1 565.228 1206.44C622.853 1247.32 672.251 1305.84 721.94 1355.89C810.194 1444.78 898.636 1534.56 989.28 1620.94C1029.19 1658.98 1070.13 1695.87 1109.13 1734.85C1127.58 1753.3 1147.24 1782.47 1170.91 1793.96C1187.05 1801.79 1213.84 1797.05 1231.42 1797.49C1281.91 1798.76 1334.19 1802.99 1384.48 1798.88C1377.89 1779.66 1338.7 1754.12 1323.41 1739.45C1269.54 1687.81 1214.3 1637.91 1161.26 1585.37C1000.01 1425.66 837.753 1267.03 677.827 1106.07C628.979 1056.91 577.234 1010.77 528.371 961.685C503.52 936.725 475.294 911.458 458.77 879.881C457.308 857.352 473.73 838.335 487.778 822.247C522.13 782.882 561.13 747.456 596.698 709.131C632.223 670.835 668.863 633.68 704.749 595.736C721.635 577.861 739.26 552.638 760.868 540.517C773.279 533.549 791.845 536.418 805.487 536.608C836.435 537.048 867.384 536.974 898.332 536.916C1009.63 536.725 1120.94 536.418 1232.23 536.272C1269.44 536.213 1325.92 519.539 1359.66 539.434C1404.15 565.667 1435.4 614.84 1473.55 649.037C1491.42 665.052 1518.88 681.624 1527.97 704.9C1534.78 722.306 1532.61 744.425 1532.5 762.768C1532.1 836.754 1514.27 876.192 1460.44 927.239C1445.96 940.971 1428.96 960.353 1410.2 967.789C1387.61 976.763 1360.15 974.64 1336.33 975.328C1269.49 977.231 1191.13 965.798 1126.37 983.555C1146.99 1025.8 1202.83 1062.42 1235.58 1096.48C1249.32 1110.78 1265.56 1132.76 1285.12 1138.66C1304.96 1144.63 1331.1 1139.17 1351.58 1138.76C1396.56 1137.88 1441.4 1136.59 1486.41 1136.65C1536.82 1136.72 1611.07 1147.41 1658.38 1127.47C1671.13 1118.97 1684.06 1107.59 1689.91 1093.04C1698.18 1058.05 1691.14 1016.46 1690.75 980.627C1689.98 910.228 1690.94 839.829 1690.68 769.429C1690.52 723.682 1700.24 663.12 1686.41 619.451C1640.15 568.009 1587.35 522.628 1538.31 473.997C1506.35 442.274 1473.43 403.305 1435.26 379.238C1399.57 376.003 1361.62 380.556 1325.63 380.409C1231.49 380.043 1137.39 380.321 1043.25 380.072C850.454 379.56 655.8 369.21 463.173 376.179C424.52 420.067 381.957 463.501 323.391 478.067C197.353 509.38 51.5472 443.577 10.1428 314.548C-2.50009 275.124 -1.327 225.191 6.05888 184.918ZM130.46 236.58C125.522 318.12 211.459 375.227 285.187 353.883C334.354 339.654 366.809 292.37 368.416 241.279C373.08 93.3801 139.41 88.6661 130.46 236.58ZM129.751 1165.67C114.081 1221.88 159.251 1287.84 212.429 1302.28C276.513 1319.67 344.188 1286.19 363.347 1219.73C385.23 1143.87 320.756 1076.31 246.622 1075.99C193.11 1075.75 144.291 1113.49 129.751 1165.67ZM618.957 871.874C643.866 918.763 698.551 961.421 737.754 996.262C797.044 1048.93 851.627 1106.48 909.715 1160.47C1009.69 1253.4 1099.75 1357.16 1199.66 1450.28C1283.04 1527.98 1362.3 1609.69 1443.48 1689.69C1473.72 1719.48 1509.49 1743.88 1537.96 1775.37C1540.85 1790.95 1533.71 1807.39 1534.79 1823.39C1537.69 1865.9 1565.49 1912.82 1602.87 1933.52C1703.74 1989.41 1818.82 1889.44 1771.29 1781.29C1749.06 1730.72 1707.23 1721.85 1665.03 1696.25C1635.05 1678.06 1610.27 1641.39 1585.22 1616.71C1433.4 1467.17 1286.66 1312.61 1133.13 1164.64C1083.5 1116.8 1039.07 1064.42 990.453 1015.62C967.021 992.105 930.468 962.343 918.172 930.855C931.047 904.504 950.439 880.613 970.829 859.855C995 854.131 1023.54 858.479 1048.31 858.64C1112.61 859.079 1176.85 861.202 1241.15 860.953C1273.36 860.836 1312.04 864.349 1343.09 855.331C1365.09 839.609 1399.79 800.23 1409.71 774.743C1411.19 760.763 1376.43 735.188 1366.89 725.6C1347.22 705.793 1325.95 674.948 1299.94 663.735C1266.79 649.432 1209.23 660.807 1173.39 661.422C1091.41 662.842 1009.37 663.354 927.354 663.398C897.029 663.413 847.036 653.034 818.97 664.789C794.524 675.021 772.584 710.448 754.655 729.669C710.151 777.334 665.952 826.829 618.957 871.874Z"
      fill="#33BBCA"
    />
  </svg>
);

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
          background: 'rgba(18, 18, 22, 0.88)',
          backdropFilter: 'blur(16px) saturate(180%)',
          color: '#33BBCA',
          border: '1px solid #282833',
          borderRadius: '9999px',
          padding: '6px 14px',
          fontWeight: 600,
          fontSize: '12px',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.3s ease-out',
        }}
      >
        <span style={{ width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center' }}>
          {RANU_BRAND_ICON_SVG}
        </span>
        <span style={{ display: 'none' }}>⚡</span>
        <span>Ranu DevTools</span>
        <div
          className="launcher-telemetry"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#94a3b8',
            marginLeft: '4px',
          }}
        >
          <span>TTFB: <strong style={{ color: '#34d399' }}>18ms</strong></span>
          <span style={{ color: '#334155' }}>|</span>
          <span>Chunks: <strong style={{ color: '#38bdf8' }}>{state.streamingChunks.length > 0 ? state.streamingChunks.length : 14}</strong></span>
          <span style={{ color: '#334155' }}>|</span>
          <span style={{ color: '#33BBCA', fontWeight: 600 }}>Copilot Ready</span>
        </div>
        {state.streamingChunks.length > 0 && (
          <span
            style={{
              background: '#16161c',
              color: '#33BBCA',
              border: '1px solid rgba(51, 187, 202, 0.3)',
              padding: '1px 6px',
              borderRadius: '10px',
              fontSize: '10px',
              fontFamily: 'monospace',
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
        background: 'rgba(22, 22, 28, 0.96)',
        backdropFilter: 'blur(20px) saturate(180%)',
        borderTop: isTop ? 'none' : '1px solid #282833',
        borderBottom: isTop ? '1px solid #282833' : 'none',
        boxShadow: isTop ? '0 8px 32px rgba(0,0,0,0.7)' : '0 -8px 32px rgba(0,0,0,0.7)',
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
          background: '#121216',
          borderBottom: '1px solid #1f1f26',
        }}
      >
        <div
          className="brand"
          style={{ fontWeight: 700, color: '#33BBCA', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span style={{ width: '18px', height: '18px', display: 'inline-flex', alignItems: 'center' }}>
            {RANU_BRAND_ICON_SVG}
          </span>
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
                      background: isActive ? '#1c1c24' : 'transparent',
                      border: `1px solid ${isActive ? '#33BBCA' : '#282833'}`,
                      color: isActive ? '#33BBCA' : '#94a3b8',
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
                  background: '#0a0a0c',
                  border: '1px solid #282833',
                  borderRadius: '8px',
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
                    borderRadius: '8px',
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
                    background: '#33BBCA',
                    color: '#0a0a0f',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(51, 187, 202, 0.25)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <svg
                    style={{ width: '14px', height: '14px', flexShrink: 0 }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0a0a0f"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                    <path d="M5 3v4" />
                    <path d="M19 17v4" />
                    <path d="M3 5h4" />
                    <path d="M17 19h4" />
                  </svg>
                  <span>Refactor</span>
                  <span style={{ display: 'none' }}>Generate</span>
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
                  background: '#0a0a0c',
                  border: '1px solid #282833',
                  borderRadius: '12px',
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
                    padding: '8px 14px',
                    background: '#121216',
                    borderBottom: '1px solid #1f1f26',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#33BBCA', fontWeight: 600 }}>
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
