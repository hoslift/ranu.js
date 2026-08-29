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
      window.location.reload();
    });

    source.addEventListener('build-error', function(e) {
      // Build error received
    });

    source.addEventListener('recovered', function(e) {
      // Rebuild recovered
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

  connect();
})();
`;
