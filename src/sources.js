// Lookup sources. Runs in the service worker so requests bypass page CSP/CORS.

class NotFound extends Error {}

const REQUEST_TIMEOUT_MS = 8000;
// If the primary dictionary hasn't answered by then, race a backup request.
// A warm request to the primary takes ~150ms; anything much slower is worth hedging.
const HEDGE_AFTER_MS = 400;

async function getJSON(url, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (e) {
    if (timeout.aborted) throw new Error('The dictionary service took too long to respond.');
    throw e;
  }
  if (res.status === 404) throw new NotFound('Not found');
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);
  return res.json();
}

const wordCount = (t) => t.trim().split(/\s+/).length;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function stripHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
        : ENTITIES[e.toLowerCase()] ?? m
    )
    .replace(/\s+/g, ' ')
    .trim();
}

// Primary dictionary (Free Dictionary API) + Wiktionary as a hedged backup:
// the backup starts if the primary is slow or fails, and the first good answer wins.
async function dictionary(text) {
  const word = text.trim().toLowerCase();
  if (wordCount(word) > 4) {
    throw new Error('Select a single word or short phrase to see dictionary definitions.');
  }

  const ctrl = new AbortController();
  let startBackup;
  const backupGate = new Promise((resolve) => (startBackup = resolve));
  const hedgeTimer = setTimeout(startBackup, HEDGE_AFTER_MS);

  const primary = freeDictionary(word, ctrl.signal).catch((e) => {
    startBackup();
    throw e;
  });
  const backup = backupGate.then(() => wiktionary(word, ctrl.signal));

  try {
    return await Promise.any([primary, backup]);
  } catch (agg) {
    if (agg.errors.every((e) => e instanceof NotFound)) throw new Error(`No definitions found for “${text}”.`);
    throw agg.errors.find((e) => !(e instanceof NotFound)) || agg.errors[0];
  } finally {
    clearTimeout(hedgeTimer);
    ctrl.abort(); // cancel whichever request lost the race
  }
}

async function wiktionary(word, signal) {
  const data = await getJSON(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, signal);
  const byPos = new Map();
  for (const entry of data.en || []) {
    const pos = entry.partOfSpeech.toLowerCase();
    const cur = byPos.get(pos) || { partOfSpeech: pos, definitions: [], synonyms: [], antonyms: [] };
    for (const d of entry.definitions || []) {
      const definition = stripHtml(d.definition);
      if (!definition) continue;
      const example = stripHtml(d.parsedExamples?.[0]?.example || d.examples?.[0] || '');
      cur.definitions.push({ definition, example });
    }
    if (cur.definitions.length) byPos.set(pos, cur);
  }
  if (!byPos.size) throw new NotFound('Not found');
  return {
    word,
    phonetic: '',
    audio: null,
    meanings: [...byPos.values()],
    moreUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
  };
}

async function freeDictionary(word, signal) {
  const data = await getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, signal);

  const phonetics = data.flatMap((d) => d.phonetics || []);
  const audio =
    phonetics.find((p) => p.audio && /-us\.mp3$/.test(p.audio))?.audio ||
    phonetics.find((p) => p.audio)?.audio ||
    null;
  const phonetic = data[0].phonetic || phonetics.find((p) => p.text)?.text || '';

  // The API often returns several entries; merge them by part of speech.
  const byPos = new Map();
  for (const entry of data) {
    for (const m of entry.meanings || []) {
      let cur = byPos.get(m.partOfSpeech);
      if (!cur) {
        cur = { partOfSpeech: m.partOfSpeech, definitions: [], synonyms: new Set(), antonyms: new Set() };
        byPos.set(m.partOfSpeech, cur);
      }
      for (const d of m.definitions || []) {
        cur.definitions.push({ definition: d.definition, example: d.example || '' });
        (d.synonyms || []).forEach((s) => cur.synonyms.add(s));
        (d.antonyms || []).forEach((s) => cur.antonyms.add(s));
      }
      (m.synonyms || []).forEach((s) => cur.synonyms.add(s));
      (m.antonyms || []).forEach((s) => cur.antonyms.add(s));
    }
  }

  return {
    word: data[0].word,
    phonetic,
    audio,
    meanings: [...byPos.values()].map((m) => ({
      ...m,
      synonyms: [...m.synonyms].slice(0, 8),
      antonyms: [...m.antonyms].slice(0, 8),
    })),
    moreUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(data[0].word)}`,
  };
}

async function translate(text, settings) {
  const tl = settings.targetLang || 'en';
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto' +
    `&tl=${encodeURIComponent(tl)}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
  const data = await getJSON(url);
  const translation = (data[0] || []).map((seg) => seg[0]).join('');
  if (!translation) throw new Error('No translation available.');
  return {
    source: text,
    translation,
    from: data[2] || 'auto',
    to: tl,
    // dt=bd gives per-part-of-speech alternatives for single words
    alternatives: (data[1] || []).map((b) => ({ pos: b[0], terms: (b[1] || []).slice(0, 6) })),
    moreUrl: `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(tl)}&text=${encodeURIComponent(text)}`,
  };
}

async function wikipedia(text, settings) {
  const lang = (settings.wikiLang || 'en').split('-')[0];
  const base = `https://${lang}.wikipedia.org`;
  const summary = (title) =>
    getJSON(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);

  let d;
  try {
    d = await summary(text);
  } catch (e) {
    if (!(e instanceof NotFound)) throw e;
    // Fall back to a search for the closest article title.
    const [, titles] = await getJSON(
      `${base}/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(text)}`
    );
    if (!titles?.length) throw new Error(`No Wikipedia article found for “${text}”.`);
    d = await summary(titles[0]);
  }

  return {
    title: d.title,
    description: d.description || '',
    extract: d.extract || '',
    disambiguation: d.type === 'disambiguation',
    thumbnail: d.thumbnail?.source || null,
    url: d.content_urls?.desktop?.page || `${base}/wiki/${encodeURIComponent(d.title)}`,
  };
}

async function urban(text) {
  const data = await getJSON(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(text)}`);
  const strip = (s) => (s || '').replace(/[[\]]/g, '').trim();
  const list = (data.list || [])
    .sort((a, b) => b.thumbs_up - a.thumbs_up)
    .slice(0, 3)
    .map((d) => ({ word: d.word, definition: strip(d.definition), example: strip(d.example), votes: d.thumbs_up }));
  if (!list.length) throw new Error(`No Urban Dictionary entries for “${text}”.`);
  return { items: list, moreUrl: `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(text)}` };
}

const SOURCES = { dictionary, translate, wikipedia, urban };

export async function lookup(source, text, settings) {
  const fn = SOURCES[source];
  if (!fn) throw new Error(`Unknown source: ${source}`);
  return fn(text, settings || {});
}
