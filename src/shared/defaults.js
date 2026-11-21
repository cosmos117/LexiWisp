// Shared settings defaults. Loaded as a classic script (content script, popup,
// options) and as a side-effect import from the module service worker.
(() => {
  const uiLang = (globalThis.navigator?.language || 'en').split('-')[0];

  globalThis.DEFINER_LANGUAGES = [
    { code: 'af', name: 'Afrikaans' }, { code: 'ar', name: 'Arabic' },
    { code: 'bn', name: 'Bengali' }, { code: 'bg', name: 'Bulgarian' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' }, { code: 'zh-TW', name: 'Chinese (Traditional)' },
    { code: 'hr', name: 'Croatian' }, { code: 'cs', name: 'Czech' },
    { code: 'da', name: 'Danish' }, { code: 'nl', name: 'Dutch' },
    { code: 'en', name: 'English' }, { code: 'fi', name: 'Finnish' },
    { code: 'fr', name: 'French' }, { code: 'de', name: 'German' },
    { code: 'el', name: 'Greek' }, { code: 'gu', name: 'Gujarati' },
    { code: 'he', name: 'Hebrew' }, { code: 'hi', name: 'Hindi' },
    { code: 'hu', name: 'Hungarian' }, { code: 'id', name: 'Indonesian' },
    { code: 'it', name: 'Italian' }, { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' }, { code: 'ms', name: 'Malay' },
    { code: 'mr', name: 'Marathi' }, { code: 'ne', name: 'Nepali' },
    { code: 'no', name: 'Norwegian' }, { code: 'fa', name: 'Persian' },
    { code: 'pl', name: 'Polish' }, { code: 'pt', name: 'Portuguese' },
    { code: 'pa', name: 'Punjabi' }, { code: 'ro', name: 'Romanian' },
    { code: 'ru', name: 'Russian' }, { code: 'sr', name: 'Serbian' },
    { code: 'es', name: 'Spanish' }, { code: 'sw', name: 'Swahili' },
    { code: 'sv', name: 'Swedish' }, { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' }, { code: 'th', name: 'Thai' },
    { code: 'tr', name: 'Turkish' }, { code: 'uk', name: 'Ukrainian' },
    { code: 'ur', name: 'Urdu' }, { code: 'vi', name: 'Vietnamese' },
  ];

  globalThis.DEFINER_DEFAULTS = {
    // 'dblclick' | 'select' | 'modifier'
    trigger: 'dblclick',
    // used when trigger === 'modifier': 'alt' | 'ctrl' | 'shift'
    modifier: 'alt',
    targetLang: uiLang === 'en' ? 'es' : uiLang,
    wikiLang: 'en',
    // 'auto' | 'light' | 'dark'
    theme: 'auto',
    fontSize: 14,
    maxDefinitions: 3,
    sources: [
      { id: 'dictionary', enabled: true },
      { id: 'translate', enabled: true },
      { id: 'wikipedia', enabled: true },
      { id: 'urban', enabled: false },
    ],
    ignoreEditable: true,
    saveHistory: true,
    disabledSites: [],
  };
})();
