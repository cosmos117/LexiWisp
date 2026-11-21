# LexiWisp
Popup Dictionary &amp; Translator

Double-click any word on a web page and LexiWisp shows a simple meaning right
next to it, with tabs for **Dictionary**, **Translate**, **Wikipedia** and
**Urban Dictionary**. The English dictionary is built in, so meanings appear
instantly and work offline.

## Install (developer mode)
1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder

## Features
- Instant offline English dictionary (WordNet 3.1 + CMU pronunciations), with word forms handled (`ran` → run, `happier` → happy)
- One plain-English meaning per part of speech, with more meanings one click away
- Related-word chips you can click to look up
- Online fallback (Free Dictionary API, then Wiktionary) for words that aren't in the built-in dictionary
- Translate, Wikipedia and Urban Dictionary tabs. These are fetched in the background and cached, so switching tabs is instant
- Three ways to open the bubble: double-click, select text, or select while holding a modifier key. Also the right-click menu, or **Alt+D**
- Light, dark and system themes; text size; per-site disable; lookup history with CSV export

## Structure
```
manifest.json
assets/                    logo SVGs (icons/ holds the PNGs rendered from them)
data/dict/                 offline dictionary shards (generated, see below)
src/background.js          service worker: lookups + cache, context menu, shortcut, history
src/sources.js             dictionary / translate / wikipedia / urban sources
src/offline-dictionary.js  reads data/dict, handles word forms
src/shard.js               word → shard file mapping (shared with the build script)
src/shared/defaults.js     default settings + language list
src/shared/render.js       the panel UI + theme CSS (used by the bubble and the popup)
src/content/content.js     selection detection and bubble positioning
src/popup/, src/options/   toolbar popup and settings page
tools/build-dictionary.mjs builds data/dict
```

## Rebuilding the offline dictionary
```sh
# in any scratch folder
npm i --ignore-scripts wordnet-db cmu-pronouncing-dictionary
# then, from this repo
node tools/build-dictionary.mjs <scratch>/node_modules/wordnet-db <scratch>/node_modules/cmu-pronouncing-dictionary
```
The build takes a few seconds and writes about 18 MB of JSON (about 5.6 MB once zipped). Licenses for both data sets are in `data/dict/LICENSES.txt`.

## Online services used (free, no API key)
- Free Dictionary API (https://dictionaryapi.dev) and the Wiktionary REST API, only for words missing from the offline dictionary
- Google Translate's public `translate_a/single` endpoint. It's unofficial and may be rate-limited, so use an official API for production
- Wikipedia REST API
- Urban Dictionary API
