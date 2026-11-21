// Shared lookup panel: tabs + result rendering. Used by the in-page bubble
// (inside a closed shadow root) and by the toolbar popup.
(() => {
  const LABELS = {
    dictionary: 'Dictionary',
    translate: 'Translate',
    wikipedia: 'Wikipedia',
    urban: 'Urban',
  };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const langName = (code) =>
    globalThis.DEFINER_LANGUAGES?.find((l) => l.code === code || l.code.split('-')[0] === code)?.name || code;

  const ICON_SPEAKER =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
  const ICON_CLOSE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  // LexiWisp logo: rounded-square tile (same artwork as assets/logo.svg and the toolbar icon).
  const LOGO =
    '<svg viewBox="0 0 128 128"><defs><linearGradient id="lw-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E4643A"/><stop offset="1" stop-color="#C8461F"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="url(#lw-bg)"/><g transform="translate(-10.75 15)"><path transform="translate(4 -5)" d="M55 70a8.5 8.5 0 1 1 8.5 8.5a20 20 0 1 1 20 -20" fill="none" stroke="#F9DECB" stroke-width="12" stroke-linecap="round"/><path d="M95 18Q97.5 29.5 109 32Q97.5 34.5 95 46Q92.5 34.5 81 32Q92.5 29.5 95 18Z" fill="#F9DECB"/></g></svg>';

  // ---- lookup with per-page cache -------------------------------------------
  const cache = new Map();
  function lookup(source, text, settings) {
    const key = [source, text, settings.targetLang, settings.wikiLang].join('\u0001');
    if (!cache.has(key)) {
      const p = (async () => {
        let res;
        try {
          res = await chrome.runtime.sendMessage({ type: 'lookup', source, text, settings });
        } catch {
          throw new Error('The extension was updated. Reload this page to keep using it.');
        }
        if (!res?.ok) throw new Error(res?.error || 'Lookup failed.');
        return res.data;
      })();
      p.catch(() => cache.delete(key));
      cache.set(key, p);
      if (cache.size > 100) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
  }

  // ---- pronunciation ---------------------------------------------------------
  function tts(text, lang) {
    if (!globalThis.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (lang) u.lang = lang;
    speechSynthesis.speak(u);
  }
  function speak(text, lang, audioUrl) {
    if (audioUrl) {
      new Audio(audioUrl).play().catch(() => tts(text, lang));
    } else {
      tts(text, lang);
    }
  }

  // ---- renderers ---------------------------------------------------------------
  const speakBtn = (text, lang, audio) =>
    `<button class="dc-iconbtn" title="Listen" data-speak="${esc(text)}" data-lang="${esc(lang || '')}" data-audio="${esc(audio || '')}">${ICON_SPEAKER}</button>`;
  const more = (url, label) =>
    url ? `<a class="dc-more" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
  const chips = (words, label = '') =>
    words?.length
      ? `<div class="dc-rel">${label ? `<span class="dc-rel-label">${label}</span>` : ''}${words
          .map((w) => `<button class="dc-chip" data-lookup="${esc(w)}" title="Look up “${esc(w)}”">${esc(w)}</button>`)
          .join('')}</div>`
      : '';
  const example = (ex) => (ex ? `<div class="dc-ex">“${esc(ex)}”</div>` : '');

  const RENDER = {
    // One plain meaning per part of speech up front; the rest tucked behind "more meanings".
    dictionary(d, s) {
      const shown = Math.max(1, s.maxDefinitions || 1);
      const formOf = d.formOf
        ? `<div class="dc-meta">Form of <button class="dc-link" data-lookup="${esc(d.formOf)}">${esc(d.formOf)}</button></div>`
        : '';
      return (
        formOf +
        d.meanings
          .map((m) => {
            const main = m.definitions.slice(0, shown);
            const rest = m.definitions.slice(shown);
            return (
              `<section class="dc-sec"><div class="dc-pos">${esc(m.partOfSpeech)}</div>` +
              main.map((x) => `<p class="dc-def">${esc(x.definition)}</p>${example(x.example)}`).join('') +
              (rest.length
                ? `<details class="dc-moredefs"><summary>${rest.length} more meaning${rest.length > 1 ? 's' : ''}</summary><ol>` +
                  rest.map((x) => `<li>${esc(x.definition)}${example(x.example)}</li>`).join('') +
                  '</ol></details>'
                : '') +
              chips(m.synonyms) +
              chips(m.antonyms, 'Opposite') +
              '</section>'
            );
          })
          .join('') +
        more(d.moreUrl, 'More on Wiktionary')
      );
    },

    translate(d) {
      return (
        `<div class="dc-meta">${esc(langName(d.from))} → ${esc(langName(d.to))}</div>` +
        `<div class="dc-row"><span class="dc-trans">${esc(d.translation)}</span>${speakBtn(d.translation, d.to)}</div>` +
        d.alternatives
          .map(
            (a) =>
              `<section class="dc-sec"><div class="dc-pos">${esc(a.pos)}</div><div class="dc-alts">${a.terms
                .map((t) => `<span class="dc-alt">${esc(t)}</span>`)
                .join('')}</div></section>`
          )
          .join('') +
        more(d.moreUrl, 'Open in Google Translate')
      );
    },

    wikipedia(d, _s, text) {
      const sameTitle = d.title.toLowerCase() === text.toLowerCase();
      return (
        (d.thumbnail ? `<img class="dc-thumb" src="${esc(d.thumbnail)}" alt="">` : '') +
        (sameTitle ? '' : `<div class="dc-subtitle">${esc(d.title)}</div>`) +
        (d.description ? `<div class="dc-meta">${esc(d.description)}</div>` : '') +
        (d.disambiguation ? '<div class="dc-meta">This term may refer to several topics.</div>' : '') +
        `<p class="dc-extract">${esc(d.extract)}</p>` +
        more(d.url, 'Read on Wikipedia')
      );
    },

    urban(d) {
      return (
        d.items
          .map(
            (x) =>
              `<section class="dc-sec"><div class="dc-pos">${esc(x.word)} · 👍 ${x.votes}</div>` +
              `<p class="dc-extract">${esc(x.definition)}</p>` +
              (x.example ? `<div class="dc-ex">${esc(x.example)}</div>` : '') +
              '</section>'
          )
          .join('') + more(d.moreUrl, 'More on Urban Dictionary')
      );
    },
  };

  // ---- panel -------------------------------------------------------------------
  function createPanel(container, opts) {
    let settings = opts.settings;
    let text = '';
    let active = null;
    let token = 0;
    let headAudio = '';
    let headLang = '';

    const root = document.createElement('div');
    root.className = 'dc-root ' + (opts.className || '');
    root.innerHTML =
      '<div class="dc-header">' +
      (opts.showLogo ? `<span class="dc-logo" aria-hidden="true">${LOGO}</span>` : '') +
      '<span class="dc-word"></span><span class="dc-phon"></span><span class="dc-spacer"></span>' +
      `<button class="dc-iconbtn" data-speak-head title="Listen">${ICON_SPEAKER}</button>` +
      (opts.onClose ? `<button class="dc-iconbtn" data-close title="Close (Esc)">${ICON_CLOSE}</button>` : '') +
      '</div><div class="dc-tabs" role="tablist"></div><div class="dc-body"></div>';
    container.appendChild(root);
    const $ = (sel) => root.querySelector(sel);
    const tabs = $('.dc-tabs');
    const body = $('.dc-body');

    const enabled = () => settings.sources.filter((s) => s.enabled && LABELS[s.id]).map((s) => s.id);

    function applyTheme() {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dc-dark', dark);
      root.style.fontSize = `${settings.fontSize || 14}px`;
    }

    // Header: the looked-up text, plus pronunciation when the dictionary knows the word.
    function renderHeader() {
      const forText = text;
      $('.dc-word').textContent = text;
      $('.dc-word').title = text;
      $('.dc-phon').textContent = '';
      headAudio = '';
      headLang = '';
      if (text.split(/\s+/).length > 4) return;
      lookup('dictionary', text, settings)
        .then((d) => {
          if (forText !== text) return;
          $('.dc-phon').textContent = d.phonetic || '';
          headAudio = d.audio || '';
          headLang = 'en-US';
        })
        .catch(() => {});
    }

    function renderTabs() {
      tabs.innerHTML = enabled()
        .map((id) => `<button class="dc-tab" role="tab" data-tab="${id}" aria-selected="${id === active}">${LABELS[id]}</button>`)
        .join('');
    }

    // Long text or non-Latin script → translation is the more useful first tab.
    function pickDefault(t) {
      const ids = enabled();
      if (ids.includes('translate') && (t.split(/\s+/).length > 4 || /[^\u0000-ɏ\s\p{P}\p{N}]/u.test(t))) {
        return 'translate';
      }
      return ids[0] || null;
    }

    async function show(id) {
      active = id;
      renderTabs();
      const my = ++token;
      if (!id) {
        body.innerHTML = '<div class="dc-empty">No sources are enabled. Turn some on in Settings.</div>';
        opts.onRender?.();
        return;
      }
      // Offline results arrive in a few ms — fade the old result right away, but only
      // show the spinner if we're actually waiting on the network.
      body.classList.add('dc-stale');
      const spinner = setTimeout(() => {
        if (my !== token) return;
        body.innerHTML = '<div class="dc-loading"><span></span><span></span><span></span></div>';
        opts.onRender?.();
      }, 120);
      try {
        const data = await lookup(id, text, settings);
        if (my !== token) return;
        body.innerHTML = RENDER[id](data, settings, text);
      } catch (e) {
        if (my !== token) return;
        body.innerHTML = `<div class="dc-empty">${esc(e.message)}</div>`;
      } finally {
        clearTimeout(spinner);
        if (my === token) body.classList.remove('dc-stale');
      }
      body.scrollTop = 0;
      opts.onRender?.();
      prefetchOthers(my);
    }

    // Warm the other tabs in the background so switching tabs feels instant.
    function prefetchOthers(my) {
      setTimeout(() => {
        if (my !== token) return;
        for (const other of enabled()) {
          if (other !== active) lookup(other, text, settings).catch(() => {});
        }
      }, 250);
    }

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tab],[data-close],[data-speak],[data-speak-head],[data-lookup]');
      if (!t) return;
      if (t.dataset.tab) show(t.dataset.tab);
      else if (t.hasAttribute('data-close')) opts.onClose?.();
      else if (t.hasAttribute('data-speak-head')) speak(text, headLang, headAudio);
      else if (t.hasAttribute('data-speak')) speak(t.dataset.speak, t.dataset.lang, t.dataset.audio);
      else if (t.dataset.lookup) api.setText(t.dataset.lookup, active);
    });
    // Opening "more meanings" changes the bubble's height; let the host re-position it.
    root.addEventListener('toggle', () => opts.onRender?.(), true);

    const api = {
      root,
      get text() {
        return text;
      },
      setText(t, preferredSource) {
        text = t;
        try {
          chrome.runtime.sendMessage({ type: 'history', text: t }).catch(() => {});
        } catch {
          /* extension context gone */
        }
        applyTheme();
        renderHeader();
        show(preferredSource && enabled().includes(preferredSource) ? preferredSource : pickDefault(t));
      },
      setSettings(s) {
        settings = s;
        applyTheme();
        if (text) {
          renderHeader();
          show(enabled().includes(active) ? active : pickDefault(text));
        }
      },
    };

    applyTheme();
    return api;
  }

  // ---- styles --------------------------------------------------------------------
  // LexiWisp palette: warm coral accent with peach + honey chips.
  const CSS = `
.dc-root{
  --bg:#ffffff;--fg:#2b1712;--muted:#8a5b4a;--soft:#a07a6c;--border:#f3ddd3;--accent:#e8613c;
  --chip:#fde3d9;--chip-fg:#a3432a;--chip2:#fef2cc;--chip2-fg:#7a5a10;--hover:#fdf1ec;
  --shadow:0 12px 32px rgba(90,40,20,.16),0 2px 6px rgba(90,40,20,.08);
  font-family:"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:14px;line-height:1.5;color:var(--fg);background:var(--bg);text-align:left;
  letter-spacing:normal;word-spacing:normal;text-transform:none;font-weight:400;font-style:normal;
}
.dc-root.dc-dark{
  --bg:#241713;--fg:#f7ece6;--muted:#c79e8c;--soft:#b48f80;--border:#4a3128;--accent:#f0714a;
  --chip:#3e221b;--chip-fg:#f3b9a4;--chip2:#3a3116;--chip2-fg:#f2c94c;--hover:#2f1f1a;
  --shadow:0 12px 32px rgba(0,0,0,.55);
}
.dc-root *,.dc-root *::before,.dc-root *::after{box-sizing:border-box}
.dc-bubble{
  position:absolute;width:390px;max-width:calc(100vw - 16px);border:1px solid var(--border);
  border-radius:16px;box-shadow:var(--shadow);overflow:hidden;animation:dc-in .12s ease-out;
}
@keyframes dc-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dc-header{display:flex;align-items:center;gap:10px;padding:14px 10px 4px 16px;min-width:0}
.dc-logo{flex:none;width:30px;height:30px;display:inline-flex}
.dc-logo svg{width:100%;height:100%}
.dc-word{font-size:1.4em;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
.dc-phon{color:var(--muted);white-space:nowrap;font-family:"Segoe UI","Lucida Sans Unicode",sans-serif;flex:none}
.dc-spacer{flex:1}
.dc-tabs{display:flex;gap:4px;padding:0 10px;overflow-x:auto;scrollbar-width:none}
.dc-tab{
  all:unset;cursor:pointer;padding:6px 8px 7px;font-size:.98em;color:var(--muted);
  border-bottom:2px solid transparent;white-space:nowrap;
}
.dc-tab:hover{color:var(--fg)}
.dc-tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.dc-iconbtn{
  all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  width:30px;height:30px;border-radius:50%;color:var(--muted);flex:none;
}
.dc-iconbtn:hover{background:var(--hover);color:var(--accent)}
.dc-body{padding:6px 16px 16px;max-height:340px;overflow:auto;overscroll-behavior:contain}
.dc-stale>*{opacity:.35;transition:opacity .1s .03s}
.dc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dc-trans{font-size:1.2em;font-weight:600}
.dc-subtitle{font-size:1.1em;font-weight:700}
.dc-meta{color:var(--muted);font-size:.88em;margin:6px 0 2px}
.dc-link{all:unset;cursor:pointer;color:var(--accent);font-weight:600}
.dc-link:hover{text-decoration:underline}
.dc-sec{margin-top:10px}
.dc-pos{font-style:italic;color:var(--soft);font-size:.95em}
.dc-def{margin:2px 0 0;font-size:1.08em}
.dc-ex{color:var(--muted);font-style:italic;margin-top:2px;font-size:.93em}
.dc-moredefs{margin-top:4px;font-size:.93em}
.dc-moredefs summary{cursor:pointer;color:var(--muted);list-style:none;user-select:none}
.dc-moredefs summary::-webkit-details-marker{display:none}
.dc-moredefs summary::before{content:"+ "}
.dc-moredefs[open] summary::before{content:"− "}
.dc-moredefs summary:hover{color:var(--accent)}
.dc-moredefs ol{margin:4px 0 0;padding-left:1.3em}
.dc-moredefs li{margin:3px 0}
.dc-rel{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
.dc-rel-label{font-size:.82em;color:var(--muted)}
.dc-chip{
  all:unset;cursor:pointer;font-size:.95em;padding:3px 13px;border-radius:999px;
  background:var(--chip);color:var(--chip-fg);
}
.dc-chip:nth-of-type(3n){background:var(--chip2);color:var(--chip2-fg)}
.dc-chip:hover{filter:brightness(.96);text-decoration:underline}
.dc-alts{display:flex;flex-wrap:wrap;gap:6px}
.dc-alt{font-size:.9em;padding:2px 10px;border-radius:999px;background:var(--chip);color:var(--chip-fg)}
.dc-thumb{float:right;width:84px;height:84px;object-fit:cover;border-radius:10px;margin:6px 0 6px 10px}
.dc-extract{margin:6px 0 0;white-space:pre-line}
.dc-more{
  display:inline-block;margin-top:12px;font-size:.85em;color:var(--accent);text-decoration:none;font-weight:600;clear:both;
}
.dc-more:hover{text-decoration:underline}
.dc-empty{color:var(--muted);padding:6px 0}
.dc-loading{display:flex;gap:5px;padding:10px 0}
.dc-loading span{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:dc-b 1s infinite ease-in-out}
.dc-loading span:nth-child(2){animation-delay:.15s}
.dc-loading span:nth-child(3){animation-delay:.3s}
@keyframes dc-b{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:none}}
`;

  globalThis.DefinerUI = { createPanel, CSS, LABELS, esc, LOGO };
})();
