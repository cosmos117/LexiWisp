// Builds the offline dictionary used by LexiWisp from WordNet 3.1 + CMUdict.
//
//   npm i --ignore-scripts wordnet-db cmu-pronouncing-dictionary   (in any scratch folder)
//   node tools/build-dictionary.mjs <path-to>/wordnet-db <path-to>/cmu-pronouncing-dictionary
//
// Output: data/dict/<shard>.json, sharded by the first two letters of the word, so the
// extension only loads a small file (tens of KB) per lookup.
//
// Shard format: { "e": { lemma: [[pos, gloss, example, ...] ...] }, "r": { lemma: { pos: [related...] } }, "p": { word: ipa } }
// (see src/offline-dictionary.js for the reader)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shardOf } from '../src/shard.js';

const [wnDir, cmuDir] = process.argv.slice(2);
if (!wnDir || !cmuDir) {
  console.error('usage: node tools/build-dictionary.mjs <wordnet-db dir> <cmu-pronouncing-dictionary dir>');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'data', 'dict');
const MAX_SENSES = 3; // per part of speech
const MAX_RELATED = 4;
const MAX_EXAMPLES = 2; // example sentences kept for the first N senses

const POS_FILES = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const POS_NAME = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };

const clean = (w) => w.replace(/\(.*?\)$/, '').replace(/_/g, ' ').toLowerCase();

// ---- WordNet data files: offset -> { words, gloss, example, hypernyms } --------
const synsets = Object.create(null); // key `${pos}:${offset}`
for (const [p, file] of Object.entries(POS_FILES)) {
  const lines = fs.readFileSync(path.join(wnDir, 'dict', `data.${file}`), 'utf8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('  ')) continue; // license header lines start with two spaces
    const [head, glossPart = ''] = line.split(' | ');
    const f = head.trim().split(' ');
    const offset = f[0];
    const wCnt = parseInt(f[3], 16);
    const words = [];
    for (let i = 0; i < wCnt; i++) words.push(clean(f[4 + i * 2]));
    let k = 4 + wCnt * 2;
    const pCnt = parseInt(f[k++], 10);
    const hypernyms = [];
    for (let i = 0; i < pCnt; i++, k += 4) {
      if (f[k] === '@' || f[k] === '@i') hypernyms.push(`${f[k + 2] === 's' ? 'a' : f[k + 2]}:${f[k + 1]}`);
    }
    // gloss: definition text, then optional  ; "example"  ; "example"
    const quoteAt = glossPart.indexOf('"');
    let gloss = (quoteAt === -1 ? glossPart : glossPart.slice(0, quoteAt)).trim().replace(/[;:,\s]+$/, '');
    const example = (glossPart.match(/"([^"]+)"/) || [])[1] || '';
    gloss = gloss.replace(/\s+/g, ' ');
    synsets[`${p}:${offset}`] = { words, gloss, example, hypernyms };
  }
}

// ---- WordNet index files: lemma -> ordered synsets per pos -------------------
const entries = Object.create(null); // lemma -> [{ pos, freq, senses: [synsetKey...] }]
for (const [p, file] of Object.entries(POS_FILES)) {
  const lines = fs.readFileSync(path.join(wnDir, 'dict', `index.${file}`), 'utf8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('  ')) continue;
    const f = line.trim().split(' ');
    const lemma = clean(f[0]);
    const synCnt = parseInt(f[2], 10);
    const ptrCnt = parseInt(f[3], 10);
    const tagCnt = parseInt(f[5 + ptrCnt], 10); // how often the word was seen in this pos
    const offsets = f.slice(6 + ptrCnt, 6 + ptrCnt + synCnt);
    (entries[lemma] ||= []).push({ pos: p, freq: tagCnt, senses: offsets.map((o) => `${p}:${o}`) });
  }
}

// ---- CMUdict → IPA -------------------------------------------------------------
const ARPA = {
  AA: 'ɑ', AE: 'æ', AH: 'ʌ', AO: 'ɔ', AW: 'aʊ', AY: 'aɪ', EH: 'ɛ', ER: 'ɜr', EY: 'eɪ', IH: 'ɪ',
  IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u', B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f',
  G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's',
  SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ',
};
const VALID_ONSETS = /^(|[^aeiouɑæʌɔɛɜɪʊ]|pl|pr|bl|br|tr|dr|kl|kr|ɡl|ɡr|fl|fr|θr|ʃr|sp|st|sk|sm|sn|sl|sw|spl|spr|str|skr|skw|tw|dw|kw|ɡw|θw|pj|bj|kj|mj|fj|vj|hj|nj|lj)$/;

