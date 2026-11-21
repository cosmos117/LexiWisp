const { DEFINER_DEFAULTS, DEFINER_LANGUAGES, DEFINER_FONTS, DefinerUI } = globalThis;
const $ = (id) => document.getElementById(id);
const esc = DefinerUI.esc;

// ---- icons (stroke icons, 24×24 grid) -----------------------------------------
const ICON_PATHS = {
  pointer: '<path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/><path d="m13.5 13.5 6 6"/>',
  layers: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  dblclick: '<path d="M9 9l5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2 8 5.1"/><path d="m5.1 8-2.9-.8"/><path d="M14 4.1 12 6"/><path d="m6 12-1.9 2"/>',
  textcursor: '<path d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1"/><path d="M7 22h1a4 4 0 0 0 4-4v-1"/><path d="M7 2h1a4 4 0 0 1 4 4v1"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4"/><path d="M8 16h8"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  translate: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
function paintIcons(scope = document) {
  for (const el of scope.querySelectorAll('[data-icon]')) {
    if (el.dataset.painted) continue;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.dataset.painted = '1';
  }
}

const SOURCE_META = {
  dictionary: { icon: 'book', desc: 'Built in · works offline' },
  translate: { icon: 'translate', desc: 'Google Translate' },
  wikipedia: { icon: 'globe', desc: 'Article summaries' },
  urban: { icon: 'chat', desc: 'Slang & internet terms' },
};

// ---- state ----------------------------------------------------------------------
let settings = await chrome.storage.sync.get(DEFINER_DEFAULTS);
for (const s of DEFINER_DEFAULTS.sources) {
  if (!settings.sources.some((x) => x.id === s.id)) settings.sources.push({ ...s });
}

let statusTimer;
let preview = null; // live preview panel, created below
async function save(patch) {
  Object.assign(settings, patch);
  await chrome.storage.sync.set(patch);
  const status = $('status');
  status.classList.add('flash');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove('flash'), 1400);
  preview?.setSettings({ ...settings });
}

const setChecked = (nodes, pred) => nodes.forEach((n) => n.setAttribute('aria-checked', String(pred(n))));

// ---- page theme follows the chosen theme ----------------------------------------
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyPageTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
darkQuery.addEventListener('change', applyPageTheme);

// ---- trigger --------------------------------------------------------------------
const triggerTiles = [...document.querySelectorAll('[data-trigger]')];
const modButtons = [...document.querySelectorAll('[data-mod]')];
const MOD_LABEL = { alt: 'Alt', ctrl: 'Ctrl', shift: 'Shift' };
function renderTrigger() {
  setChecked(triggerTiles, (t) => t.dataset.trigger === settings.trigger);
  setChecked(modButtons, (b) => b.dataset.mod === settings.modifier);
  $('modLabel').textContent = MOD_LABEL[settings.modifier] || 'Alt';
  $('modifierRow').hidden = settings.trigger !== 'modifier';
}
triggerTiles.forEach((t) => t.addEventListener('click', () => save({ trigger: t.dataset.trigger }).then(renderTrigger)));
modButtons.forEach((b) => b.addEventListener('click', () => save({ modifier: b.dataset.mod }).then(renderTrigger)));

$('ignoreEditable').checked = settings.ignoreEditable;
$('ignoreEditable').addEventListener('change', (e) => save({ ignoreEditable: e.target.checked }));

chrome.commands?.getAll?.().then((cmds) => {
  const c = cmds.find((x) => x.name === 'lookup-selection');
  $('shortcutKeys').textContent = c?.shortcut || 'Not set';
});
$('editShortcut').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// ---- sources (drag to reorder) -----------------------------------------------
function renderSources() {
  const list = $('sourceList');
  const firstEnabled = settings.sources.find((s) => s.enabled)?.id;
  list.innerHTML = settings.sources
    .map((s) => {
      const meta = SOURCE_META[s.id] || { icon: 'book', desc: '' };
      return `
      <li class="source ${s.enabled ? '' : 'off'}" draggable="true" data-id="${s.id}">
        <span class="grip" role="button" tabindex="0" title="Drag to reorder (or focus and use ↑ ↓)" aria-label="Reorder ${esc(DefinerUI.LABELS[s.id])}">${icon('grip')}</span>
        <span class="src-icon" data-icon="${meta.icon}"></span>
        <span class="name">${esc(DefinerUI.LABELS[s.id] || s.id)}<span class="desc">${esc(meta.desc)}</span></span>
        ${s.id === firstEnabled ? '<span class="pill">Default</span>' : ''}
        <input type="checkbox" class="switch" ${s.enabled ? 'checked' : ''} aria-label="Enable ${esc(DefinerUI.LABELS[s.id])}">
      </li>`;
    })
    .join('');
  paintIcons(list);
}

function moveSource(id, toIndex) {
  const sources = [...settings.sources];
  const from = sources.findIndex((s) => s.id === id);
  const [item] = sources.splice(from, 1);
  sources.splice(Math.max(0, Math.min(toIndex, sources.length)), 0, item);
  return save({ sources }).then(renderSources);
}

