/* relay.js — runs in the ISOLATED world (default). Bridges the MAIN-world
 * interceptor (stats.js) to the extension: it can't touch the page's clipboard,
 * but it can talk to chrome.runtime. The split is required because MAIN-world
 * code has no chrome.* and isolated-world code has its own clipboard object. */
window.addEventListener('message', (event) => {
  // Only trust messages from this same page, carrying our marker.
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__abendprogramm !== true || data.kind !== 'stat') return;

  chrome.runtime.sendMessage({ type: 'abendprogramm-stat', stat: data.stat }, () => {
    // Swallow "receiving end does not exist" if the worker is asleep; the
    // message wakes it, so this rarely fires.
    void chrome.runtime.lastError;
  });
});
