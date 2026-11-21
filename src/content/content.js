// In-page bubble: watches for selections and shows the lookup panel near them.
(() => {
  // When the extension is reloaded, the old copy of this script stays in open
  // tabs but can no longer reach the extension. Tear it down before starting.
  window.__lexiTeardown?.();
  const lifetime = new AbortController();
  const signal = lifetime.signal;
  window.__lexiTeardown = () => {
    lifetime.abort();
    host?.remove();
  };

  const { DefinerUI, DEFINER_DEFAULTS } = globalThis;
  let settings = structuredClone(DEFINER_DEFAULTS);
  let host = null;
  let panel = null;
  let anchor = null; // selection rect in document coordinates

  chrome.storage.sync.get(DEFINER_DEFAULTS).then((s) => {
    settings = s;
    panel?.setSettings(settings);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || signal.aborted) return;
    settings = { ...settings };
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue ?? DEFINER_DEFAULTS[k];
    if (isOpen()) panel.setSettings(settings);
    if (siteDisabled()) hide();
  });

  const siteDisabled = () => (settings.disabledSites || []).includes(location.hostname);
  const isOpen = () => !!panel && host?.isConnected && panel.root.style.display !== 'none';
  const inHost = (e) => !!host && e.composedPath().includes(host);

  function ensureHost() {
    if (!host) {
      host = document.createElement('lexi-popup-root');
      host.style.cssText =
        'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = DefinerUI.CSS;
      shadow.appendChild(style);
      panel = DefinerUI.createPanel(shadow, {
        settings,
        className: 'dc-bubble',
        onClose: hide,
        onRender: position,
      });
    }
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|url|tel|)$/i.test(el.type));
  }

  function clean(t) {
    t = t.replace(/\s+/g, ' ').trim().slice(0, 500);
    // Strip surrounding punctuation from single words: "(hello," → "hello"
    if (!/\s/.test(t)) t = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return t;
  }

  function selectionInfo() {
    const el = document.activeElement;
    // Text selected inside <input>/<textarea> isn't exposed by getSelection().
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && typeof el.selectionStart === 'number') {
      const text = clean(el.value.slice(el.selectionStart, el.selectionEnd));
      if (text) return { text, rect: el.getBoundingClientRect() };
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const text = clean(sel.toString());
    if (!text) return null;
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height && el) rect = el.getBoundingClientRect();
    return { text, rect };
  }

  function showAt(text, rect) {
    ensureHost();
    anchor = {
      left: rect.left + scrollX,
      top: rect.top + scrollY,
      bottom: rect.bottom + scrollY,
      width: rect.width,
    };
    panel.root.style.display = '';
    panel.setText(text);
    position();
  }

  function position() {
    if (!anchor || !panel) return;
    const el = panel.root;
    const gap = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const viewW = document.documentElement.clientWidth;

    let left = anchor.left + anchor.width / 2 - w / 2;
    left = Math.max(scrollX + gap, Math.min(left, scrollX + viewW - w - gap));

    let top = anchor.bottom + gap;
    const fitsBelow = top + h <= scrollY + innerHeight;
    const fitsAbove = anchor.top - gap - h >= scrollY;
    if (!fitsBelow && fitsAbove) top = anchor.top - gap - h;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function hide() {
    if (panel) panel.root.style.display = 'none';
    anchor = null;
  }

  function modifierPressed(e) {
    return { alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }[settings.modifier];
  }

  function trigger() {
    if (siteDisabled()) return;
    if (settings.ignoreEditable && isEditable(document.activeElement)) return;
    const info = selectionInfo();
    if (!info) return;
    if (isOpen() && panel.text === info.text) return;
    showAt(info.text, info.rect);
  }

  document.addEventListener(
    'mousedown',
    (e) => {
      if (inHost(e)) return;
      if (isOpen()) hide();
      // Chrome selects the word on the 2nd mousedown of a double-click, so we can
      // start the lookup now instead of waiting for the 'dblclick' event on mouseup.
      if (e.detail === 2 && e.button === 0 && settings.trigger === 'dblclick') setTimeout(trigger, 0);
    },
    { capture: true, signal }
  );

  document.addEventListener(
    'mouseup',
    (e) => {
      if (e.button !== 0 || inHost(e) || settings.trigger === 'dblclick') return;
      if (settings.trigger === 'modifier' && !modifierPressed(e)) return;
      setTimeout(trigger, 0); // let the selection settle
    },
    { capture: true, signal }
  );

  document.addEventListener(
    'dblclick',
    (e) => {
      if (inHost(e) || settings.trigger !== 'dblclick') return;
      trigger();
    },
    { capture: true, signal }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && isOpen()) hide();
    },
    { capture: true, signal }
  );

  window.addEventListener('resize', () => isOpen() && position(), { signal });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (signal.aborted) return;
    if (msg?.type === 'getSelection') {
      sendResponse({ text: selectionInfo()?.text || '', host: location.hostname });
      return;
    }
    if (msg?.type === 'show') {
      const info = selectionInfo();
      const text = msg.text ? clean(msg.text) : info?.text;
      if (!text) return;
      const rect = info?.rect || new DOMRect(innerWidth / 2, 80, 0, 0);
      showAt(text, rect);
    }
  });
})();
