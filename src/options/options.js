const { DEFINER_DEFAULTS, DEFINER_LANGUAGES, DefinerUI } = globalThis;
const $ = (id) => document.getElementById(id);

let settings = await chrome.storage.sync.get(DEFINER_DEFAULTS);

// Make sure newly added sources appear for users with older saved settings.
for (const s of DEFINER_DEFAULTS.sources) {
  if (!settings.sources.some((x) => x.id === s.id)) settings.sources.push({ ...s });
}

let savedTimer;
async function save(patch) {
  Object.assign(settings, patch);
  await chrome.storage.sync.set(patch);
  $('saved').classList.add('show');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $('saved').classList.remove('show'), 1200);
}

// ---- trigger ----
for (const r of document.querySelectorAll('input[name="trigger"]')) {
  r.checked = r.value === settings.trigger;
  r.addEventListener('change', () => save({ trigger: r.value }));
}
$('modifier').value = settings.modifier;
$('modifier').addEventListener('change', (e) => save({ modifier: e.target.value }));
$('ignoreEditable').checked = settings.ignoreEditable;
$('ignoreEditable').addEventListener('change', (e) => save({ ignoreEditable: e.target.checked }));

// ---- sources ----
function renderSources() {
  const list = $('sources');
  list.replaceChildren(
    ...settings.sources.map((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <label><input type="checkbox" ${s.enabled ? 'checked' : ''}> ${DefinerUI.esc(DefinerUI.LABELS[s.id] || s.id)}</label>
        <button data-dir="-1" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button data-dir="1" title="Move down" ${i === settings.sources.length - 1 ? 'disabled' : ''}>↓</button>`;
      li.querySelector('input').addEventListener('change', (e) => {
        const sources = settings.sources.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x));
        save({ sources });
      });
      li.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          const sources = [...settings.sources];
          const j = i + Number(b.dataset.dir);
          [sources[i], sources[j]] = [sources[j], sources[i]];
          save({ sources }).then(renderSources);
        })
      );
      return li;
    })
  );
}
renderSources();

// ---- languages ----
function fillSelect(sel, langs, value) {
  sel.replaceChildren(...langs.map((l) => new Option(l.name, l.code)));
  sel.value = value;
}
fillSelect($('targetLang'), DEFINER_LANGUAGES, settings.targetLang);
const wikiLangs = [];
const seen = new Set();
for (const l of DEFINER_LANGUAGES) {
  const code = l.code.split('-')[0];
  if (!seen.has(code)) {
    seen.add(code);
    wikiLangs.push({ code, name: l.name.replace(/ \(.*\)$/, '') });
  }
}
fillSelect($('wikiLang'), wikiLangs, settings.wikiLang);
$('targetLang').addEventListener('change', (e) => save({ targetLang: e.target.value }));
$('wikiLang').addEventListener('change', (e) => save({ wikiLang: e.target.value }));

// ---- appearance ----
$('theme').value = settings.theme;
$('theme').addEventListener('change', (e) => save({ theme: e.target.value }));
$('fontSize').value = settings.fontSize;
$('fontSizeVal').textContent = `${settings.fontSize}px`;
$('fontSize').addEventListener('input', (e) => ($('fontSizeVal').textContent = `${e.target.value}px`));
$('fontSize').addEventListener('change', (e) => save({ fontSize: Number(e.target.value) }));
$('maxDefinitions').value = settings.maxDefinitions;
$('maxDefinitions').addEventListener('change', (e) => {
  const n = Math.min(10, Math.max(1, Number(e.target.value) || 3));
  e.target.value = n;
  save({ maxDefinitions: n });
});

// ---- disabled sites ----
$('disabledSites').value = settings.disabledSites.join('\n');
$('disabledSites').addEventListener('change', (e) => {
  const hosts = e.target.value
    .split(/\s+/)
    .map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase())
    .filter(Boolean);
  e.target.value = hosts.join('\n');
  save({ disabledSites: [...new Set(hosts)] });
});

// ---- history ----
$('saveHistory').checked = settings.saveHistory;
$('saveHistory').addEventListener('change', (e) => save({ saveHistory: e.target.checked }));

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  $('history').replaceChildren(
    ...history.map((h) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${DefinerUI.esc(h.text)}</span> · ${new Date(h.t).toLocaleString()}`;
      return li;
    })
  );
  $('exportHistory').disabled = $('clearHistory').disabled = !history.length;
  return history;
}
renderHistory();

$('clearHistory').addEventListener('click', async () => {
  if (!confirm('Clear all lookup history?')) return;
  await chrome.storage.local.remove('history');
  renderHistory();
});

$('exportHistory').addEventListener('click', async () => {
  const history = await renderHistory();
  const csv = ['text,date', ...history.map((h) => `"${h.text.replace(/"/g, '""')}",${new Date(h.t).toISOString()}`)].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'lexi-history.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
