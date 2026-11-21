import './shared/defaults.js';
import { lookup } from './sources.js';

const MENU_ID = 'lexiwisp-lookup';
const MAX_HISTORY = 200;

chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  chrome.storage.local.remove('lookupCache'); // old cache format
  // 1.1 switched to one simple meaning per part of speech by default.
  if (reason === 'update' && previousVersion?.startsWith('1.0.')) chrome.storage.sync.set({ maxDefinitions: 1 });
  chrome.contextMenus.create({ id: MENU_ID, title: 'Look up “%s” with LexiWisp', contexts: ['selection'] });

  // Chrome only injects content scripts into pages loaded *after* install/reload.
  // Inject into tabs that are already open so the bubble works without a refresh.
  const files = chrome.runtime.getManifest().content_scripts[0].js;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file:///*'] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files })
      .catch(() => {}); // e.g. Chrome Web Store pages, discarded tabs
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  chrome.tabs
    .sendMessage(tab.id, { type: 'show', text: info.selectionText }, { frameId: info.frameId ?? 0 })
    .catch(() => {});
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'lookup-selection') return;
  tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'show' }).catch(() => {});
});

async function addHistory(text) {
  if (!text || text.length > 200) return;
  const { saveHistory } = await chrome.storage.sync.get({ saveHistory: true });
  if (!saveHistory) return;
  const { history = [] } = await chrome.storage.local.get('history');
  const lower = text.toLowerCase();
  const next = [{ text, t: Date.now() }, ...history.filter((h) => h.text.toLowerCase() !== lower)];
  await chrome.storage.local.set({ history: next.slice(0, MAX_HISTORY) });
}

// ---- lookup cache ------------------------------------------------------------
// In-flight + recent results live in memory; successful results are also kept in
// chrome.storage.local so repeat lookups are instant on any page and after restarts.
const CACHE_KEY = 'lookupCache2'; // bumped when result formats change
const CACHE_MAX = 500;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const inflight = new Map();
let diskCache = null; // Promise<{[key]: {t, data}}>
let saveTimer = null;

function cacheKey(source, text, s = {}) {
  const lang = source === 'translate' ? s.targetLang : source === 'wikipedia' ? s.wikiLang : '';
  const norm = source === 'dictionary' ? text.trim().toLowerCase() : text.trim();
  return `${source}|${lang || ''}|${norm}`;
}

function loadCache() {
  diskCache ??= chrome.storage.local.get(CACHE_KEY).then((r) => r[CACHE_KEY] || {});
  return diskCache;
}

function scheduleSave(cache) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => cache[a].t - cache[b].t)
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete cache[k]);
    }
    chrome.storage.local.set({ [CACHE_KEY]: cache });
  }, 300);
}

function cachedLookup(source, text, settings) {
  const key = cacheKey(source, text, settings);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const cache = await loadCache();
    const hit = cache[key];
    if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.data;
    const data = await lookup(source, text, settings);
    if (!data.offline) {
      // Offline-dictionary results are already instant; only cache network results.
      cache[key] = { t: Date.now(), data };
      scheduleSave(cache);
    }
    return data;
  })();
  inflight.set(key, p);
  // Keep successes in memory briefly (disk cache covers the rest); drop failures so they retry.
  p.then(
    () => setTimeout(() => inflight.delete(key), 60_000),
    () => inflight.delete(key)
  );
  return p;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'lookup') {
    cachedLookup(msg.source, msg.text, msg.settings)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true; // async response
  }
  if (msg?.type === 'history') {
    addHistory(msg.text).finally(() => sendResponse({ ok: true }));
    return true;
  }
});
