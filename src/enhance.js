/* Content script for mybanner.qu.edu.qa. Runs at document_start.

   Four rules the rest of this file assumes:

   - Restyle, never rebuild. Cascade binds jQuery handlers to
     button.menubaseButton and div.htmlButtonLevel2-3, and replacing either
     one breaks navigation. We only add classes, data-attributes and wrapper
     spans inside labels.
   - Never read, write, prefill or submit a credential field.
   - Never request a login-family URL. Banner keeps one SESSID per browser
     profile, so a single request signs the user out of every open tab.
   - Never log or persist anything off a leaf page. The IDs, names, grades and
     balances on these pages are the student's. */
(() => {
  'use strict';

  const root = document.documentElement;
  const url = (p) => chrome.runtime.getURL(p);

  // Requesting any of these reissues the profile-wide SESSID and signs the
  // user out of every open tab. Nothing here fetches at all; the pattern is
  // kept as a guard for any future feature that wants to.
  const LOGOUT_TRAP =
    /(^\/$)|P_WWWLogin|P_ProxyLogin|P_DispLoginNon|bwskfgpw\.P_Index|P_Logout|P_ValLogin/i;

  // Any page carrying a password field is a credential page. We style it,
  // but every value-touching branch below is gated on this being false.
  const hasCredentials = () => !!document.querySelector('input[type="password"]');

  // --- Page identity. The site gives body no class or id, so derive one ---

  const proc = location.pathname.split('/').pop() || '';
  const menu = new URLSearchParams(location.search).get('name') || '';

  root.dataset.quProc = proc;
  root.dataset.quMenu = menu;
  root.classList.add('qu-x');

  const isMenuPage = /twbkwbis\.P_GenMenu/i.test(proc);
  root.classList.add(isMenuPage ? 'qu-menu' : 'qu-leaf');
  if (menu === 'bmenu.P_MainMnu') root.classList.add('qu-home');

  // --- Theme, stamped before first paint ---

  const DEFAULTS = { theme: 'qu', mode: 'auto', lang: 'en', enabled: true };

  function stampTheme({ theme, mode, lang }) {
    const dark =
      mode === 'dark' ||
      (mode === 'auto' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.qux = theme + '-' + (dark ? 'dark' : 'light');
    root.dataset.quxTheme = theme;
    root.dataset.quxMode = mode;
    root.dataset.uilang = lang;
    root.classList.toggle('qu-ar', lang === 'ar');
  }

  // Synchronous best guess so the correct palette paints first; corrected
  // microseconds later when storage resolves.
  stampTheme(DEFAULTS);
  let prefs = Object.assign({}, DEFAULTS);

  // The kill switch. Every rule in skin.css is scoped to html.qu-x and all
  // the added chrome comes from this script, so dropping the class and the
  // asset sheet hands the page back to Banner as the server sent it.
  let disabled = false;

  function disableSkin() {
    disabled = true;
    root.classList.remove(
      'qu-x',
      'qu-menu',
      'qu-leaf',
      'qu-home',
      'qu-anon',
      'qu-auth',
      'qu-ar',
      'qu-transcript',
      'qu-ords'
    );
    const sheet = document.getElementById('qu-assets');
    if (sheet) sheet.remove();
    reveal();
  }

  const prefsReady = new Promise((resolve) => {
    try {
      chrome.storage.sync.get(DEFAULTS, (got) => {
        if (!chrome.runtime.lastError && got) prefs = Object.assign({}, DEFAULTS, got);
        if (prefs.enabled === false) disableSkin();
        else stampTheme(prefs);
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });

  function savePrefs(patch) {
    prefs = Object.assign({}, prefs, patch);
    stampTheme(prefs);
    try {
      chrome.storage.sync.set(patch);
    } catch (e) {
      /* storage unavailable — the stamp above still applies for this page */
    }
    syncSwitcher();
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      const patch = {};
      for (const k of Object.keys(DEFAULTS)) {
        if (changes[k]) patch[k] = changes[k].newValue;
      }
      if (!Object.keys(patch).length) return;
      const wasEnabled = prefs.enabled !== false;
      prefs = Object.assign({}, prefs, patch);
      if ('enabled' in patch && (prefs.enabled !== false) !== wasEnabled) {
        location.reload();
        return;
      }
      if (prefs.enabled === false) return;
      stampTheme(prefs);
      syncSwitcher();
    });
  } catch (e) {
    /* no storage events available in this context */
  }

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      if (prefs.mode === 'auto') stampTheme(prefs);
    };
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  // --- Anti-flash. Whatever happens, this always lifts ---

  const preload = document.createElement('style');
  preload.id = 'qu-preload';
  preload.textContent = 'html.qu-x body{visibility:hidden!important}';
  root.appendChild(preload);

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    preload.remove();
  };
  setTimeout(reveal, 1200); // hard fallback — never leave the page hidden
  document.addEventListener('DOMContentLoaded', () => setTimeout(reveal, 60));
  window.addEventListener('load', reveal);
  window.addEventListener('pagehide', reveal);

  // --- Bundled fonts and icon variables ---
  // A bare url() in an injected sheet resolves against mybanner and 404s, so
  // every asset URL is written here at runtime through getURL.

  const ICON_VARS = [
    ['search', 'search'],
    ['x', 'x'],
    ['external', 'external'],
    ['info', 'info-circle'],
    ['warn', 'alert-triangle'],
    ['error', 'alert-circle'],
    ['sun', 'sun'],
    ['moon', 'moon'],
    ['chevron-down', 'chevron-down'],
    ['chevron-right', 'chevron-right'],
    ['house', 'house'],
    ['link', 'link'],
    ['printer', 'printer'],
    ['default', 'file-text'],
  ];

  /* Only faces actually present in assets/fonts belong here — an @font-face
     whose file 404s costs a flash of invisible text on every page load, and
     font-display:swap does not fully absorb that. */
  const BUNDLED_FONTS = [
    { family: 'Droid Arabic Kufi', weight: '400', file: 'Droid.Arabic.Kufi_Normal.ttf', fmt: 'truetype' },
    { family: 'Droid Arabic Kufi', weight: '700', file: 'Droid.Arabic.Kufi.ttf', fmt: 'truetype' },
    // Variable fonts: one file covers the whole weight range.
    { family: 'Lexend', weight: '100 900', file: 'Lexend.woff2', fmt: 'woff2' },
    { family: 'JetBrains Mono', weight: '100 800', file: 'JetBrainsMono.woff2', fmt: 'woff2' },
    { family: 'Poppins', weight: '700', file: 'Poppins-700.woff2', fmt: 'woff2' },
    { family: 'Poppins', weight: '800', file: 'Poppins-800.woff2', fmt: 'woff2' },
  ];

  const assets = document.createElement('style');
  assets.id = 'qu-assets';
  assets.textContent =
    BUNDLED_FONTS.map(
      (f) =>
        '@font-face{font-family:"' +
        f.family +
        '";font-weight:' +
        f.weight +
        ';font-display:swap;src:url("' +
        url('assets/fonts/' + f.file) +
        '") format("' + f.fmt + '")}'
    ).join('\n') +
    '\nhtml.qu-x{--qu-acm-mark:url("' +
    url('assets/acm/logo-acm-qu.png') +
    '");' +
    ICON_VARS.map((p) => '--qu-i-' + p[0] + ':url("' + url('assets/icons/' + p[1] + '.svg') + '")').join(';') +
    '}';
  root.appendChild(assets);

  /* --- Per-item icons. Banner's element ids encode the target procedure, so
     the icon can be picked with no network call and no string matching
     against a user-visible label. --- */

  const ICONS = {
    'bmenu.P_GenMnu': 'eye',
    'bmenu.P_PerMnu': 'eye',
    'bmenu.P_StuMainMnu': 'calendar-plus',
    'bmenu.P_RegMnu': 'calendar-plus',
    'bmenu.P_StReg_Sup': 'calendar-plus',
    'bmenu.P_SSMnu': 'lifebuoy',
    'bmenu.P_Protocol': 'file-text',
    'bmenu.P_ARMnu': 'wallet',
    'bmenu.P_BSRVMnu': 'book',
    'bmenu.P_SchMnu': 'award',
    'bmenu.p_CLAP': 'clipboard-check',
    'bmenu.P_4P1Mnu': 'certificate',
    'bmenu.P_CSMenu': 'swap',
    'bwskgstu.P_StuInfo': 'id-card',
    'bwskinfo.P_StdDispInfo': 'user-check',
    'bwskinfo.P_Stdaddchange': 'map-pin',
    'bwskinfo.P_Stdmailchange': 'mail',
    'bwskinfo.P_Stdmobchange': 'phone-alert',
    'bwgkogad.P_SelectAtypView': 'map-pin',
    'bwgkogad.P_SelectEmalView': 'mail',
    'bwgkoemr.P_ViewEmrgContacts': 'phone-alert',
    'bwgkprxy.P_ManageProxy': 'user-check',
    'bwskoacc.P_ViewAcctTotal': 'coins',
    'bwskoacc.P_ViewAcctTerm': 'coins',
    'bwskoacc.P_ViewAR': 'file-invoice',
    'bwskoacc.P_DisplayTabs': 'file-invoice',
    'bwskpayg.P_DispList': 'wallet',
    'bwskffee.P_FeeAsses': 'calculator',
    'bwskotrn.P_ViewTermTran': 'file-text',
    'bwskgpac.P_StuDispCrs': 'calculator',
    'bwskrgpn.p_select_term': 'scale',
    'bwsktest.P_StuDispTest': 'checklist',
    'bwsktest.P_Orientation': 'info-circle',
    'bwskbook.P_StuDispBook': 'book',
    'bwckcapp.P_DispCurrent': 'trophy',
    'bwckcapp.P_DispEvalViewOption': 'checklist',
    'bwskclap.p_SelType': 'clipboard-list',
    'bwskclap.p_Status': 'clipboard-check',
    'bwskssch.p_DisplaySch': 'award',
    'bwskssch.P_ApplyServiceExc': 'award',
    'bwskssch.P_CheckStatusExc': 'award',
    'bwskscsb.P_Status': 'award',
    'bwskscsb.p_SelTerm': 'award',
    'bwskfone.P_ApplyFourPlusOne': 'certificate',
    'bwskfone.P_CheckFourPlusOne': 'certificate',
    'bvgkptcl.P_Disp_Apply_Protocol': 'clipboard-list',
    'bvgkptcl.P_DispView_Protocols': 'clipboard-check',
    'bwskrgpn.p_select_courses': 'scale',
    'twbksite.P_DispSiteMap': 'menu',
  };

  const HOST_ICONS = {
    'khazna.qu.edu.qa': 'briefcase',
    'mycard.qu.edu.qa': 'id-card',
    'qusis.qu.edu.qa': 'building',
    'banpssr.qu.edu.qa': 'calendar',
    'banpsfssb.qu.edu.qa': 'calendar',
  };

  // id = the href with dots replaced by "--", then "___UID" + n. The obvious
  // id.split('--')[0] breaks on external links; this does not.
  function targetFromId(id) {
    const base = String(id || '').replace(/___UID\d+$/, '');
    const target = base.replace(/--/g, '.');
    return {
      target: target,
      isExternal: /^https?:/i.test(target),
      isMenu: base.indexOf('bmenu--') === 0,
    };
  }

  /* Around 28 destinations leave this host, so the procedure name says
     nothing about them — every qusis.qu.edu.qa card would get the same icon.
     The English half of the label is the only signal left. Icon choice only:
     no label is rewritten, and a miss falls through to the neutral default. */
  const LABEL_ICONS = [
    [/financial aid/i, 'coins'],
    [/scholarship/i, 'award'],
    [/locker/i, 'lock'],
    [/transport/i, 'bus'],
    [/campus card/i, 'id-card'],
    [/complaint/i, 'message-report'],
    [/voting|election/i, 'vote'],
    [/employment|career|job/i, 'briefcase'],
    [/life award|award/i, 'trophy'],
    [/clearance/i, 'clipboard-check'],
    [/course substitution|substitut/i, 'swap'],
    [/transfer/i, 'transfer'],
    [/residence permit|visa/i, 'passport'],
    [/four plus one|4\+1/i, 'certificate'],
    [/print/i, 'printer'],
    [/e-?book/i, 'file-text'],
    [/deliver/i, 'truck'],
    [/appointment/i, 'calendar'],
    [/textbook|book/i, 'book'],
    [/schedule|calendar/i, 'calendar'],
    [/form/i, 'file-text'],
    [/transcript/i, 'file-text'],
    [/account|payment|fee|invoice/i, 'wallet'],
    [/address|phone/i, 'map-pin'],
    [/e-?mail/i, 'mail'],
    [/registration|register/i, 'calendar-plus'],
    [/grade|gpa|calculat/i, 'calculator'],
    [/test score|test/i, 'checklist'],
    [/personal|profile|student information/i, 'id-card'],
    [/proxy|delegat/i, 'user-check'],
    [/help|support|service request/i, 'lifebuoy'],
    [/site map/i, 'menu'],
  ];

  function iconFromLabel(label) {
    if (!label) return null;
    for (let i = 0; i < LABEL_ICONS.length; i++) {
      if (LABEL_ICONS[i][0].test(label)) return LABEL_ICONS[i][1];
    }
    return null;
  }

  function iconFor(info, label) {
    if (!info.isExternal) {
      if (ICONS[info.target]) return ICONS[info.target];
      const q = info.target.indexOf('?');
      if (q > -1 && ICONS[info.target.slice(0, q)]) return ICONS[info.target.slice(0, q)];
    }
    const byLabel = iconFromLabel(label);
    if (byLabel) return byLabel;
    if (info.isExternal) {
      try {
        return HOST_ICONS[new URL(info.target).hostname] || 'external';
      } catch (e) {
        return 'external';
      }
    }
    return null;
  }

  function applyIcon(el, info, label) {
    const name = iconFor(info, label);
    if (!name) return;
    el.style.setProperty('--qu-icon', 'url("' + url('assets/icons/' + name + '.svg') + '")');
    el.dataset.quIcon = name;
  }

  /* --- Bilingual split. Server labels put English and Arabic in one text
     node with one direction, e.g. "Textbooks Service خدمة الكتب الجامعية".
     Wrapping each half is the only way both get the right font, size and
     direction. The strings themselves are never rewritten. --- */

  const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  const LATIN = /[A-Za-z]/;

  /* QU's own bilingual labels are shown in full — splitBilingual separates
     the scripts and adds or removes nothing. The extension ships no Arabic of
     its own: its labels ("Redesign", "Sign Out") are still waiting on approved
     translations, which is why there is no interface-language switch yet. */
  const SHOW_ARABIC = true;

  /* Is this element the student's own record, or a translation sitting beside
     its English twin? td.dddefault alone does not answer it — Banner reuses
     table.datadisplaytable for form layout, so edit forms put instruction text
     in "value" cells too. A real data table also carries th.ddlabel or
     th.ddheader; one borrowed for layout carries neither. */
  function isRecordValue(el) {
    const cell = el.closest('td.dddefault');
    if (!cell) return false;
    const table = cell.closest('table.datadisplaytable');
    if (!table) return false;
    return !!table.querySelector('th.ddlabel, th.ddheader');
  }

  /* Some strings arrive as their own Arabic-only element rather than as the
     tail of a bilingual run — card descriptions, the Arabic half of a warning.
     Tag those so the sheet can drop them. */
  function tagArabicOnly(el) {
    if (!el || el.dataset.quLangTagged) return;
    el.dataset.quLangTagged = '1';
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t && ARABIC.test(t) && !LATIN.test(t)) el.dataset.quLang = 'ar';
  }

  function splitBilingual(el) {
    if (!el || el.dataset.quSplit) return;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const i = text.search(ARABIC);
    if (i > 0) {
      // Cut at the first Arabic character. Everything before it is non-Arabic
      // by definition, so no Latin word can be orphaned into the Arabic run.
      // Holds whether the halves are separated by a space, glued together, or
      // joined by a dash — only the joining punctuation needs trimming off.
      const en = text.slice(0, i).replace(/[\s\-–—_:|/\\،,]+$/, '').trim();
      const ar = text.slice(i).trim();
      if (en && ar) {
        const enEl = document.createElement('span');
        enEl.className = 'qu-en';
        enEl.setAttribute('dir', 'ltr');
        enEl.textContent = en;
        el.textContent = '';
        el.appendChild(enEl);

        // With SHOW_ARABIC off the Arabic run is simply not built, rather than
        // built and hidden — no specificity fight with the site's own sheet.
        if (SHOW_ARABIC) {
          const arEl = document.createElement('span');
          arEl.className = 'qu-ar';
          arEl.setAttribute('dir', 'rtl');
          arEl.setAttribute('lang', 'ar');
          arEl.textContent = ar;
          el.appendChild(arEl);
        }
      }
    } else if (i === 0) {
      // Arabic with no English half is the only label the server gives, so it
      // stays whatever the setting — hiding it would leave the control blank.
      el.setAttribute('dir', 'rtl');
      el.setAttribute('lang', 'ar');
      el.classList.add('qu-ar-only');
    }
    el.dataset.quSplit = '1';
  }

  /* Search results and breadcrumbs already contain markup — Cascade wraps the
     matched substring in <strong>. Splitting would destroy it, so trim the
     Arabic tail in place instead: cut the first node that starts Arabic, drop
     the rest, leave everything before it untouched. */
  function stripArabicTail(el) {
    if (!el || SHOW_ARABIC || el.dataset.quArTrimmed) return;
    el.dataset.quArTrimmed = '1';
    const kids = Array.prototype.slice.call(el.childNodes);
    let cutting = false;
    for (const node of kids) {
      if (cutting) {
        node.remove();
        continue;
      }
      const text = node.textContent || '';
      const i = text.search(ARABIC);
      if (i === -1) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        const head = text.slice(0, i).replace(/[\s\-–—_:|/\\،,]+$/, '');
        if (head.trim()) node.nodeValue = head;
        else node.remove();
      } else {
        node.remove();
      }
      cutting = true;
    }
  }

  function stampAuth() {
    // Banner marks the public landing three different ways depending on how far
    // Cascade's rebuild has got: a Sign In control in the global nav before it,
    // .anonymous inside .pagebodydiv after it, and on ?name=homepage the class
    // on #pagebody itself. Miss the third and the stamp flaps between anon and
    // auth from load to load.
    const anon = !!document.querySelector(
      '#globalNav .signIn, .pagebodydiv .anonymous, #pagebody.anonymous'
    );
    root.classList.toggle('qu-anon', anon);
    root.classList.toggle('qu-auth', !anon);
  }

  /* --- Header: the co-branded lockup and the theme switcher, the only chrome
     the extension owns. The QU mark stays first and never smaller than the ACM
     mark — this is attribution, not co-ownership. --- */

  function buildLockup() {
    const header = document.getElementById('header');
    if (!header || header.querySelector('.qu-lockup-acm')) return;
    const brand = header.querySelector('.institutionalBranding');
    if (!brand) return;

    const wrap = document.createElement('span');
    wrap.className = 'qu-lockup-acm';

    const divider = document.createElement('span');
    divider.className = 'qu-lockup-divider';
    divider.setAttribute('aria-hidden', 'true');

    const mark = document.createElement('span');
    mark.className = 'qu-lockup-mark';
    mark.setAttribute('aria-hidden', 'true');

    const word = document.createElement('span');
    word.className = 'qu-lockup-word';
    word.textContent = 'Redesign';

    wrap.appendChild(divider);
    wrap.appendChild(mark);
    wrap.appendChild(word);
    brand.after(wrap);
  }

  let switcher = null;

  function segButton(attr, value, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qu-seg-btn';
    b.dataset[attr] = value;
    b.textContent = label;
    return b;
  }

  function buildSwitcher() {
    const nav = document.querySelector('#globalNav ul');
    if (!nav || document.getElementById('qu-switch')) return;

    const li = document.createElement('li');
    li.id = 'qu-switch';
    li.className = 'qu-switch';

    const themeSeg = document.createElement('span');
    themeSeg.className = 'qu-seg';
    themeSeg.setAttribute('role', 'group');
    themeSeg.setAttribute('aria-label', 'Theme');
    themeSeg.appendChild(segButton('quTheme', 'qu', 'QU'));
    themeSeg.appendChild(segButton('quTheme', 'acm', 'ACM'));


    const offBtn = document.createElement('button');
    offBtn.type = 'button';
    offBtn.className = 'qu-off-btn';
    offBtn.dataset.quOff = '';
    offBtn.title = 'Turn the redesign off for this site';
    offBtn.setAttribute('aria-label', offBtn.title);

    const modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = 'qu-mode-btn';
    modeBtn.dataset.quMode = '';
    modeBtn.setAttribute('aria-label', 'Change appearance');

    li.appendChild(themeSeg);
    li.appendChild(modeBtn);
    li.appendChild(offBtn);
    nav.appendChild(li); // sits after Sign Out | Help
    switcher = li;

    li.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.quTheme) savePrefs({ theme: btn.dataset.quTheme });
      else if ('quOff' in btn.dataset) {
        // Undoing the moved nodes in place is not worth the risk; a reload
        // re-runs this script, which then leaves the page untouched.
        savePrefs({ enabled: false });
        location.reload();
      } else if ('quMode' in btn.dataset) {
        // Reads the resolved appearance rather than the stored preference, so
        // the first click out of 'auto' always flips what is actually on screen.
        const isDark = String(root.dataset.qux || '').endsWith('-dark');
        savePrefs({ mode: isDark ? 'light' : 'dark' });
      }
    });

    syncSwitcher();
  }

  function syncSwitcher() {
    const li = switcher || document.getElementById('qu-switch');
    if (!li) return;
    li.querySelectorAll('[data-qu-theme]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.quTheme === prefs.theme));
    });
    const mode = li.querySelector('[data-qu-mode]');
    if (mode) {
      const isDark = String(root.dataset.qux || '').endsWith('-dark');
      mode.dataset.quModeValue = prefs.mode;
      mode.title = isDark ? 'Switch to light appearance' : 'Switch to dark appearance';
      mode.setAttribute('aria-label', mode.title);
    }
  }

  /* --- The page head row. The welcome, the breadcrumb and the search are
     siblings with no common wrapper, and #search is position:fixed so it
     floats over the content. This supplies the wrapper the layout needs.
     Moving a node preserves its listeners, so the autocomplete bound to
     input.searchInput keeps working. --- */

  function buildHeadRow() {
    const isLeaf = root.classList.contains('qu-leaf');

    // Cascade rebuilds the page around the server markup: .pagebodydiv starts
    // as a direct child of <body> and ends up inside #content > #bodyContainer,
    // with #pageheader appearing alongside it. Anything anchored to the early
    // DOM is stranded at the end of <body> — which is how the heading and the
    // identity block first turned up under the footer. So prefer #pageheader
    // and re-home the rows every pass; moving a node keeps its listeners.
    const bodyDiv = document.querySelector('.pagebodydiv');
    const head =
      document.getElementById('pageheader') ||
      document.getElementById('content') ||
      (bodyDiv && bodyDiv.parentElement);
    if (!head) return null;

    let row = document.querySelector('.qu-headrow');
    if (!row) {
      row = document.createElement('div');
      row.className = 'qu-headrow';
      const left = document.createElement('div');
      left.className = 'qu-headleft';
      row.appendChild(left);
    }
    if (row.parentElement !== head) {
      const inner = head.querySelector(':scope > .pagebodydiv');
      if (inner) head.insertBefore(row, inner);
      else head.prepend(row);
    }

    // trim the crumb labels first — the page heading is derived from them
    document
      .querySelectorAll('.breadCrumb a, .crumbs a, .crumbs .lastValue')
      .forEach(stripArabicTail);

    const left = row.querySelector('.qu-headleft');
    const welcome = document.getElementById('welcomemessage');
    const crumb = document.getElementById('crumb');
    const search = document.getElementById('search');

    if (welcome && welcome.parentElement !== left) left.appendChild(welcome);
    splitWelcome();
    const serverCrumbs = document.querySelector('.crumbs');
    const crumbBar = crumb || serverCrumbs;
    if (crumbBar && crumbBar.parentElement !== left) left.appendChild(crumbBar);
    // Cascade's #crumb and the server's .crumbs say the same thing; showing
    // both gives the page two breadcrumb bars.
    if (crumb && serverCrumbs && serverCrumbs !== crumb) {
      serverCrumbs.dataset.quCrumbDupe = '1';
    }
    if (search && search.parentElement !== row) row.appendChild(search);

    if (isLeaf) buildLeafTitleRow(head, row);
    else buildPageTitle();
    return row;
  }

  /* Leaf pages put the heading and the identity block on their own row under
     the crumb. .staticheaders carries only the identity — ID, name, timestamp
     — so the heading has to come from the breadcrumb. document.title is no
     use: three menus ship an empty title and one says "DEFAULT". */
  function buildLeafTitleRow(head, headRow) {
    let titleRow = document.querySelector('.qu-titlerow');
    if (!titleRow) {
      titleRow = document.createElement('div');
      titleRow.className = 'qu-titlerow';
      titleRow.appendChild(document.createElement('div')).className = 'qu-pagetitle';
    }
    // Same re-homing rule as the head row: it always sits directly after it,
    // wherever Cascade has since moved that.
    if (titleRow.previousElementSibling !== headRow) headRow.after(titleRow);
    // Result views carry more than one .staticheaders (the server's and the
    // one Cascade writes after the POST), which rendered the identity twice.
    // The first is kept and re-homed; the rest are hidden, never removed.
    const identities = document.querySelectorAll('.staticheaders');
    const identity = identities[0];
    for (let i = 1; i < identities.length; i++) {
      identities[i].dataset.quIdentityDupe = '1';
    }
    if (identity) {
      delete identity.dataset.quIdentityDupe;
      if (identity.parentElement !== titleRow) titleRow.appendChild(identity);
      splitIdentity(identity);
    }

    const title = titleRow.querySelector('.qu-pagetitle');
    const selected = document.querySelector('.breadCrumb a.selected, .crumbs .lastValue');
    const label = selected ? selected.textContent.replace(/\s+/g, ' ').trim() : '';
    if (!label || title.dataset.quText === label) return;
    title.dataset.quText = label;
    title.textContent = label;
    delete title.dataset.quSplit;
    splitBilingual(title);
  }

  /* "######### STUDENT NAME<br>Aug 21, 2026 07:30 pm" — one node, two facts.
     Split so the ID can be mono and the timestamp can step down. The values
     are re-wrapped and nothing else; never read, stored or sent. */
  function splitIdentity(el) {
    if (el.dataset.quIdentity) return;
    el.dataset.quIdentity = '1';
    const lines = el.innerHTML
      .split(/<br\s*\/?>/i)
      .map((s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!lines.length) return;

    el.textContent = '';
    const who = document.createElement('span');
    who.className = 'qu-identity-who';
    const m = /^(\S+)\s+(.*)$/.exec(lines[0]);
    if (m && /[\d#]/.test(m[1])) {
      const id = document.createElement('span');
      id.className = 'qu-identity-id';
      id.textContent = m[1];
      who.appendChild(id);
      who.appendChild(document.createTextNode(' · ' + m[2]));
    } else {
      who.textContent = lines[0];
    }
    el.appendChild(who);

    if (lines[1]) {
      const when = document.createElement('span');
      when.className = 'qu-identity-when';
      when.textContent = lines[1];
      el.appendChild(when);
    }
  }

  /* The server sends one string: "Welcome, <name>, to myBanner Self Service".
     The greeting becomes the page title and the tail a subtitle — the same
     words, laid out differently. */
  function splitWelcome() {
    const el = document.getElementById('welcomemessage');
    if (!el || el.dataset.quWelcome) return;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const m = /^(Welcome,\s*)(.+?),\s*(to\s+.+)$/i.exec(text);
    el.dataset.quWelcome = '1';
    if (!m) return;

    el.textContent = m[1];
    const name = document.createElement('span');
    name.className = 'qu-name';
    name.textContent = m[2];
    el.appendChild(name);
    el.appendChild(document.createTextNode(','));

    const sub = document.createElement('div');
    sub.className = 'qu-subtitle';
    sub.textContent = m[3];
    el.after(sub);
  }

  /* Drilled menus have no welcome of their own, so the title is the current
     menu's name, which the breadcrumb already holds. The order down the page
     is crumb → title → cards, so the title cannot sit in the head row beside
     the crumb; it goes into #pagebody instead. */
  function buildPageTitle() {
    const atHome = root.classList.contains('qu-home');
    const pagebody = document.getElementById('pagebody');
    let row = document.querySelector('#pagebody > .qu-titlerow');
    const selected = document.querySelector('#crumb .breadCrumb a.selected');

    if (atHome || !selected || !pagebody) {
      if (row) row.remove();
      return;
    }

    if (!row) {
      row = document.createElement('div');
      row.className = 'qu-titlerow';
      const t = document.createElement('div');
      t.className = 'qu-pagetitle';
      row.appendChild(t);
    }
    const anchor =
      pagebody.querySelector(':scope > #contentHolder') ||
      pagebody.querySelector(':scope > #contentBelt');
    if (anchor && row.nextElementSibling !== anchor) pagebody.insertBefore(row, anchor);
    else if (!anchor && row.parentElement !== pagebody) pagebody.appendChild(row);

    const title = row.querySelector('.qu-pagetitle');
    const label = selected.textContent.replace(/\s+/g, ' ').trim();
    if (!label || title.dataset.quText === label) return;
    title.dataset.quText = label;
    title.textContent = label;
    delete title.dataset.quSplit;
    splitBilingual(title);
  }

  /* The footer attribution — extension-owned, and the only place the ACM
     wordmark appears outside the header lockup. */
  function buildFooter() {
    const foot = document.getElementById('pagefooter');
    if (!foot || foot.querySelector('.qu-attrib')) return;
    const wrap = document.createElement('span');
    wrap.className = 'qu-attrib';
    const text = document.createElement('span');
    text.className = 'qu-attrib-text';
    text.textContent = 'Restyled by';
    const mark = document.createElement('span');
    mark.className = 'qu-attrib-mark';
    mark.textContent = '<ACM.QU />';
    wrap.appendChild(text);
    wrap.appendChild(mark);
    foot.appendChild(wrap);
  }

  /* --- Extension-owned notices, used only where there is nothing of QU's
     left to restyle. --- */

  const HOME = '/PROD/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu';

  function notice(icon, title, body, action) {
    const el = document.createElement('div');
    el.className = 'qu-notice';
    el.setAttribute('role', 'status');

    const ic = document.createElement('span');
    ic.className = 'qu-notice-icon';
    ic.style.setProperty('--qu-icon', 'url("' + url('assets/icons/' + icon + '.svg') + '")');

    const text = document.createElement('div');
    text.className = 'qu-notice-text';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    text.appendChild(h);
    text.appendChild(p);

    if (action) {
      const a = document.createElement('a');
      a.className = 'qu-notice-action';
      a.href = action.href;
      a.textContent = action.label;
      text.appendChild(a);
    }

    el.appendChild(ic);
    el.appendChild(text);
    return el;
  }

  // A direct GET of some procedures returns an Oracle ORDS 500 page with none
  // of the Banner chrome. Detect it and replace it outright.
  function handleOrdsError() {
    if (!document.querySelector('.oj-web-applayout-page, .ords-logo')) return false;
    root.classList.add('qu-ords');
    const body = document.body;
    if (!body || body.dataset.quReplaced) return true;
    body.dataset.quReplaced = '1';
    body.textContent = '';
    body.appendChild(
      notice(
        'alert-circle',
        'This page could not be opened',
        'The server returned an error instead of the page. This happens when an address is opened directly rather than reached from a menu. Please return to the Main Menu and follow the links from there.',
        { href: HOME, label: 'Go to Main Menu' }
      )
    );
    return true;
  }

  // bwsktest.P_Orientation renders no tables and no text at all.
  function handleBlankPage() {
    if (!root.classList.contains('qu-leaf')) return;
    const body = document.querySelector('.pagebodydiv');
    if (!body || body.dataset.quBlank) return;
    const hasText = body.textContent.replace(/\s+/g, '').length > 0;
    const hasNodes = !!body.querySelector('table, input, select, button, img, a');
    if (hasText || hasNodes) return;
    body.dataset.quBlank = '1';
    body.appendChild(
      notice(
        'info-circle',
        'There is nothing to show on this page',
        'The University has not published any content here yet. Please check back later, or return to the Main Menu.',
        { href: HOME, label: 'Go to Main Menu' }
      )
    );
  }

  /* --- Search overlay. Cascade renders duplicates, ungrouped, in a ~330px
     scroll box. Every anchor it built is kept — the click handler is the
     navigation — and only exact repeats of target + label are hidden. --- */

  function enhanceSearch(overlay) {
    const list = overlay.querySelector('ul');
    if (!list) return;
    const fingerprint = list.children.length + ':' + list.textContent.length;
    if (overlay.dataset.quPass === fingerprint) return;

    const seen = new Set();
    list.querySelectorAll(':scope > li').forEach((li) => {
      const a = li.querySelector('a');
      if (!a) {
        return;
      }
      const key =
        (a.getAttribute('title') || '') + '|' + a.textContent.replace(/\s+/g, ' ').trim();
      if (seen.has(key)) {
        li.classList.add('qu-dupe'); // hidden by CSS; node kept intact
        return;
      }
      seen.add(key);
      li.classList.remove('qu-dupe');
      // Trim rather than split: Cascade's <strong> around the match must live.
      stripArabicTail(a);
    });

    const shown = list.querySelectorAll(':scope > li:not(.qu-dupe)').length;
    const count = overlay.querySelector('.findPageOverlay_count');
    if (count) count.setAttribute('data-qu-shown', String(shown));
    overlay.dataset.quPass = fingerprint;
  }

  /* --- The anonymous landing page. A photograph and an icon chip per public
     link, both keyed off the label the server sends, so a link that stops
     being sent simply loses its art rather than breaking the page. --- */
  const LANDING_ART = [
    { re: /secure area/i, img: 'students-reading', icon: 'lock', primary: true },
    { re: /admission/i, img: 'campus-building', icon: 'file-text' },
    { re: /password|forget user/i, img: 'lockers', icon: 'help' },
    { re: /class schedule/i, img: 'classroom', icon: 'calendar-plus' },
    { re: /course catalog/i, img: 'textbooks', icon: 'checklist' },
    { re: /delegation|proxy/i, img: 'students-group', icon: 'user-check' },
  ];

  function enhanceAnonymous() {
    if (!root.classList.contains('qu-anon') || !document.body) return;

    // The server prints raw HTTP headers — Set-Cookie: SESSID among them — as
    // visible body text on this page. Remove the node; never read it.
    if (!document.body.dataset.quLeak) {
      document.body.dataset.quLeak = '1';
      Array.prototype.slice.call(document.body.childNodes).forEach((node) => {
        if (
          node.nodeType === Node.TEXT_NODE &&
          /Set-Cookie|SESSID|HTTP\/1\./i.test(node.nodeValue || '')
        ) {
          node.remove(); // discarded, never copied anywhere
        }
      });
    }

    // The six public links sit inside a display:none .pagebodydiv while the
    // page renders blank — blank on QU's own site too, with the extension off.
    // They cannot go in #contentHolder: on ?name=homepage Banner hides that as
    // well, so the cards were built correctly and parked out of sight.
    const host =
      document.getElementById('pagebody') || document.getElementById('contentHolder');
    if (!host || document.querySelector('.qu-public')) return;
    const cells = document.querySelectorAll('table.menuplaintable td.mpdefault');
    if (!cells.length) return;

    const heading = document.createElement('div');
    heading.className = 'qu-public-heading';
    heading.textContent = 'myBanner Self Service';

    const grid = document.createElement('div');
    grid.className = 'qu-public';

    cells.forEach((td) => {
      const a = td.querySelector('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const desc = td.querySelector('span.menulinkdesctext');

      const card = document.createElement('a');
      card.className = 'qu-public-card';
      card.href = href;
      if (/^https?:/i.test(href) && href.indexOf('mybanner.qu.edu.qa') === -1) {
        card.dataset.quExternal = '1';
      }

      const label = a.textContent.trim();

      const art = LANDING_ART.find((k) => k.re.test(label));
      if (art) {
        const img = document.createElement('img');
        img.className = 'qu-public-shot';
        img.src = url('assets/qu-landing/' + art.img + '.png');
        img.alt = '';
        card.appendChild(img);
        if (art.primary) card.dataset.quPrimary = '1';
      }

      const body = document.createElement('span');
      body.className = 'qu-public-body';

      const head = document.createElement('span');
      head.className = 'qu-public-head';
      const chip = document.createElement('span');
      chip.className = 'qu-public-chip';
      chip.style.setProperty(
        '--qu-icon',
        'url("' + url('assets/icons/' + ((art && art.icon) || 'file-text') + '.svg') + '")'
      );

      const title = document.createElement('span');
      title.className = 'qu-public-title';
      title.textContent = label;

      const p = document.createElement('span');
      p.className = 'qu-public-desc';
      p.textContent = desc ? desc.textContent.trim() : '';

      head.appendChild(chip);
      head.appendChild(title);
      body.appendChild(head);
      body.appendChild(p);
      card.appendChild(body);
      splitBilingual(title);
      grid.appendChild(card);
    });

    if (!grid.children.length) return;
    host.appendChild(heading);
    host.appendChild(grid);
  }

  /* --- Account balance. It arrives as an ordinary key/value row, but it is
     the one figure a student came to the page for, so it is lifted out into a
     pill beside the tab strip. Found by its label and never by matching a
     value: the amount is the student's own data. --- */

  function buildBalancePill() {
    const body = document.querySelector('.pagebodydiv');
    if (!body) return;
    const label = Array.prototype.find.call(
      body.querySelectorAll('th.ddlabel, td.ddlabel, td.dddefault'),
      (c) => /^\s*Account Balance\s*:?\s*$/i.test(c.textContent)
    );
    if (!label || label.dataset.quBalance) return;

    const row = label.closest('tr');
    if (!row) return;
    const value = Array.prototype.map
      .call(row.cells, (c) => c.textContent.replace(/\s+/g, ' ').trim())
      .filter((t) => t && !/Account Balance/i.test(t))[0];
    if (!value) return;
    label.dataset.quBalance = '1';

    const pill = document.createElement('span');
    pill.className = 'qu-balance';
    const l = document.createElement('span');
    l.className = 'qu-balance-label';
    l.textContent = 'Account Balance:';
    const v = document.createElement('span');
    v.className = 'qu-balance-value';
    v.textContent = value;
    pill.appendChild(l);
    pill.appendChild(v);

    // Beside the tabs where there are tabs; otherwise in place of the row.
    const tab = Array.prototype.find.call(
      document.querySelectorAll('td.bgtabon, td.bgtaboff'),
      (c) => c.textContent.trim()
    );
    const tabRow = tab && tab.closest('tr');
    const caption = row.closest('table') && row.closest('table').querySelector('caption.captiontext');
    if (tabRow) {
      tabRow.cells[tabRow.cells.length - 1].appendChild(pill);
      row.dataset.quBalanceMoved = '1';
    } else if (caption) {
      // A <caption> shrink-wraps whatever display it is given, so it will not
      // span the table. Build a real header band above it instead and retire
      // the caption: label at one end, pill at the other.
      const table = caption.closest('table');
      let head = table.previousElementSibling;
      if (!head || !head.classList || !head.classList.contains('qu-section-head')) {
        head = document.createElement('div');
        head.className = 'qu-section-head';
        const label = document.createElement('span');
        label.className = 'qu-caption-label';
        label.textContent = caption.textContent.replace(/\s+/g, ' ').trim();
        head.appendChild(label);
        table.parentElement.insertBefore(head, table);
        caption.dataset.quCaptionMoved = '1';
      }
      head.appendChild(pill);
      row.dataset.quBalanceMoved = '1';
    } else {
      const cell = row.querySelector('td.dddefault') || label;
      cell.textContent = '';
      cell.appendChild(pill);
    }

    // With the figure in the pill, the same row in the totals block is a
    // duplicate; only Charges and Credits and Payments belong there.
    document.querySelectorAll('tr[data-qu-total]').forEach((r) => {
      if (r.cells[0] && /^\s*Account Balance\s*:?\s*$/i.test(r.cells[0].textContent)) {
        r.dataset.quBalanceMoved = '1';
      }
    });
  }

  /* --- Table shaping. Three things the markup does not say outright: a
     numeric column end-aligns its header along with its cells; the summary
     rows at the foot of a table are a totals block, not more data; and a small
     two-column table of figures reads as stat tiles, not a list. --- */

  const MONEY = /^[A-Za-z]{0,3}\s?-?[\d,]+(\.\d+)?$|^-?[\d,]+(\.\d+)?%?$/;
  const TOTAL_LABEL = /^\s*(Charges|Credits and Payments|Account Balance|Total|Overall|Sub ?total)\b/i;

  function shapeTables() {
    document.querySelectorAll('table.datadisplaytable:not([data-qu-shaped])').forEach((table) => {
      table.dataset.quShaped = '1';
      const rows = Array.prototype.slice.call(table.rows);

      // --- numeric columns: align the header to its figures
      const headerRow = rows.filter((r) => r.querySelector('th.ddheader'))[0];
      if (headerRow) {
        const bodyRows = rows.filter(
          (r) => !r.querySelector('th.ddheader') && r.querySelector('td.dddefault')
        );
        Array.prototype.forEach.call(headerRow.cells, (th, i) => {
          const column = bodyRows
            .map((r) => r.cells[i])
            .filter(Boolean)
            .map((c) => c.textContent.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          if (column.length < 2) return;
          const numeric = column.filter((t) => MONEY.test(t)).length;
          if (numeric / column.length < 0.6) return;
          th.dataset.quNum = '1';
          bodyRows.forEach((r) => {
            if (r.cells[i]) r.cells[i].dataset.quNum = '1';
          });
        });
      }

      // --- the totals block at the foot of a summary table
      let firstTotal = null;
      rows.forEach((r) => {
        const label = r.cells[0];
        if (!label || !TOTAL_LABEL.test(label.textContent)) return;
        // only once the data has started — a leading balance row is a figure,
        // not a total, and is lifted into the pill instead
        if (!r.previousElementSibling) return;
        r.dataset.quTotal = '1';
        if (!firstTotal) firstTotal = r;
      });
      if (firstTotal) firstTotal.dataset.quTotalFirst = '1';

      // --- a small all-numeric two-column table is a stat row
      const hasHeader = !!table.querySelector('th.ddheader');
      const body = rows.filter((r) => r.cells.length === 2);
      if (
        !hasHeader &&
        body.length === rows.length &&
        rows.length >= 2 &&
        rows.length <= 4 &&
        rows.every((r) => MONEY.test(r.cells[1].textContent.replace(/\s+/g, ' ').trim()))
      ) {
        table.dataset.quStats = String(rows.length);
      }
    });

    // The GPA calculator opens with a "Note:" table of *** lines, which reads
    // better as one warning banner than as a table of red rows.
    document.querySelectorAll('table.datadisplaytable:not([data-qu-note])').forEach((table) => {
      const cap = table.querySelector('caption');
      if (!cap || !/^\s*Note\s*:?\s*$/i.test(cap.textContent)) return;
      table.dataset.quNote = '1';
    });

    // Banner emits <caption class="captiontext"> even when it has nothing to
    // say. An empty caption still reserves a row and still draws the section
    // rule, so pages like Update Mobile Number opened with a bare underline
    // floating above the card. Tag the empties; the sheet retires them.
    document.querySelectorAll('caption.captiontext').forEach((cap) => {
      if (!cap.textContent.replace(/\s+/g, '').length) cap.dataset.quCaptionEmpty = '1';
      else delete cap.dataset.quCaptionEmpty;
    });
  }

  /* --- Message states. .warningtext and .errortext do double duty in Banner:
     feedback about something just done, and "there is nothing here". The first
     stays a banner, the second becomes a centred empty state, and the page
     tells them apart — an empty state has no data and no controls beside it. --- */

  function classifyMessages() {
    const body = document.querySelector('.pagebodydiv');
    if (!body || body.dataset.quMsgs) return;
    const msgs = body.querySelectorAll('.warningtext, .errortext');
    if (!msgs.length) return;
    body.dataset.quMsgs = '1';

    const hasContent = !!body.querySelector(
      'table.datadisplaytable td.dddefault, table.dataentrytable,' +
        ' input:not([type="hidden"]), select, textarea, button'
    );
    if (hasContent) return; // real feedback — the banner treatment is right

    body.dataset.quEmpty = '1';
    // A page usually ships the English and Arabic halves as two separate
    // messages. They are one empty state, so only the first carries the chip.
    msgs.forEach((m, i) => {
      m.dataset.quState = i === 0 ? 'empty' : 'empty-more';
    });
  }

  /* --- Academic Transcript: the densest page in the portal, and the one
     students actually print. 123 rows in a single table.datadisplaytable, with
     no sectioning beyond th.ddtitle and a repeated "Web Transcript" watermark
     row. The rows are regular enough to classify in place, so the table itself
     is left alone and the only new DOM is the section rail beside it. --- */

  const STANDING_RE = /^(College|Major|Student Type|Academic Standing|Additional Standing|Additional Major|Minor|Concentration):/i;

  function classifyTranscriptRows(table) {
    const sections = [];
    let n = 0;
    // "College:" and "Minor:" appear both in a term header and in the
    // Student Information block, so the meta styling is scoped to the run of
    // rows between a Term: row and that term's column header.
    let inTermHeader = false;
    let termIndex = 0;
    let sectionSlug = '';

    Array.prototype.forEach.call(table.rows, (tr) => {
      if (tr.dataset.quRow) return;
      if (sectionSlug) tr.dataset.quSection = sectionSlug;
      const text = tr.textContent.replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
      const title = tr.querySelector('th.ddtitle');

      if (title) {
        const label = title.textContent
          .replace(/\s+/g, ' ')
          .replace(/ /g, ' ')
          .replace(/-\s*Top\s*-/i, '')
          .trim();
        if (/^Term Totals/i.test(label)) {
          tr.dataset.quRow = 'totals-title';
          if (termIndex) tr.dataset.quTerm = String(termIndex);
          return;
        }
        tr.dataset.quRow = 'section';
        sectionSlug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        tr.dataset.quSection = sectionSlug;
        inTermHeader = false;
        if (!tr.id) tr.id = 'qu-sec-' + ++n;
        sections.push({ id: tr.id, label: label, level: 1 });
        return;
      }

      if (/^Term:/i.test(text)) {
        termIndex++;
        tr.dataset.quRow = 'term';
        tr.dataset.quTerm = String(termIndex);
        inTermHeader = true;
        if (!tr.id) tr.id = 'qu-sec-' + ++n;
        sections.push({ id: tr.id, label: text.replace(/^Term:\s*/i, '').trim(), level: 2 });
        return;
      }

      if (inTermHeader && STANDING_RE.test(text)) {
        tr.dataset.quRow = 'meta';
        if (termIndex) tr.dataset.quTerm = String(termIndex);
        // "Academic Standing: Good Standing" / "Additional Standing: Dean's List"
        if (/Standing:/i.test(text)) {
          const cell = tr.querySelector('td.dddefault');
          const value = cell && cell.textContent.trim();
          // The badge goes on a span inside the cell: styling the <td> itself
          // as an inline-block takes it out of the table's column model.
          if (value && !cell.querySelector('.qu-badge')) {
            const badge = document.createElement('span');
            badge.className = 'qu-badge';
            const key = (tr.cells[0] ? tr.cells[0].textContent : '').trim();
            badge.dataset.quBadge = /Probation|Warning|Suspend|Dismiss/i.test(value)
              ? 'warn'
              : /^Additional/i.test(key)
                ? 'honor'
                : 'ok';
            badge.textContent = value;
            cell.textContent = '';
            cell.appendChild(badge);
          }
        }
        return;
      }

      if (tr.querySelector('th.ddheader')) {
        const first = tr.cells[0];
        const isCourseHeader = first && first.classList.contains('ddheader');
        tr.dataset.quRow = isCourseHeader ? 'header' : 'totals-header';
        if (termIndex) tr.dataset.quTerm = String(termIndex);
        inTermHeader = false;
        return;
      }
      if (/^Web Transcript$/i.test(text)) {
        // Hidden on screen, restored as the print footer.
        tr.dataset.quRow = 'watermark';
        return;
      }
      if (!text) {
        tr.dataset.quRow = 'spacer';
        return;
      }
      if (/^(Current Term|Cumulative|Total|Overall)\b/i.test(text)) {
        tr.dataset.quRow = 'totals';
        if (termIndex) tr.dataset.quTerm = String(termIndex);
        return;
      }
      tr.dataset.quRow = tr.querySelector('th.ddlabel') ? 'kv' : 'data';
      if (termIndex) tr.dataset.quTerm = String(termIndex);
    });

    return sections;
  }

  /* A term's context arrives as five stacked label/value rows — College,
     Major, Student Type and the two standings. They read better as one line
     beside the term name with the standings as badges at the end. The rows
     carry no handlers, so folding their text into the header row is safe. */
  function foldTermHeaders(table) {
    const terms = {};
    table.querySelectorAll('tr[data-qu-term]').forEach((tr) => {
      (terms[tr.dataset.quTerm] = terms[tr.dataset.quTerm] || []).push(tr);
    });

    Object.keys(terms).forEach((key) => {
      const rows = terms[key];
      const head = rows.filter((r) => r.dataset.quRow === 'term')[0];
      if (!head || head.dataset.quTermFolded) return;
      const cell = head.querySelector('td.dddefault') || head.querySelector('th.ddlabel');
      if (!cell) return;
      head.dataset.quTermFolded = '1';

      const bits = [];
      const badges = [];
      rows
        .filter((r) => r.dataset.quRow === 'meta')
        .forEach((r) => {
          const value = r.querySelector('td.dddefault');
          if (!value) return;
          const badge = value.querySelector('.qu-badge');
          if (badge) badges.push(badge);
          else {
            const t = value.textContent.replace(/\s+/g, ' ').trim();
            if (t) bits.push(t);
          }
          r.dataset.quMetaFolded = '1';
        });

      if (bits.length) {
        const meta = document.createElement('span');
        meta.className = 'qu-term-meta';
        meta.textContent = bits.join(' · ');
        cell.appendChild(meta);
      }
      if (badges.length) {
        const holder = document.createElement('span');
        holder.className = 'qu-term-badges';
        badges.forEach((b) => holder.appendChild(b));
        cell.appendChild(holder);
      }

      // The header cell holds one column by default, so the folded line would
      // wrap inside it. Span the table and drop the now-empty siblings.
      const cols = Math.max.apply(
        null,
        Array.prototype.map.call(table.rows, (r) =>
          Array.prototype.reduce.call(r.cells, (n, c) => n + (c.colSpan || 1), 0)
        )
      );
      if (cols > 1) cell.colSpan = cols;
      Array.prototype.slice.call(head.cells).forEach((c) => {
        if (c !== cell) c.dataset.quSpanned = '1';
      });

      // The cell itself must stay a table-cell for colspan to mean anything,
      // so the flex row lives in a wrapper inside it.
      const wrap = document.createElement('span');
      wrap.className = 'qu-term-head';
      while (cell.firstChild) wrap.appendChild(cell.firstChild);
      cell.appendChild(wrap);
    });
  }

  function buildTranscriptRail(table, sections) {
    const body = table.closest('.pagebodydiv') || table.parentElement;
    if (!body || body.querySelector(':scope > .qu-rail')) return;

    const rail = document.createElement('nav');
    rail.className = 'qu-rail';
    rail.setAttribute('aria-label', 'On this page');

    const heading = document.createElement('div');
    heading.className = 'qu-rail-title';
    heading.textContent = 'On this page';
    rail.appendChild(heading);

    sections.forEach((s) => {
      const a = document.createElement('a');
      a.className = 'qu-rail-link';
      a.dataset.quLevel = String(s.level);
      a.href = '#' + s.id;
      a.textContent = s.label;
      rail.appendChild(a);
    });

    const print = document.createElement('button');
    print.type = 'button';
    print.className = 'qu-print';
    print.textContent = 'Print transcript';
    print.addEventListener('click', () => window.print());
    rail.appendChild(print);

    const note = document.createElement('span');
    note.className = 'qu-rail-note';
    note.textContent =
      "Rail is the redesign's rendering of the server's \"-Top-\" anchor links.";
    rail.appendChild(note);

    // Wrap the existing content so the rail sits beside one column rather than
    // spanning a grid whose rows it would stretch.
    const main = document.createElement('div');
    main.className = 'qu-transcript-main';
    while (body.firstChild) main.appendChild(body.firstChild);
    body.appendChild(main);
    body.prepend(rail);
    body.classList.add('qu-has-rail');

    // The rail is this redesign's rendering of the server's own "-Top-"
    // anchor links, so the originals become duplicates.
    const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    main.querySelectorAll('a[href^="#"]').forEach((a) => {
      const label = norm(a.textContent);
      if (!label) return;
      const matches = sections.some(
        (s) => norm(s.label).indexOf(label) === 0 || label.indexOf(norm(s.label)) === 0
      );
      // "-Top-" back-links sit inside the section headings themselves.
      if (matches || a.closest('th.ddtitle') || label === 'top') {
        a.dataset.quAnchorDupe = '1';
      }
    });
  }

  function enhanceTranscript() {
    const table = Array.prototype.find.call(
      document.querySelectorAll('table.datadisplaytable'),
      (t) =>
        Array.prototype.some.call(t.querySelectorAll('th.ddtitle'), (th) =>
          /INSTITUTION CREDIT|TRANSCRIPT TOTALS|COURSES IN PROGRESS/i.test(th.textContent)
        )
    );
    if (!table) return;
    root.classList.add('qu-transcript');
    if (table.dataset.quTranscript) return;
    table.dataset.quTranscript = '1';
    const sections = classifyTranscriptRows(table);
    foldTermHeaders(table);
    groupPreambleCards(table);
    buildTranscriptRail(table, sections);
  }

  /* --- The transcript preamble. Everything before the first term — STUDENT
     INFORMATION and Curriculum Information — is key/value pairs that should
     read as a two-up card. Floated half-width rows gave a rule down the middle,
     ragged right edges and a hole wherever a section had an odd number of
     pairs; a grid needs a container, and these rows have none. So each section
     gets its own <tbody>: the same nodes, regrouped, on static report output
     with nothing bound to it. --- */

  function groupPreambleCards(table) {
    if (table.dataset.quPreamble) return;
    table.dataset.quPreamble = '1';

    const rows = Array.prototype.slice.call(table.rows);
    const firstTerm = rows.findIndex((r) => r.dataset.quTerm);
    const preamble = firstTerm === -1 ? rows : rows.slice(0, firstTerm);
    if (!preamble.length) return;

    // The preamble is the top of the table, so its cards go in front of the
    // body that holds it. A <tbody> may not nest inside another one.
    const host = preamble[0].parentNode;
    if (!host || host.tagName !== 'TBODY') return;

    // Which sections are actually cards? One that turns out to be only a
    // heading — INSTITUTION CREDIT — is a signpost above the term cards, so
    // decide up front and never move its row at all.
    const isCard = Object.create(null);
    preamble.forEach((row) => {
      const sec = row.dataset.quSection;
      const role = row.dataset.quRow;
      if (sec && (role === 'kv' || role === 'data')) isCard[sec] = true;
    });

    // One card per section, not per run: Banner sprinkles spacer rows through
    // Curriculum Information, which would otherwise cut it into three cards.
    const groups = Object.create(null);
    preamble.forEach((row) => {
      const sec = row.dataset.quSection;
      if (!sec || !isCard[sec] || row.dataset.quRow === 'spacer') return;
      if (!groups[sec]) {
        const g = document.createElement('tbody');
        g.dataset.quCard = sec;
        table.insertBefore(g, host);
        groups[sec] = g;
      }
      groups[sec].appendChild(row);
      // A pair with one cell is a sub-heading, not a key/value row; its value
      // arrives as the full-width row after it. Both span the card.
      if (row.dataset.quRow === 'kv' && row.cells.length < 2) {
        row.dataset.quSubhead = '1';
      }
    });
  }

  /* --- The enhancement pass. Runs on every mutation, so every branch below
     has to be a no-op the second time round. The check for that is that
     querySelectorAll('[data-qu]').length stops growing. --- */

  function enhance() {
    if (disabled) return;
    if (handleOrdsError()) {
      reveal();
      return;
    }
    stampAuth();

    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));

    // "Am I on the home grid?" has to be answered from the DOM. Cascade writes
    // a pageName into the hash even for Home, so testing the hash blanks the
    // page on the way back. Home is exactly the state with no level-2 cards.
    if (isMenuPage) {
      const hasCards = !!document.querySelector('#contentBelt > .htmlButtonLevel2-3');
      const hasTiles = !!document.querySelector('#menuTrackInst button.menubaseButton');
      root.classList.toggle('qu-home', hasTiles && !hasCards);
    }

    // Leaf pages ship an empty #contentBelt that still reserves ~60px of dead
    // space above the content. :empty will not catch it — Banner leaves
    // whitespace inside — so decide here and let the sheet retire it.
    ['contentBelt', 'row1', 'row2'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const bare = !el.firstElementChild && !el.textContent.trim();
      if (bare) el.dataset.quBeltEmpty = '1';
      else delete el.dataset.quBeltEmpty;
    });

    // Level-1 tiles and the compact leaf nav.
    document
      .querySelectorAll(
        'button.menubaseButton:not([data-qu]), button.menuSmallBaseButton:not([data-qu])'
      )
      .forEach((btn) => {
        btn.dataset.qu = '1';
        const info = targetFromId(btn.id);
        btn.dataset.quKey = info.target;
        btn.dataset.quKind = info.isMenu ? 'menu' : info.isExternal ? 'external' : 'page';
        applyIcon(btn, info, btn.textContent);
        splitBilingual(btn.querySelector('.menu div span, .menuSmall div div'));
      });

    // Level-2 cards.
    document.querySelectorAll('.htmlButtonLevel2-3:not([data-qu])').forEach((card) => {
      card.dataset.qu = '1';
      const info = targetFromId(card.id);
      card.dataset.quKey = info.target;
      card.dataset.quKind = info.isMenu ? 'menu' : info.isExternal ? 'external' : 'page';
      if (info.isMenu) card.dataset.quHasChildren = '1';
      if (info.isExternal) {
        card.dataset.quExternal = '1';
        let host = '';
        try {
          host = new URL(info.target).hostname;
        } catch (e) {
          /* unparseable target — the card simply carries no host badge */
        }
        if (host) {
          card.dataset.quHost = host;
          // Outbound cards name their destination instead of showing a
          // chevron: the click leaves mybanner entirely.
          const badge = document.createElement('span');
          badge.className = 'qu-host-badge';
          badge.textContent = host;
          card.appendChild(badge);
        }
      }
      const h3 = card.querySelector('h3');
      applyIcon(card, info, h3 ? h3.textContent : '');
      splitBilingual(h3);
    });

    // Cascade rewrites the inline height on every open and close, so clear it
    // every pass rather than only when a card is first seen.
    document.querySelectorAll('.htmlButtonLevel2-3[style*="height"]').forEach((c) => {
      c.style.removeProperty('height');
    });

    // Level-3 links. href is javascript:void(0) — the click handler is the
    // navigation, so these nodes must never be replaced.
    document.querySelectorAll('#contentBelt ul.items > li > a:not([data-qu])').forEach((a) => {
      a.dataset.qu = '1';
      const l3 = a.querySelector('h3');
      const name = iconFromLabel((a.getAttribute('title') || '') + ' ' + (l3 ? l3.textContent : ''));
      if (name) a.style.setProperty('--qu-icon', 'url("' + url('assets/icons/' + name + '.svg') + '")');
      splitBilingual(l3);
    });

    // Mark the current module. Cascade puts no class on the active level-1
    // tile, but menu drilling is hash-routed and the hash carries the tile's
    // own id as pageName (depth 2) or pageReferrerId (depth 3).
    const currentIds = [hash.get('pageReferrerId'), hash.get('pageName')].filter(Boolean);
    // A drilled menu reached by a real page load has no hash at all, so also
    // match the tile's decoded target against this page's own ?name=.
    document.querySelectorAll('button.menubaseButton').forEach((btn) => {
      const isCurrent =
        currentIds.indexOf(btn.id) > -1 || (!!menu && btn.dataset.quKey === menu);
      btn.classList.toggle('qu-current', isCurrent);
      const face = btn.querySelector('.menu');
      if (face) face.classList.toggle('qu-current-face', isCurrent);
    });

    // Release the carousel track so the tiles wrap instead of scrolling.
    const track = document.getElementById('menuTrackInst');
    if (track) track.style.removeProperty('width');
    const belt = document.getElementById('contentBelt');
    if (belt) belt.style.removeProperty('left');

    // Mark the open card's row panel. Every row break carries the same
    // id="level3Container", so getElementById only ever sees the first.
    const open = document.querySelector('#contentBelt > .htmlButtonLevel2-3.selected');
    document.querySelectorAll('#contentBelt > [id="level3Container"]').forEach((panel) => {
      panel.dataset.qu = '1';
      panel.classList.toggle('qu-panel-open', !!open && panel.classList.contains(open.id));
    });

    // table.datadisplaytable is used for key/value pairs and for grids alike,
    // and no selector tells them apart, so tag which shape this one is.
    document.querySelectorAll('table.datadisplaytable:not([data-qu])').forEach((t) => {
      t.dataset.qu = '1';
      const hasHeader = !!t.querySelector('th.ddheader');
      const hasLabel = !!t.querySelector('th.ddlabel');
      t.dataset.quTable = hasHeader && hasLabel ? 'mixed' : hasHeader ? 'grid' : hasLabel ? 'kv' : 'plain';
    });

    // Gateway pages — "select a term, submit" — are the shape of ten pages,
    // and should read as one card holding the notice, the fields and the
    // buttons. Banner ships the notice as a sibling above the form, so the
    // card was splitting into three loose blocks. The form already holds the
    // fields and the submit, so it becomes the card and the notice moves in.
    document.querySelectorAll('.pagebodydiv form').forEach((form) => {
      if (!form.querySelector('table.dataentrytable')) return;
      // A gateway only ever offers selects. The moment a form takes typed
      // input it is an edit form, which the sheet draws wider.
      const typed = form.querySelector(
        'input[type="text"], input[type="tel"], input[type="email"], textarea'
      );
      form.dataset.quGateway = typed ? 'edit' : 'select';
      const notice = form.previousElementSibling;
      if (
        notice &&
        notice.classList.contains('infotextdiv') &&
        !notice.dataset.quInCard
      ) {
        notice.dataset.quInCard = '1';
        form.insertBefore(notice, form.firstChild);
      }
    });

    // Tables with no class at all (bwskfone.P_CheckFourPlusOne,
    // bwskssch.P_CheckStatusExc) — every Banner table rule misses them.
    document
      .querySelectorAll('.pagebodydiv table:not([class]):not([data-qu-bare])')
      .forEach((t) => {
        t.dataset.quBare = '1';
      });

    // Cascade draws a button.htmlButton over the form's real input[submit].
    // Where both carry the same label the input is a visual duplicate, so it
    // is hidden — never removed, so the form still submits normally.
    document.querySelectorAll('.pagebodydiv form').forEach((form) => {
      // An input is a duplicate if a button already carries that label or if
      // an earlier input did — Banner emits the same submit twice on some
      // pages, so comparing against the buttons alone left a visible pair.
      const seen = new Set();
      form.querySelectorAll('button.htmlButton').forEach((b) => {
        seen.add(b.textContent.replace(/\s+/g, ' ').trim().toLowerCase());
      });
      form.querySelectorAll('input[type="submit"]').forEach((input) => {
        const label = (input.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (!label) {
          input.dataset.quDupe = '0';
          return;
        }
        input.dataset.quDupe = seen.has(label) ? '1' : '0';
        seen.add(label);
      });
    });

    if (!SHOW_ARABIC) {
      document
        .querySelectorAll('.htmlButtonLevel2-3 p, .descriptionText, .menulinkdesctext')
        .forEach(tagArabicOnly);

      // Form pages carry Arabic instructions in bare cells and spans beside
      // their English twin, so this has to be a blanket sweep — Banner is old
      // markup and wraps them in <font> as readily as <span> or <td>.
      // isRecordValue keeps it off the student's own data, where an Arabic
      // string is information rather than a duplicate translation.
      document.querySelectorAll('.pagebodydiv *').forEach((el) => {
        if (el.children.length) return;
        if (isRecordValue(el)) return;
        tagArabicOnly(el);
      });
    }

    // The banner table has one cell holding the legacy icon image and one
    // holding the message. Tag the icon-only cell so the sheet can drop it;
    // testing for a missing .infotext span would also hide banners whose text
    // is not wrapped in one.
    document.querySelectorAll('td.indefault:not([data-qu-iconcell])').forEach((td) => {
      td.dataset.quIconcell = td.textContent.trim() ? '0' : '1';
    });

    shapeTables();
    buildBalancePill();
    classifyMessages();

    const overlay = document.querySelector('.findPageOverlay');
    if (overlay) enhanceSearch(overlay);

    enhanceTranscript();
    enhanceAnonymous();
    handleBlankPage();
    buildLockup();
    buildSwitcher();
    buildHeadRow();
    buildFooter();
  }

  /* --- Wiring. Menu drilling is client-side and hash-routed, and #contentBelt
     is rebuilt with no event to hook, so the observer is not optional. --- */

  // Reloading the extension orphans the content script already running in an
  // open tab: the page keeps its skin, but chrome.* throws "Extension context
  // invalidated" on the next call, and the observer would rethrow on every
  // mutation forever. Detect it and retire quietly — the page stays styled and
  // the next navigation gets a fresh script.
  let retired = false;
  const contextAlive = () => {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  };

  let observer = null;
  const retire = () => {
    if (retired) return;
    retired = true;
    if (observer) observer.disconnect();
    window.removeEventListener('hashchange', schedule);
    window.removeEventListener('popstate', schedule);
    reveal();
  };

  // chrome.runtime.id going undefined is the usual tell, but the throw can
  // beat it, so the message counts as proof on its own.
  const isDeadContext = (err) =>
    !contextAlive() || /Extension context invalidated/i.test((err && err.message) || '');

  const run = () => {
    if (retired) return;
    if (!contextAlive()) return retire();
    try {
      enhance();
    } catch (err) {
      // Never let a styling bug leave the page hidden or half-built.
      reveal();
      // A dead context is not a bug worth reporting on every mutation.
      if (isDeadContext(err)) return retire();
      console.warn('[myQU] enhance failed:', err && err.message);
    }
  };

  let queued = false;
  const schedule = () => {
    if (retired || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      run();
    });
  };

  // A level-3 panel is opened and closed by one line of Cascade: the level-2
  // card toggles its own .selected, and its callback slides the panel up when
  // the class has gone. Nothing is added or removed from the DOM either way,
  // so a childList-only observer saw the open (the panel is refilled) and
  // never the close — the pass never re-ran, .qu-panel-open stayed put, and
  // the sheet held the panel open against jQuery going display:none inline.
  //
  // Attributes cannot be watched wholesale: the pass rewrites data-qu-* on
  // every run, so any record it can cause itself would re-arm it every frame.
  // Narrowing to class is not enough either — Cascade writes .hover on these
  // same cards on every mouseenter. Only a change in the selected token is a
  // real state change, and nothing here ever writes that token.
  const wasSelected = (cls) => (' ' + (cls || '') + ' ').indexOf(' selected ') > -1;
  const stateChanged = (rec) =>
    rec.type !== 'attributes' ||
    wasSelected(rec.oldValue) !== rec.target.classList.contains('selected');

  observer = new MutationObserver((records) => {
    if (records.some(stateChanged)) schedule();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('DOMContentLoaded', () => {
    prefsReady.then(run);
    run();
  });
  run();

  // Exposed for debugging from the console only. Holds no page data.
  Object.defineProperty(window, '__quEnhancer', {
    value: Object.freeze({
      version: '1.0.1',
      LOGOUT_TRAP: LOGOUT_TRAP,
      hasCredentials: hasCredentials,
      targetFromId: targetFromId,
      stats: () => ({
        enhanced: document.querySelectorAll('[data-qu]').length,
        cards: document.querySelectorAll('.htmlButtonLevel2-3').length,
        theme: root.dataset.qux,
        lang: root.dataset.uilang,
      }),
    }),
    configurable: true,
  });
})();
