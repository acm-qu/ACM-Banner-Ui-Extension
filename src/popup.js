/* Popup — writes the same storage keys the content script reads.
   chrome.storage.onChanged propagates the change to every open Banner tab,
   so no tab messaging and no "scripting" permission is needed.

   The popup wears the theme it controls: it stamps the same data-qux scope
   on its own <html> that the content script stamps on Banner. Loaded from
   <head>, so the scope is on the root before anything paints. */
(() => {
  'use strict';

  const DEFAULTS = { theme: 'qu', mode: 'auto', lang: 'en', enabled: true, motion: 'on' };
  const root = document.documentElement;
  const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // The prefs this popup last showed, kept in its own localStorage only so
  // the next open paints the right theme on its first frame instead of the
  // defaults. chrome.storage.sync stays the source of truth and corrects it
  // a moment later. Prefs only, never anything from a page.
  const LAST = 'qu-popup-prefs';
  let prefs = Object.assign({}, DEFAULTS, readLast());

  function readLast() {
    try {
      return JSON.parse(localStorage.getItem(LAST));
    } catch (e) {
      return null;
    }
  }

  function writeLast() {
    try {
      localStorage.setItem(LAST, JSON.stringify(prefs));
    } catch (e) {
      /* storage unavailable: the next open paints the defaults first */
    }
  }

  const enabled = () => prefs.enabled !== false;
  const animated = () => prefs.motion !== 'off';

  // Everything the sheet can decide from the root: palette, copy, status.
  function stampRoot() {
    const dark = prefs.mode === 'dark' || (prefs.mode === 'auto' && darkScheme.matches);
    root.dataset.qux = prefs.theme + '-' + (dark ? 'dark' : 'light');
    root.dataset.anim = animated() ? 'on' : 'off';
    root.dataset.enabled = enabled() ? 'on' : 'off';
  }

  stampRoot();

  function paint() {
    stampRoot();
    document.getElementById('enabled').setAttribute('aria-checked', String(enabled()));
    document.getElementById('motion').setAttribute('aria-checked', String(animated()));
    ['theme', 'mode'].forEach((key) => {
      document.getElementById(key).querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.value === prefs[key]));
      });
    });
    // Restyle off: the other settings stay visible but take no input.
    document.getElementById('settings').inert = !enabled();
  }

  function save(key, value) {
    if (prefs[key] === value) return;
    prefs[key] = value;
    paint();
    writeLast();
    chrome.storage.sync.set({ [key]: value }, () => void chrome.runtime.lastError);
  }

  function init() {
    document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

    document.getElementById('enabled').addEventListener('click', () => {
      save('enabled', !enabled());
    });
    document.getElementById('motion').addEventListener('click', () => {
      if (enabled()) save('motion', animated() ? 'off' : 'on');
    });
    ['theme', 'mode'].forEach((key) => {
      document.getElementById(key).addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-value]');
        if (btn && enabled()) save(key, btn.dataset.value);
      });
    });
    // Auto follows the OS while the popup is open, as the page does.
    darkScheme.addEventListener('change', stampRoot);

    paint();
    chrome.storage.sync.get(DEFAULTS, (got) => {
      if (!chrome.runtime.lastError) prefs = Object.assign({}, DEFAULTS, got);
      paint();
      writeLast();
      // Transitions switch on only after the stored state has painted, so
      // opening the popup never animates away from the defaults.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          root.dataset.ready = '';
        })
      );
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
