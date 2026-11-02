/**
 * Canonical browser development client script with React Fast Refresh & CSS HMR support.
 * Injected in HTML responses during development mode.
 * Connects to /_ranu/dev-reload via SSE, applies hot updates, and falls back to full reload.
 */
export const DEV_CLIENT_SCRIPT = `
(function() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

  // 1. Initialize React Fast Refresh Global Runtime
  var refreshRuntime = {
    registeredComponents: new Map(),
    signatures: new Map(),
    listeners: new Set(),

    register: function(type, id) {
      if (type && (typeof type === 'function' || typeof type === 'object')) {
        refreshRuntime.registeredComponents.set(id, type);
      }
    },

    createSignatureFunctionForTransform: function() {
      var savedType = null;
      return function(type, key, customHooks) {
        if (typeof key === 'string') {
          savedType = type;
          refreshRuntime.signatures.set(type, { key: key, customHooks: customHooks || [] });
          return type;
        }
        return savedType;
      };
    },

    isLikelyComponentType: function(type) {
      if (typeof type === 'function') {
        var name = type.name || type.displayName;
        return typeof name === 'string' && /^[A-Z]/.test(name);
      }
      if (typeof type === 'object' && type !== null) {
        var marker = type.$$typeof;
        if (typeof marker === 'symbol') {
          var description = marker.description || '';
          return description.indexOf('react.memo') !== -1 || description.indexOf('react.forward_ref') !== -1;
        }
      }
      return false;
    },

    isRefreshBoundary: function(exports) {
      if (!exports) return false;
      if (refreshRuntime.isLikelyComponentType(exports)) return true;
      if (typeof exports !== 'object') return false;

      var keys = Object.keys(exports);
      var hasExports = false;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === '__esModule' || k === '$$typeof') continue;
        hasExports = true;
        if (!refreshRuntime.isLikelyComponentType(exports[k])) return false;
      }
      return hasExports;
    },

    onRefresh: function(fn) {
      refreshRuntime.listeners.add(fn);
      return function() { refreshRuntime.listeners.delete(fn); };
    },

    performReactRefresh: function() {
      // Trigger React devtools / custom listeners
      refreshRuntime.listeners.forEach(function(fn) {
        try { fn(); } catch(e) { console.error('[Ranu HMR] Refresh listener error:', e); }
      });
      // Dispatch custom DOM event for active React roots
      window.dispatchEvent(new CustomEvent('ranu:fast-refresh'));
    }
  };

  window.__ranu_refresh__ = refreshRuntime;
  window.$RefreshReg$ = function(type, id) { refreshRuntime.register(type, id); };
  window.$RefreshSig$ = refreshRuntime.createSignatureFunctionForTransform;

  // 2. CSS Hot Replacement
  function updateCss(update) {
    var cleanUrl = update.url.split('?')[0];
    var baseName = cleanUrl.split('/').pop().replace(/\\.[a-f0-9]+\\.css$/i, '').replace(/\\.css$/i, '');
    var links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    var targetLink = links.find(function(link) {
      return link.href && (link.href.indexOf(baseName) !== -1 || link.href.indexOf(cleanUrl) !== -1);
    });

    var newLink = document.createElement('link');
    newLink.rel = 'stylesheet';
    newLink.href = update.url;

    newLink.onload = function() {
      if (targetLink && targetLink.parentNode) {
        targetLink.parentNode.removeChild(targetLink);
      }
    };

    document.head.appendChild(newLink);
  }

  // 3. JS Component Hot Update
  function updateJs(update) {
    import(update.url)
      .then(function(mod) {
        var boundaryValid = refreshRuntime.isRefreshBoundary(mod.default || mod);
        if (boundaryValid) {
          refreshRuntime.performReactRefresh();
        } else {
          window.location.reload();
        }
      })
      .catch(function(err) {
        console.warn('[Ranu HMR] Dynamic module import failed, falling back to full reload:', err);
        window.location.reload();
      });
  }

  // 4. SSE HMR Channel Listener
  var reloadEndpoint = '/_ranu/dev-reload';
  var source = null;
  var reconnectTimer = null;
  var lastAppliedGeneration = 0;

  function connect() {
    if (source) {
      source.close();
    }

    source = new EventSource(reloadEndpoint);

    source.addEventListener('connected', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.generation) {
          lastAppliedGeneration = data.generation;
        }
      } catch (err) {}
    });

    source.addEventListener('update', function(e) {
      try {
        var data = JSON.parse(e.data);
        if (data.generation && data.generation <= lastAppliedGeneration) {
          return; // Reject stale updates
        }
        lastAppliedGeneration = data.generation || lastAppliedGeneration;
        dismissBuildErrorOverlay();

        if (Array.isArray(data.updates)) {
          data.updates.forEach(function(u) {
            if (u.type === 'css') {
              updateCss(u);
            } else if (u.type === 'js') {
              updateJs(u);
            }
          });
        }
      } catch (err) {
        console.error('[Ranu HMR] Update error:', err);
        window.location.reload();
      }
    });

    source.addEventListener('reload', function(e) {
      dismissBuildErrorOverlay();
      window.location.reload();
    });

    source.addEventListener('build-error', function(e) {
      try {
        var data = JSON.parse(e.data);
        var diagnostics = data && Array.isArray(data.diagnostics) ? data.diagnostics : [];
        if (diagnostics.length === 0 && data) {
          diagnostics = [{
            code: 'RANU_BUILD_ERROR',
            severity: 'error',
            message: data.message || data.error || 'Compilation failed with unknown build error.',
          }];
        }
        showBuildErrorOverlay(diagnostics);
      } catch (err) {
        console.error('[Ranu HMR] Failed to process build error event:', err);
      }
    });

    source.addEventListener('recovered', function(e) {
      dismissBuildErrorOverlay();
    });

    source.addEventListener('error', function(e) {
      source.close();
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(function() {
          reconnectTimer = null;
          connect();
        }, 1500);
      }
    });
  }

  // 5. Development Build Error Overlay
  function dismissBuildErrorOverlay() {
    var existing = document.getElementById('ranu-build-error-overlay-root');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function showBuildErrorOverlay(diagnostics) {
    if (!diagnostics || diagnostics.length === 0) return;
    dismissBuildErrorOverlay();

    var container = document.createElement('div');
    container.id = 'ranu-build-error-overlay-root';
    container.style.cssText = 'position:fixed;inset:0;z-index:9999999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.85);backdrop-filter:blur(6px);padding:20px;pointer-events:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;box-sizing:border-box;';

    var root = typeof container.attachShadow === 'function' ? container.attachShadow({ mode: 'open' }) : container;

    var style = document.createElement('style');
    style.textContent = [
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      '.modal { background: #0f172a; border: 1px solid #ef4444; border-radius: 12px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); color: #f8fafc; max-width: 860px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; }',
      '.header { background: #1e1e38; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; }',
      '.title-wrap { display: flex; align-items: center; gap: 10px; }',
      '.title { font-size: 13px; font-weight: 700; color: #ef4444; text-transform: uppercase; letter-spacing: 0.05em; }',
      '.badge { background: #ef4444; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; }',
      '.actions { display: flex; gap: 8px; }',
      'button { background: #334155; color: #f8fafc; border: none; border-radius: 6px; padding: 5px 12px; font-size: 11px; font-weight: 600; cursor: pointer; transition: background 0.15s; }',
      'button:hover { background: #475569; }',
      '.dismiss-btn { background: #ef4444; color: #fff; }',
      '.dismiss-btn:hover { background: #dc2626; }',
      '.content { overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }',
      '.item { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }',
      '.item-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }',
      '.code-badge { font-size: 11px; font-weight: 700; background: #450a0a; color: #fca5a5; padding: 2px 6px; border-radius: 4px; border: 1px solid #991b1b; }',
      '.location { font-size: 11px; color: #38bdf8; word-break: break-all; }',
      '.route { font-size: 11px; color: #94a3b8; }',
      '.message { font-size: 12px; color: #f1f5f9; line-height: 1.5; white-space: pre-wrap; word-break: break-word; background: #090d16; padding: 10px; border-radius: 6px; border: 1px solid #1e293b; font-family: inherit; }',
      '.hint { font-size: 11px; color: #bae6fd; background: #0c4a6e; border-left: 3px solid #0284c7; padding: 8px 10px; border-radius: 0 4px 4px 0; }',
      '.trace { font-size: 10px; color: #94a3b8; padding-left: 10px; border-left: 2px solid #334155; display: flex; flex-direction: column; gap: 2px; }'
    ].join('');

    var modal = document.createElement('div');
    modal.className = 'modal';

    var header = document.createElement('div');
    header.className = 'header';

    var titleWrap = document.createElement('div');
    titleWrap.className = 'title-wrap';
    var count = diagnostics.length;
    titleWrap.innerHTML = '<span class="title">Build Error</span><span class="badge">' + count + (count === 1 ? ' error' : ' errors') + '</span>';

    var actions = document.createElement('div');
    actions.className = 'actions';

    var copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy Error';
    copyBtn.onclick = function() {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        var text = diagnostics.map(function(d) {
          var loc = d.location && d.location.file ? d.location.file + (d.location.line ? ':' + d.location.line : '') : '';
          return '[' + d.code + '] ' + (loc ? loc + ' - ' : '') + d.message + (d.hint ? '\\n  Hint: ' + d.hint : '');
        }).join('\\n\\n');
        navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied!';
        setTimeout(function() { copyBtn.textContent = 'Copy Error'; }, 1500);
      }
    };

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'dismiss-btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.onclick = function() { dismissBuildErrorOverlay(); };

    actions.appendChild(copyBtn);
    actions.appendChild(dismissBtn);
    header.appendChild(titleWrap);
    header.appendChild(actions);

    var content = document.createElement('div');
    content.className = 'content';

    diagnostics.forEach(function(d) {
      var item = document.createElement('div');
      item.className = 'item';

      var itemHeader = document.createElement('div');
      itemHeader.className = 'item-header';
      var locText = d.location && d.location.file
        ? d.location.file + (d.location.line ? ':' + d.location.line + (d.location.column ? ':' + d.location.column : '') : '')
        : (d.routeId ? 'Route: ' + d.routeId : '');
      itemHeader.innerHTML = '<span class="code-badge">' + (d.code || 'RANU_BUILD_ERROR') + '</span>' + (locText ? '<span class="location">' + locText + '</span>' : '');

      var msg = document.createElement('pre');
      msg.className = 'message';
      msg.textContent = d.message || '';

      item.appendChild(itemHeader);
      item.appendChild(msg);

      if (d.hint) {
        var hintEl = document.createElement('div');
        hintEl.className = 'hint';
        hintEl.textContent = '💡 Hint: ' + d.hint;
        item.appendChild(hintEl);
      }

      if (Array.isArray(d.importChain) && d.importChain.length > 0) {
        var traceEl = document.createElement('div');
        traceEl.className = 'trace';
        traceEl.innerHTML = d.importChain.map(function(mod, idx) {
          return '<span>' + (idx + 1) + '. ' + mod + '</span>';
        }).join('');
        item.appendChild(traceEl);
      }

      content.appendChild(item);
    });

    modal.appendChild(header);
    modal.appendChild(content);
    root.appendChild(style);
    root.appendChild(modal);
    if (document.body) {
      document.body.appendChild(container);
    }
  }

  // 6. Browser Hydration Visual Diff Overlay & Error Hook
  var originalConsoleError = console.error;
  var initialSsrMarkup = document.body ? document.body.innerHTML : '';

  function showHydrationOverlay(mismatches) {
    if (document.getElementById('ranu-hydration-overlay-root')) return;

    var container = document.createElement('div');
    container.id = 'ranu-hydration-overlay-root';
    container.style.cssText = 'position:fixed;z-index:999999;bottom:20px;right:20px;max-width:680px;width:calc(100vw - 40px);max-height:80vh;pointer-events:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;';

    var shadow = container.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = [
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      '.card { background: #0f172a; border: 1px solid #e11d48; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); color: #f8fafc; overflow: hidden; display: flex; flex-direction: column; max-height: 80vh; }',
      '.header { background: #1e1e38; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; }',
      '.title { font-size: 13px; font-weight: 700; color: #f43f5e; text-transform: uppercase; }',
      '.badge { background: #ef4444; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; }',
      'button { background: #334155; color: #f8fafc; border: none; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 600; cursor: pointer; }',
      'button:hover { background: #475569; }',
      '.dismiss-btn { background: #ef4444; color: #fff; }',
      '.dismiss-btn:hover { background: #dc2626; }',
      '.content { overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }',
      '.item { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }',
      '.type-pill { font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: #991b1b; color: #fecaca; }',
      '.path { font-size: 11px; color: #94a3b8; }',
      '.msg { font-size: 12px; color: #f1f5f9; }',
      '.diff-table { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; background: #090d16; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; font-size: 11px; }',
      '.diff-server { color: #f87171; word-break: break-all; }',
      '.diff-client { color: #4ade80; word-break: break-all; }'
    ].join('');

    var card = document.createElement('div');
    card.className = 'card';

    var header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = '<div style="display:flex;align-items:center;gap:10px;"><span class="title">Hydration Mismatch</span><span class="badge">' + mismatches.length + ' issues</span></div>';

    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;';

    var copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy JSON';
    copyBtn.onclick = function() {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(JSON.stringify(mismatches, null, 2));
        copyBtn.textContent = 'Copied!';
        setTimeout(function() { copyBtn.textContent = 'Copy JSON'; }, 1500);
      }
    };

    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'dismiss-btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.onclick = function() { container.remove(); };

    actions.appendChild(copyBtn);
    actions.appendChild(dismissBtn);
    header.appendChild(actions);

    var content = document.createElement('div');
    content.className = 'content';

    mismatches.forEach(function(m) {
      var item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;"><span class="type-pill">' + (m.type || 'mismatch') + '</span><span class="path">' + (m.path || '') + '</span></div><div class="msg">' + (m.message || '') + '</div>';
      if (m.serverValue !== undefined || m.clientValue !== undefined) {
        var diff = document.createElement('div');
        diff.className = 'diff-table';
        diff.innerHTML = '<div><div style="font-size:10px;color:#64748b;text-transform:uppercase;">Server (SSR)</div><code class="diff-server">' + (m.serverValue || '(empty)') + '</code></div><div><div style="font-size:10px;color:#64748b;text-transform:uppercase;">Client (DOM)</div><code class="diff-client">' + (m.clientValue || '(empty)') + '</code></div>';
        item.appendChild(diff);
      }
      content.appendChild(item);
    });

    card.appendChild(header);
    card.appendChild(content);
    shadow.appendChild(style);
    shadow.appendChild(card);
    document.body.appendChild(container);
  }

  function detectHydrationMismatch(rawMsg) {
    var isMismatch = /hydration/i.test(rawMsg) && (/mismatch/i.test(rawMsg) || /did not match/i.test(rawMsg) || /server-rendered/i.test(rawMsg) || /recoverable error/i.test(rawMsg));
    if (!isMismatch) return;

    var mismatches = [];
    var root = document.getElementById('root') || document.body.firstElementChild || document.body;
    if (window.__ranu_overlay && typeof window.__ranu_overlay.diffServerClientDOM === 'function' && initialSsrMarkup && root) {
      mismatches = window.__ranu_overlay.diffServerClientDOM(initialSsrMarkup, root);
    }
    if (mismatches.length === 0) {
      mismatches.push({
        type: 'tag-mismatch',
        path: root ? root.tagName.toLowerCase() : 'body',
        message: rawMsg.slice(0, 300),
        serverValue: 'SSR HTML',
        clientValue: 'Client VDOM'
      });
    }
    showHydrationOverlay(mismatches);
  }

  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    originalConsoleError.apply(console, args);
    var str = args.map(function(a) { return typeof a === 'string' ? a : (a && a.message) || ''; }).join(' ');
    detectHydrationMismatch(str);
  };

  window.addEventListener('error', function(e) {
    if (e && e.message) detectHydrationMismatch(e.message);
  });

  window.addEventListener('ranu:hydration-error', function(e) {
    var detail = e && e.detail;
    if (detail && detail.mismatches) {
      showHydrationOverlay(detail.mismatches);
    }
  });

  connect();
})();
`;

