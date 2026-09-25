/* Popup — writes the same storage keys the content script reads.
   chrome.storage.onChanged propagates the change to every open Banner tab,
   so no tab messaging and no "scripting" permission is needed. */
(() => {
  'use strict';

  const DEFAULTS = { theme: 'qu', mode: 'auto', lang: 'en', enabled: true, motion: 'on' };
  const GROUPS = ['theme', 'mode', 'motion'];
  // 'enabled' is a boolean in storage but on/off in the markup.
  const asValue = (k, v) => (k === 'enabled' ? (v ? 'on' : 'off') : v);
  const fromValue = (k, v) => (k === 'enabled' ? v === 'on' : v);

  function paint(prefs) {
    ['enabled'].concat(GROUPS).forEach((key) => {
      const group = document.getElementById(key);
      if (!group) return;
      group.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.value === asValue(key, prefs[key])));
      });
    });
  }

  chrome.storage.sync.get(DEFAULTS, (got) => {
    const prefs = Object.assign({}, DEFAULTS, chrome.runtime.lastError ? null : got);
    paint(prefs);

    ['enabled'].concat(GROUPS).forEach((key) => {
      const group = document.getElementById(key);
      if (!group) return;
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        prefs[key] = fromValue(key, btn.dataset.value);
        paint(prefs);
        chrome.storage.sync.set({ [key]: prefs[key] });
      });
    });
  });
})();