function toIpa(arpa) {
  const phones = arpa.split(' ').map((ph) => {
    const m = ph.match(/^([A-Z]+)([012])?$/);
    if (!m) return null;
    let sym = ARPA[m[1]];
    if (m[1] === 'AH' && m[2] === '0') sym = 'ə';
    if (m[1] === 'ER' && m[2] === '0') sym = 'ər';
    return { sym, vowel: m[2] !== undefined, stress: m[2] };
  });
  if (phones.some((p) => !p || !p.sym)) return null;
  const vowelIdx = phones.map((p, i) => (p.vowel ? i : -1)).filter((i) => i >= 0);
  const multi = vowelIdx.length > 1;
  const out = phones.map((p) => p.sym);
  // Place stress marks before each stressed syllable's onset (maximal valid onset).
  for (let v = vowelIdx.length - 1; v >= 0; v--) {
    const vi = vowelIdx[v];
    const stress = phones[vi].stress;
    if (!multi || stress === '0') continue;
    const prevVowel = v > 0 ? vowelIdx[v - 1] : -1;
    let start = vi;
    // A single consonant phone (incl. tʃ, dʒ) is always a valid onset; clusters must be legal in English.
    const validOnset = (from) => {
      const cluster = phones.slice(from, vi);
      return cluster.length === 1 || VALID_ONSETS.test(cluster.map((p) => p.sym).join(''));
    };
    while (start - 1 > prevVowel && validOnset(start - 1)) start--;
    out.splice(start, 0, stress === '1' ? 'ˈ' : 'ˌ');
  }
  return `/${out.join('')}/`;
}

const cmuSrc = fs.readFileSync(path.join(cmuDir, 'index.js'), 'utf8');
const cmu = JSON.parse(cmuSrc.slice(cmuSrc.indexOf('= {') + 2, cmuSrc.lastIndexOf('}') + 1));
const ipa = Object.create(null);
for (const [word, arpa] of Object.entries(cmu)) {
  if (/\(\d+\)$/.test(word) || !/^[a-z][a-z'.-]*$/.test(word)) continue; // skip alternates / odd keys
  const v = toIpa(arpa);
  if (v) ipa[word] = v;
}

// ---- assemble shards -----------------------------------------------------------
const shards = Object.create(null);
const shard = (w) => (shards[shardOf(w)] ||= { e: Object.create(null), r: Object.create(null), p: Object.create(null) });

let skipped = 0;
for (const [lemma, posList] of Object.entries(entries)) {
  // Keep every single word, but only multi-word phrases seen in WordNet's usage corpus
  // ("look up", "ice cream") — this drops ~60k rare taxonomic/technical phrases.
  if (/[ -]/.test(lemma) && posList.every((x) => x.freq === 0)) {
    skipped++;
    continue;
  }
  posList.sort((a, b) => b.freq - a.freq);
  const out = [];
  const related = Object.create(null);
  const seenPos = new Set();
  for (const { pos, senses } of posList) {
    const name = POS_NAME[pos];
    if (seenPos.has(name)) continue;
    seenPos.add(name);
    const defs = [name];
    const rel = new Set();
    for (const [i, key] of senses.slice(0, MAX_SENSES).entries()) {
      const s = synsets[key];
      if (!s?.gloss) continue;
      defs.push(s.gloss, i < MAX_EXAMPLES ? s.example : '');
      for (const w of s.words) if (w !== lemma && rel.size < MAX_RELATED) rel.add(w);
    }
    // No true synonyms? Use the broader category ("serendipity" → luck, fortune, chance).
    const first = synsets[senses[0]];
    for (const h of first?.hypernyms || []) {
      for (const w of synsets[h]?.words || []) if (w !== lemma && rel.size < 3) rel.add(w);
    }
    if (defs.length > 1) out.push(defs);
    if (rel.size) related[name] = [...rel];
  }
  if (!out.length) continue;
  const sh = shard(lemma);
  sh.e[lemma] = out;
  if (Object.keys(related).length) sh.r[lemma] = related;
}
for (const [word, v] of Object.entries(ipa)) shard(word).p[word] = v;

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f));
let total = 0;
for (const [name, data] of Object.entries(shards)) {
  const json = JSON.stringify(data);
  total += json.length;
  fs.writeFileSync(path.join(outDir, `${name}.json`), json);
}

const wnLicense = fs.readFileSync(path.join(wnDir, 'LICENSE'), 'utf8');
const cmuLicense = fs.readFileSync(path.join(cmuDir, 'license'), 'utf8');
fs.writeFileSync(
  path.join(outDir, 'LICENSES.txt'),
  `Definitions: WordNet 3.1, Princeton University\n\n${wnLicense}\n\n` +
    `Pronunciations: CMU Pronouncing Dictionary, Carnegie Mellon University (via cmu-pronouncing-dictionary)\n\n${cmuLicense}\n`
);

console.log(
  `lemmas: ${Object.keys(entries).length - skipped} (skipped ${skipped} rare phrases), pronunciations: ${Object.keys(ipa).length}, ` +
    `shards: ${Object.keys(shards).length}, total: ${(total / 1048576).toFixed(1)} MB`
);
