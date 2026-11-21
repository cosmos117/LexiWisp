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
  const chips = (label, words) =>
    words?.length
      ? `<div class="dc-rel"><span class="dc-rel-label">${label}</span>${words
          .map((w) => `<button class="dc-chip" data-lookup="${esc(w)}">${esc(w)}</button>`)
          .join('')}</div>`
      : '';

  const RENDER = {
    dictionary(d, s) {
      return (
        `<div class="dc-head"><span class="dc-word">${esc(d.word)}</span>` +
        (d.phonetic ? `<span class="dc-phon">${esc(d.phonetic)}</span>` : '') +
        speakBtn(d.word, 'en-US', d.audio) +
        '</div>' +
        d.meanings
          .map(
            (m) =>
              `<section class="dc-sec"><div class="dc-pos">${esc(m.partOfSpeech)}</div><ol class="dc-defs">` +
              m.definitions
                .slice(0, s.maxDefinitions || 3)
                .map((x) => `<li>${esc(x.definition)}${x.example ? `<div class="dc-ex">“${esc(x.example)}”</div>` : ''}</li>`)
                .join('') +
              '</ol>' +
              chips('Synonyms', m.synonyms) +
              chips('Antonyms', m.antonyms) +
              '</section>'
          )
          .join('') +
        more(d.moreUrl, 'More on Wiktionary')
      );
    },

    translate(d) {
      return (
        `<div class="dc-meta">${esc(langName(d.from))} → ${esc(langName(d.to))}</div>` +
        `<div class="dc-head"><span class="dc-trans">${esc(d.translation)}</span>${speakBtn(d.translation, d.to)}</div>` +
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

    wikipedia(d) {
      return (
        (d.thumbnail ? `<img class="dc-thumb" src="${esc(d.thumbnail)}" alt="">` : '') +
        `<div class="dc-head"><span class="dc-word">${esc(d.title)}</span></div>` +
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

    const root = document.createElement('div');
    root.className = 'dc-root ' + (opts.className || '');
    root.innerHTML = '<div class="dc-tabs" role="tablist"></div><div class="dc-body"></div>';
    container.appendChild(root);
    const tabs = root.querySelector('.dc-tabs');
    const body = root.querySelector('.dc-body');

    const enabled = () => settings.sources.filter((s) => s.enabled && LABELS[s.id]).map((s) => s.id);

    function applyTheme() {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dc-dark', dark);
      root.style.fontSize = `${settings.fontSize || 14}px`;
    }

    function renderTabs() {
      tabs.innerHTML =
        enabled()
          .map((id) => `<button class="dc-tab" role="tab" data-tab="${id}" aria-selected="${id === active}">${LABELS[id]}</button>`)
          .join('') +
        '<span class="dc-spacer"></span>' +
        (opts.onClose ? `<button class="dc-iconbtn" data-close title="Close (Esc)">${ICON_CLOSE}</button>` : '');
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
      body.innerHTML = '<div class="dc-loading"><span></span><span></span><span></span></div>';
      opts.onRender?.();
      try {
        const data = await lookup(id, text, settings);
        if (my !== token) return;
        body.innerHTML = RENDER[id](data, settings);
      } catch (e) {
        if (my !== token) return;
        body.innerHTML = `<div class="dc-empty">${esc(e.message)}</div>`;
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
      const t = e.target.closest('[data-tab],[data-close],[data-speak],[data-lookup]');
      if (!t) return;
      if (t.dataset.tab) show(t.dataset.tab);
      else if (t.hasAttribute('data-close')) opts.onClose?.();
      else if (t.hasAttribute('data-speak')) speak(t.dataset.speak, t.dataset.lang, t.dataset.audio);
      else if (t.dataset.lookup) api.setText(t.dataset.lookup, active);
    });

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
        show(preferredSource && enabled().includes(preferredSource) ? preferredSource : pickDefault(t));
      },
      setSettings(s) {
        settings = s;
        applyTheme();
        if (text) show(enabled().includes(active) ? active : pickDefault(text));
      },
    };

    applyTheme();
    return api;
  }

  // ---- styles --------------------------------------------------------------------
  const CSS = `
.dc-root{
  --bg:#ffffff;--fg:#1f2328;--muted:#656d76;--border:#e1e4e8;--accent:#6d4aff;
  --chip:#f1edff;--chip-fg:#4b2fd6;--hover:#f4f5f7;--shadow:0 10px 30px rgba(15,15,30,.18),0 2px 6px rgba(15,15,30,.08);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  font-size:14px;line-height:1.5;color:var(--fg);background:var(--bg);text-align:left;
  letter-spacing:normal;word-spacing:normal;text-transform:none;font-weight:400;font-style:normal;
}
.dc-root.dc-dark{
  --bg:#1d1e23;--fg:#e8e8ea;--muted:#9da3ab;--border:#34353d;--accent:#a08cff;
  --chip:#2d2944;--chip-fg:#c9bdff;--hover:#2a2b31;--shadow:0 10px 30px rgba(0,0,0,.5);
}
.dc-root *,.dc-root *::before,.dc-root *::after{box-sizing:border-box}
.dc-bubble{
  position:absolute;width:380px;max-width:calc(100vw - 16px);border:1px solid var(--border);
  border-radius:12px;box-shadow:var(--shadow);overflow:hidden;animation:dc-in .12s ease-out;
}
@keyframes dc-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dc-tabs{display:flex;align-items:center;gap:2px;padding:6px 6px 0;border-bottom:1px solid var(--border)}
.dc-tab{
  all:unset;cursor:pointer;padding:6px 10px 7px;font-size:.88em;font-weight:600;color:var(--muted);
  border-bottom:2px solid transparent;border-radius:6px 6px 0 0;
}
.dc-tab:hover{background:var(--hover);color:var(--fg)}
.dc-tab[aria-selected="true"]{color:var(--accent);border-bottom-color:var(--accent)}
.dc-spacer{flex:1}
.dc-iconbtn{
  all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:50%;color:var(--muted);flex:none;
}
.dc-iconbtn:hover{background:var(--hover);color:var(--accent)}
.dc-body{padding:12px 14px 14px;max-height:360px;overflow:auto;overscroll-behavior:contain}
.dc-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dc-word{font-size:1.35em;font-weight:700}
.dc-trans{font-size:1.2em;font-weight:600}
.dc-phon{color:var(--muted);font-family:"Lucida Sans Unicode","Segoe UI",sans-serif}
.dc-meta{color:var(--muted);font-size:.86em;margin:2px 0 4px}
.dc-sec{margin-top:10px}
.dc-pos{font-style:italic;font-weight:600;color:var(--accent);font-size:.9em;margin-bottom:2px}
.dc-defs{margin:0;padding-left:1.3em}
.dc-defs li{margin:3px 0}
.dc-ex{color:var(--muted);font-style:italic;margin-top:2px}
.dc-rel{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:6px}
.dc-rel-label{font-size:.8em;color:var(--muted);margin-right:2px}
.dc-chip{
  all:unset;cursor:pointer;font-size:.82em;padding:1px 8px;border-radius:999px;
  background:var(--chip);color:var(--chip-fg);
}
.dc-chip:hover{filter:brightness(.95);text-decoration:underline}
.dc-alts{display:flex;flex-wrap:wrap;gap:4px}
.dc-alt{font-size:.88em;padding:1px 8px;border-radius:6px;background:var(--hover)}
.dc-thumb{float:right;width:84px;height:84px;object-fit:cover;border-radius:8px;margin:0 0 6px 10px}
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

  globalThis.DefinerUI = { createPanel, CSS, LABELS, esc };
})();