const list = $('sourceList');
list.addEventListener('change', (e) => {
  const id = e.target.closest('.source')?.dataset.id;
  if (!id) return;
  const sources = settings.sources.map((s) => (s.id === id ? { ...s, enabled: e.target.checked } : s));
  save({ sources }).then(renderSources);
});
list.addEventListener('keydown', (e) => {
  const grip = e.target.closest('.grip');
  if (!grip || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const id = grip.closest('.source').dataset.id;
  const i = settings.sources.findIndex((s) => s.id === id);
  moveSource(id, i + (e.key === 'ArrowUp' ? -1 : 1)).then(() =>
    list.querySelector(`[data-id="${id}"] .grip`)?.focus()
  );
});

let dragId = null;
const clearDropMarks = () => list.querySelectorAll('.drop-before,.drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
list.addEventListener('dragstart', (e) => {
  const li = e.target.closest('.source');
  if (!li) return;
  dragId = li.dataset.id;
  li.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
list.addEventListener('dragover', (e) => {
  const li = e.target.closest('.source');
  if (!dragId || !li) return;
  e.preventDefault();
  clearDropMarks();
  if (li.dataset.id === dragId) return;
  const r = li.getBoundingClientRect();
  li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
});
list.addEventListener('drop', (e) => {
  e.preventDefault();
  const li = e.target.closest('.source');
  if (!dragId || !li || li.dataset.id === dragId) return;
  const before = li.classList.contains('drop-before');
  const others = settings.sources.filter((s) => s.id !== dragId);
  const idx = others.findIndex((s) => s.id === li.dataset.id) + (before ? 0 : 1);
  moveSource(dragId, idx);
});
list.addEventListener('dragend', () => {
  dragId = null;
  clearDropMarks();
  list.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
});

// ---- languages ------------------------------------------------------------------
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

// ---- appearance -----------------------------------------------------------------
const themeTiles = [...document.querySelectorAll('[data-theme-opt]')];
function renderTheme() {
  setChecked(themeTiles, (t) => t.dataset.themeOpt === settings.theme);
  applyPageTheme();
}
themeTiles.forEach((t) => t.addEventListener('click', () => save({ theme: t.dataset.themeOpt }).then(renderTheme)));

$('fontTiles').innerHTML = DEFINER_FONTS.map(
  (f) => `<button class="tile font-tile" role="radio" data-font="${f.id}">
      <span class="aa" style="font-family:${esc(f.stack)}">Aa</span><small>${esc(f.label)}</small>
    </button>`
).join('');
const fontTiles = [...document.querySelectorAll('[data-font]')];
const renderFont = () => setChecked(fontTiles, (t) => t.dataset.font === settings.fontFamily);
fontTiles.forEach((t) => t.addEventListener('click', () => save({ fontFamily: t.dataset.font }).then(renderFont)));

$('fontSize').value = settings.fontSize;
$('fontSizeVal').textContent = `${settings.fontSize}px`;
$('fontSize').addEventListener('input', (e) => {
  $('fontSizeVal').textContent = `${e.target.value}px`;
  preview?.setSettings({ ...settings, fontSize: Number(e.target.value) });
});
$('fontSize').addEventListener('change', (e) => save({ fontSize: Number(e.target.value) }));

function renderStepper() {
  $('maxDefinitions').textContent = settings.maxDefinitions;
  $('defMinus').disabled = settings.maxDefinitions <= 1;
  $('defPlus').disabled = settings.maxDefinitions >= 3; // the offline dictionary keeps up to 3 per part of speech
}
$('defMinus').addEventListener('click', () => save({ maxDefinitions: settings.maxDefinitions - 1 }).then(renderStepper));
$('defPlus').addEventListener('click', () => save({ maxDefinitions: settings.maxDefinitions + 1 }).then(renderStepper));

// Live preview: the real bubble UI, looking up a sample word (not saved to history).
const style = document.createElement('style');
style.textContent = DefinerUI.CSS;
document.head.appendChild(style);
preview = DefinerUI.createPanel($('preview'), { settings: { ...settings }, showLogo: true, noHistory: true });
preview.setText('serendipity', 'dictionary');

// ---- history ----------------------------------------------------------------------
$('saveHistory').checked = settings.saveHistory;
$('saveHistory').addEventListener('change', (e) => save({ saveHistory: e.target.checked }));

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function ago(t) {
  const s = (t - Date.now()) / 1000;
  for (const [unit, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), unit);
  }
  return 'just now';
}

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get('history');
  $('historyList').innerHTML = history
    .slice(0, 100)
    .map((h) => `<li><span class="word">${esc(h.text)}</span><time datetime="${new Date(h.t).toISOString()}" title="${esc(new Date(h.t).toLocaleString())}">${ago(h.t)}</time></li>`)
    .join('');
  $('historyEmpty').hidden = history.length > 0;
  $('exportHistory').disabled = $('clearHistory').disabled = !history.length;
  return history;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.history) renderHistory();
});

$('clearHistory').addEventListener('click', async () => {
  if (!confirm('Clear all lookup history?')) return;
  await chrome.storage.local.remove('history');
});
$('exportHistory').addEventListener('click', async () => {
  const history = await renderHistory();
  const csv = ['text,date', ...history.map((h) => `"${h.text.replace(/"/g, '""')}",${new Date(h.t).toISOString()}`)].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'lexiwisp-history.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- sidebar: highlight the section in view -----------------------------------
const navLinks = [...document.querySelectorAll('#nav a')];
const sections = navLinks.map((a) => document.querySelector(a.getAttribute('href')));
function updateActiveNav() {
  const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
  let current = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top <= 120) current = s;
  if (atBottom) current = sections[sections.length - 1];
  navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${current.id}`));
}
addEventListener('scroll', updateActiveNav, { passive: true });

// ---- initial render -------------------------------------------------------------
$('version').textContent = `v${chrome.runtime.getManifest().version}`;
paintIcons();
renderTrigger();
renderSources();
renderTheme();
renderFont();
renderStepper();
renderHistory();
updateActiveNav();
