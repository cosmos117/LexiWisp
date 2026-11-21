# Lexi — Popup Dictionary & Translator (Definer-style Chrome extension)

Double-click (or select) any word on a web page to get a bubble with tabs for
**Dictionary**, **Translate**, **Wikipedia** and **Urban Dictionary**.

## Install (developer mode)
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Reload any tabs that were already open

## Features
- In-page bubble (Shadow DOM, so page CSS can't break it) that flips above the selection when there's no room below
- Three trigger modes: double-click, select, or select + Alt/Ctrl/Shift
- Right-click → “Look up …” and keyboard shortcut **Alt+D**
- Tabs per source, lazy-loaded and cached; long or non-Latin text opens on Translate first
- Pronunciation (dictionary audio, falling back to browser text-to-speech)
- Clickable synonyms/antonyms to look up related words
- Toolbar popup with search box, recent lookups, and a per-site on/off toggle
- Settings: source order/visibility, target & Wikipedia language, theme (auto/light/dark), text size, disabled sites, history with CSV export

## Structure
```
manifest.json
src/background.js        service worker: API calls, context menu, shortcut, history
src/sources.js           dictionary / translate / wikipedia / urban fetchers
src/shared/defaults.js   default settings + language list
src/shared/render.js     shared tabbed panel UI + CSS (bubble and popup)
src/content/content.js   selection detection and bubble positioning
src/popup/               toolbar popup
src/options/             settings page
```

## Adding a source
1. Add an `async function mySource(text, settings)` to `src/sources.js` and register it in `SOURCES`
2. Add its host to `host_permissions` in `manifest.json`
3. Add a label in `LABELS` and a renderer in `RENDER` (`src/shared/render.js`)
4. Add `{ id: 'mySource', enabled: true }` to `sources` in `src/shared/defaults.js`

## APIs used (free, no key)
- Free Dictionary API — https://dictionaryapi.dev (English only)
- Google Translate public `translate_a/single` endpoint (unofficial; may be rate-limited — swap for an official API for production)
- Wikipedia REST API
- Urban Dictionary API
