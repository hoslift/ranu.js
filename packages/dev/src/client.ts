/**
 * Canonical browser development client script.
 * Injected in HTML responses during development mode.
 * Connects to /_ranu/dev-reload via SSE and triggers window.location.reload() upon rebuild.
 */
export const DEV_CLIENT_SCRIPT = `
(function() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

  var reloadEndpoint = '/_ranu/dev-reload';
  var source = null;
  var reconnectTimer = null;

  function connect() {
    if (source) {
      source.close();
    }

    source = new EventSource(reloadEndpoint);

    source.addEventListener('connected', function(e) {
      // Connected to dev server
    });

    source.addEventListener('reload', function(e) {
      window.location.reload();
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
