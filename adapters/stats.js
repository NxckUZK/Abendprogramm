/* stats.js — runs in the page's MAIN world (see manifest content_scripts).
 *
 * Games share their result by copying text to the clipboard. We wrap the
 * clipboard write paths, parse the text with the per-game parser, post the
 * structured result out to our isolated relay (relay.js) — which is the only
 * side that can touch chrome.storage — and pop a small toast on the page so the
 * player gets instant confirmation that their score was captured.
 *
 * Crucial: we NEVER change what gets copied. The user's share text must reach
 * their friends untouched; the parse is a pure side-effect.
 */
(() => {
  const parsers = window.AbendprogrammParsers;
  if (!parsers) return; // parsers.js failed to load — nothing to do.

  const parser = parsers.getParserForUrl(window.location.href);
  if (!parser) return; // not a supported game page.

  // Parse a candidate clipboard string; on a hit, ship it out and toast.
  function emit(text) {
    try {
      const result = parser.parse(text);
      if (!result) return; // not a result we recognise — stay silent.
      result.url = result.url || window.location.href; // for favicon/name fallback
      window.postMessage({ __abendprogramm: true, kind: 'stat', stat: result }, '*');
      toast(result);
    } catch (err) {
      console.warn('[Abendprogramm] parse failed:', err);
    }
  }

  /* ---- on-page toast ---- */
  function toast(result) {
    const label = result.display || (result.solved === false ? 'X' : 'OK');
    const el = document.createElement('div');
    el.textContent = `Abendprogramm: ${result.game} ${label} erfasst ✓`;
    el.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'left:50%', 'bottom:24px',
      'transform:translateX(-50%) translateY(8px)',
      'background:#2a160f', 'color:#fff', 'font:600 14px/1.4 system-ui,sans-serif',
      'padding:10px 16px', 'border-radius:10px', 'box-shadow:0 6px 24px rgba(0,0,0,.35)',
      'opacity:0', 'transition:opacity .2s ease, transform .2s ease', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  // 1) navigator.clipboard.writeText(text)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = function (text) {
      emit(String(text ?? ''));
      return orig(text); // pass through unchanged
    };
  }

  // 2) navigator.clipboard.write([ClipboardItem]) — some games use the rich API.
  if (navigator.clipboard && navigator.clipboard.write) {
    const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
    navigator.clipboard.write = async function (items) {
      try {
        for (const item of items || []) {
          if (item.types && item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            emit(await blob.text());
          }
        }
      } catch (_) {}
      return origWrite(items);
    };
  }

  // 3) document.execCommand('copy') — older fallback some games still use. We
  //    can't see the exact text, so we sniff the selection / focused field.
  //    parse() returns null for anything that isn't a result, so a wrong guess
  //    is harmless.
  const origExec = document.execCommand.bind(document);
  document.execCommand = function (cmd, ...rest) {
    if (String(cmd).toLowerCase() === 'copy') {
      try {
        const sel = (document.getSelection && document.getSelection().toString()) || '';
        const el = document.activeElement;
        const fromField = el && 'value' in el ? el.value : '';
        emit(sel || fromField || '');
      } catch (_) {}
    }
    return origExec(cmd, ...rest);
  };

  console.log('[Abendprogramm] stats adapter initialized for', parser.id);
})();
