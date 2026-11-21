// Offline English dictionary (WordNet 3.1 + CMUdict), bundled in data/dict/.
// Each lookup reads one small shard file from the extension package, typically in a few ms.

import { shardOf } from './shard.js';

const MAX_SHARDS_IN_MEMORY = 80;
const shards = new Map(); // key -> Promise<shard|null>

function loadShard(key) {
  if (shards.has(key)) {
    const p = shards.get(key);
    shards.delete(key); // re-insert to mark as recently used
    shards.set(key, p);
    return p;
  }
  const p = fetch(chrome.runtime.getURL(`data/dict/${key}.json`))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  shards.set(key, p);
  if (shards.size > MAX_SHARDS_IN_MEMORY) shards.delete(shards.keys().next().value);
  return p;
}

// Common irregular forms that suffix rules can't recover.
const IRREGULAR = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', does: 'do', did: 'do', done: 'do', went: 'go', gone: 'go',
  ran: 'run', saw: 'see', seen: 'see', took: 'take', taken: 'take', gave: 'give', given: 'give',
  came: 'come', made: 'make', said: 'say', got: 'get', gotten: 'get', knew: 'know', known: 'know',
  thought: 'think', told: 'tell', found: 'find', became: 'become', left: 'leave', felt: 'feel',
  brought: 'bring', began: 'begin', begun: 'begin', kept: 'keep', held: 'hold', wrote: 'write',
  written: 'write', stood: 'stand', heard: 'hear', meant: 'mean', met: 'meet', paid: 'pay',
  sat: 'sit', spoke: 'speak', spoken: 'speak', led: 'lead', grew: 'grow', grown: 'grow',
  lost: 'lose', fell: 'fall', fallen: 'fall', sent: 'send', built: 'build', understood: 'understand',
  drew: 'draw', drawn: 'draw', broke: 'break', broken: 'break', spent: 'spend', rose: 'rise',
  risen: 'rise', drove: 'drive', driven: 'drive', bought: 'buy', wore: 'wear', worn: 'wear',
  chose: 'choose', chosen: 'choose', sought: 'seek', threw: 'throw', thrown: 'throw', caught: 'catch',
  taught: 'teach', fought: 'fight', ate: 'eat', eaten: 'eat', flew: 'fly', flown: 'fly', forgot: 'forget',
  forgotten: 'forget', sang: 'sing', sung: 'sing', swam: 'swim', slept: 'sleep', sold: 'sell',
  won: 'win', woke: 'wake', woken: 'wake', hid: 'hide', hidden: 'hide', bit: 'bite', bitten: 'bite',
  children: 'child', men: 'man', women: 'woman', people: 'person', mice: 'mouse', feet: 'foot',
  teeth: 'tooth', geese: 'goose', oxen: 'ox', lives: 'life', wives: 'wife', knives: 'knife',
  leaves: 'leaf', halves: 'half', wolves: 'wolf', criteria: 'criterion', phenomena: 'phenomenon',
  data: 'datum', analyses: 'analysis', crises: 'crisis', better: 'good', best: 'good',
  worse: 'bad', worst: 'bad', further: 'far', farther: 'far', less: 'little', least: 'little',
};

// WordNet "morphy"-style suffix rules, plus doubled-consonant handling ("running" → "run").
const RULES = [
  ['ies', 'y'], ['ves', 'f'], ['ves', 'fe'], ['ses', 's'], ['xes', 'x'], ['zes', 'z'],
  ['ches', 'ch'], ['shes', 'sh'], ['men', 'man'], ['es', 'e'], ['es', ''], ['s', ''],
  ['ied', 'y'], ['ed', 'e'], ['ed', ''], ['ing', 'e'], ['ing', ''],
  ['ier', 'y'], ['iest', 'y'], ['er', 'e'], ['er', ''], ['est', 'e'], ['est', ''],
  ['ily', 'y'], ['ly', ''],
];

function candidates(word) {
  const out = [word];
  if (Object.hasOwn(IRREGULAR, word)) out.push(IRREGULAR[word]);
  if (word.endsWith("'s")) out.push(word.slice(0, -2));
  for (const [suffix, repl] of RULES) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      const base = word.slice(0, -suffix.length) + repl;
      out.push(base);
      if (!repl && /([b-df-hj-np-tv-z])\1$/.test(base)) out.push(base.slice(0, -1));
    }
  }
  return [...new Set(out)];
}

const sentence = (s) => (s ? s[0].toUpperCase() + s.slice(1) + (/[.!?)]$/.test(s) ? '' : '.') : '');

async function pronunciation(word) {
  const sh = await loadShard(shardOf(word));
  return sh && Object.hasOwn(sh.p, word) ? sh.p[word] : '';
}

/** Returns a dictionary result, or null if the word isn't in the offline dictionary. */
async function hasEntry(lemma) {
  const sh = await loadShard(shardOf(lemma));
  return !!sh && Object.hasOwn(sh.e, lemma);
}

export async function offlineDefine(text) {
  const word = text.trim().toLowerCase().replace(/[’‘]/g, "'");
  const forms = candidates(word);
  for (const lemma of forms) {
    const sh = await loadShard(shardOf(lemma));
    if (!sh || !Object.hasOwn(sh.e, lemma)) continue;

    // "children" → child; also "running" (its own entry) → also a form of "run".
    let formOf = lemma !== word ? lemma : '';
    if (!formOf) {
      for (const base of forms.slice(1)) {
        if (await hasEntry(base)) {
          formOf = base;
          break;
        }
      }
    }

    const related = Object.hasOwn(sh.r, lemma) ? sh.r[lemma] : {};
    const meanings = sh.e[lemma].map(([pos, ...rest]) => {
      const definitions = [];
      for (let i = 0; i < rest.length; i += 2) {
        definitions.push({ definition: sentence(rest[i]), example: rest[i + 1] || '' });
      }
      return { partOfSpeech: pos, definitions, synonyms: related[pos] || [], antonyms: [] };
    });

    return {
      word: lemma,
      surface: word,
      formOf,
      phonetic: (await pronunciation(word)) || (await pronunciation(lemma)),
      audio: null,
      meanings,
      moreUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(lemma)}`,
      offline: true,
    };
  }
  return null;
}

