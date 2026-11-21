const { DefinerUI, DEFINER_DEFAULTS } = globalThis;
const $ = (id) => document.getElementById(id);

let settings = await chrome.storage.sync.get(DEFINER_DEFAULTS);

const dark =
  settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
document.body.classList.toggle('dark', dark);

const style = document.createElement('style');
style.textContent = DefinerUI.CSS;
document.head.appendChild(style);

const panel = DefinerUI.createPanel($('result'), { settings });

function search(q) {
  q = q.replace(/\s+/g, ' ').trim();
  if (!q) return;
  $('q').value = q;
  $('result').hidden = false;
  $('recent').hidden = true;
  panel.setText(q);
}

$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  search($('q').value);
});
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Recent lookups
const { history = [] } = await chrome.storage.local.get('history');
if (history.length) {
  $('recent-list').replaceChildren(
    ...history.slice(0, 15).map((h) => {
      const b = document.createElement('button');
      b.textContent = h.text;
      b.title = h.text;
      b.addEventListener('click', () => search(h.text));
      return b;
    })
  );
  $('recent').hidden = false;
}

// Prefill with the page selection, and offer a per-site on/off toggle.
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.id) {
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'getSelection' }, { frameId: 0 });
    if (res?.text) search(res.text);
    if (res?.host) {
      const host = res.host;
      $('site-host').textContent = host;
      $('site-enabled').checked = !settings.disabledSites.includes(host);
      $('site-row').hidden = false;
      $('site-enabled').addEventListener('change', async (e) => {
        const set = new Set(settings.disabledSites);
        e.target.checked ? set.delete(host) : set.add(host);
        settings = { ...settings, disabledSites: [...set] };
        await chrome.storage.sync.set({ disabledSites: settings.disabledSites });
      });
    }
  } catch {
    // No content script on this page (chrome:// pages, Web Store, PDF viewer, or not yet reloaded).
  }
}
