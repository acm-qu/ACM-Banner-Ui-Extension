# AGENTS.md

Guidance for coding agents working in this repository. Human contributors should
read [CONTRIBUTING.md](CONTRIBUTING.md) and [README.md](README.md) first — this
file assumes both and does not repeat them.

## What this is

A Chrome MV3 extension that restyles `mybanner.qu.edu.qa` (Ellucian Banner 8.11
Self-Service, Oracle PL/SQL behind ORDS, jQuery 1.6.1, Ellucian "Cascade" UI) in
place. Presentation only — no network access, no page content rewritten. The
whole extension is a manifest and four files in `src/`:

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest; injects the content script + sheet at `document_start` |
| `src/enhance.js` | ~1,900-line content script: page identity, theme, DOM tagging |
| `src/skin.css` | ~3,700-line sheet, sections 0–17 plus 1b and 7b |
| `src/popup.html` / `src/popup.js` | Toolbar popup; writes prefs to `chrome.storage.sync` |

## Development loop

There is **no build, no test suite, no linter, and no `package.json`**. Files are
loaded as written. Do not add npm scripts or invent commands.

1. Edit the file.
2. Hit refresh on the extension's card in `chrome://extensions`.
3. Reload the myBanner tab.

Console helpers on a Banner page:

```js
window.__quEnhancer.stats()   // { enhanced, cards, theme, lang }
window.__quEnhancer.audit()   // { frame, offFrame: [], gaps: [] } — layout check
document.querySelectorAll('[data-qu]').length   // must STOP growing as you click
```

That last number is the idempotence test — see the lifecycle section below.
`audit()` is the layout test: `offFrame` lists every visible region or body
block whose edges leave the frame, `gaps` every vertical gap between regions
or blocks that is not one of the rhythm tokens. It returns geometry and
selectors only, never page text, and logs nothing. Both lists must be empty.

Before opening a PR, walk a menu page, a leaf page and the Academic Transcript in
all four theme scopes (`qu-light`, `qu-dark`, `acm-light`, `acm-dark`), run
`audit()` on each at desktop and phone widths, and check that turning the
extension off hands back a clean page.

## Non-negotiables

These run on a live portal students use for registration, grades and money.
Full reasoning is in [CONTRIBUTING.md](CONTRIBUTING.md); the guards in code are:

- **Never request a Banner URL.** Banner keeps one `SESSID` per browser profile;
  any request to the root or a login-family URL reissues it and signs the user
  out of every open tab. `LOGOUT_TRAP` (`src/enhance.js`) is the pattern to test
  against if a feature ever needs to fetch. Today nothing fetches at all.
- **Never touch a credential field.** `hasCredentials()` gates every
  value-touching branch.
- **Never log, store or transmit page data.** IDs, names, grades, balances.
- **Never widen `host_permissions`** beyond `https://mybanner.qu.edu.qa/*`.
- **Never rewrite a server string.** Wrapping and re-laying-out is fine;
  rewording and translating is not.
- **Restyle, never rebuild.** Cascade binds jQuery handlers to
  `button.menubaseButton` and `div.htmlButtonLevel2-3`, and level-3 links use
  `href="javascript:void(0)"` — the handler *is* the navigation. Add classes,
  data-attributes and wrapper spans. Moving a node keeps its listeners and is
  safe; cloning, replacing or recreating one breaks the portal.

## enhance.js lifecycle

Boot order matters, because the sheet is already applying while this runs.

1. **Page identity.** The site gives `<body>` no class or id, so identity is
   derived from the URL: `html.qu-x` always, plus `.qu-menu` / `.qu-leaf`,
   `.qu-home`, and `data-qu-proc` / `data-qu-menu`. `stampAuth()` later adds
   `.qu-anon` / `.qu-auth` from the DOM.
2. **`stampTheme(DEFAULTS)` synchronously**, so the right palette paints first.
   Writes `data-qux` (`<theme>-<light|dark>`), `data-qux-theme`, `data-qux-mode`,
   `data-uilang`, `.qu-ar`.
3. **`#qu-preload`** hides `body` to prevent a flash of unstyled Banner.
4. **Storage resolves** (`prefsReady`) and either corrects the theme or calls
   `disableSkin()` — which drops every `qu-*` root class and the runtime asset
   sheet, handing the page back to Banner as the server sent it.
5. **`reveal()` always lifts**, whatever happens: `DOMContentLoaded` + 60ms,
   `load`, `pagehide`, a 1200ms hard fallback, and inside the observer's `catch`.
   Never add a path that can leave the page hidden.

Everything after that is `enhance()`, re-run from a `MutationObserver`. Menu
drilling is client-side and hash-routed and `#contentBelt` is rebuilt with no
event to hook, so re-running on mutation is not optional.

### Idempotence

**Every branch you add must be a no-op the second time it runs.** The standard
pattern is `:not([data-qu])` on entry and `el.dataset.qu = '1'` on the way out.

A branch that reads a table, a cell or the page once and then marks it done
must also wait for `parsed` (`document.readyState !== 'loading'`). The
observer's rAF fires between parser chunks on long pages, so a one-shot pass
can otherwise see half a table and never look again — that is how the
transcript rail once stopped at whichever term the parser had reached. The body
is hidden until `DOMContentLoaded`, so waiting costs nothing on screen.

A few branches deliberately re-run every pass because Cascade keeps rewriting
what they fix — inline `height` on level-2 cards, `#menuTrackInst` width,
`#contentBelt` `left`, `.qu-current` on the active tile, and `.qu-panel-open` on
level-3 containers. Those are cheap toggles, not accumulating work.

### The observer filter

`observe(root, { childList, subtree, attributes, attributeFilter: ['class'],
attributeOldValue })`, and `stateChanged()` compares class lists **minus**
`.hover` (Cascade writes it on every mouseenter) and **minus every `qu-*` token**
(the pass writes those itself). This is what stops the observer re-arming itself
every frame.

> Consequence: **every class this extension adds must be `qu-` prefixed.** An
> unprefixed class turns the observer into an infinite loop.

Attributes cannot be watched wholesale for the same reason. Class-only is a
deliberate narrowing, and it is already the narrowest that works: which panel is
open is two separate Cascade writes (`.selected` on the card, and the card's id
added as a class on its row's `level3Container`), and filtering to one of them
missed the other.

### Dead context

Reloading the extension orphans the content script in an open tab: `chrome.*`
then throws "Extension context invalidated" on every mutation forever.
`contextAlive()` / `isDeadContext()` detect it and `retire()` disconnects the
observer quietly — the page keeps its skin, the next navigation gets a fresh
script.

### What enhance() does, in order

`handleOrdsError()` → `stampAuth()` → home-vs-drilled detection (from the DOM, not
the hash — Cascade writes a `pageName` even for Home) → empty-belt tagging →
level-1 tiles → level-2 cards → level-3 links → current-module marking →
carousel release → panel-open marking → table shape tagging (`kv` / `grid` /
`mixed` / `plain`) → gateway forms → duplicate submit suppression → Arabic
handling → then the page-specific passes: `shapeTables()`, `buildBalancePill()`,
`classifyMessages()`, `tagSpacerBreaks()`, `enhanceSearch()`,
`enhanceTranscript()`, `enhanceAnonymous()`, `handleBlankPage()`, and finally the
extension-owned chrome (`buildLockup`, `buildHeadRow`, `buildFooter`). The
global bar carries no controls of ours: theme, appearance and the off switch
live only in the toolbar popup. The one-shot content passes among these run only once `parsed`.

**Current module.** Exactly one level-1 tile is current. It is resolved each pass
from one source, the most specific that decodes (via `targetFromId`, so a
renumbered `___UID` suffix still matches) to a tile: the hash's `pageName`, then
its `pageReferrerId`, then the breadcrumb's module link, then the page-load
`?name=`. Never OR these: menu-to-menu navigation is client-side and leaves
`location.search` alone, so `?name=` goes stale after one drill — matching it
alongside the hash is how two tiles were once lit at once. The sheet paints the
current state from `.qu-current-face` only.

**Head row.** `buildHeadRow` owns the only page-head DOM: the crumb (or, on Home,
the greeting) grows on the left; the identity block (`placeIdentity`, leaf pages)
and the search pack against the end. There is no page title of our own — the
crumb's current chip names the page. On a drilled menu the row follows the tile
row, so navigation sits first on every page type: global bar → module
navigation → crumb and search → content.

Bilingual handling lives in `splitBilingual()` / `tagArabicOnly()` /
`stripArabicTail()`; icon resolution in `targetFromId()` → `iconFromLabel()` →
`iconFor()` → `applyIcon()`. `SHOW_ARABIC` (currently `true`) gates the sweep
that would hide Arabic duplicates; `isRecordValue()` keeps that sweep off the
student's own data, where Arabic is content rather than a duplicate label.

## Popup ↔ content script

There is no message passing and no `scripting` permission. The popup writes
`theme`, `mode`, `lang`, `enabled`, `motion` to `chrome.storage.sync`; the content script's
`chrome.storage.onChanged` listener restamps every open Banner tab. Flipping
`enabled` triggers `location.reload()` rather than trying to unwind in place.
Both sides declare the same `DEFAULTS = { theme: 'qu', mode: 'light', lang: 'en',
enabled: true, motion: 'on' }` — keep them in sync. `motion` is stamped as
`data-qux-motion` on the root (a data attribute, so the class-only observer
never sees it); `off` zeroes the motion tokens.

The popup wears the theme it controls: `popup.js` stamps the same `data-qux`
scope on the popup's own `<html>`, and `popup.html` carries its own copy of the
section 1 token values it uses — change both. It is loaded from `<head>` and
paints the prefs it last showed (cached in its own `localStorage`, prefs only)
before `chrome.storage.sync` answers; transitions switch on only after that, so
opening it never animates.

## skin.css conventions

- **`!important` on every declaration** and **`html.qu-x` on every selector.**
  Not stylistic: QU's own `app-overrides.css` uses `!important` on backgrounds
  and ~72 elements carry JS-written inline styles, so an author-normal rule loses
  regardless of specificity.
- **Tokens** are one semantic `--x-*` set with four value scopes on
  `html[data-qux]`: `qu-light` (default), `qu-dark`, `acm-light`, `acm-dark`.
  Add a token to all four or it is undefined in three themes.
- Section 0 exists because the site sets `font-size: 0.98em` on ~60 element types
  including `html` and `div`, so it compounds per nesting level and 1rem becomes
  15.68px document-wide. Do not remove the reset.
- **Layout tokens (§1b) are theme-independent** and declared once on `html.qu-x`:
  the spacing scale `--x-s-1…10` (4 8 12 16 20 24 32 40 48 64), the frame
  (`--x-frame`, `--x-gutter`, `--x-inset`), the rhythm roles (`--x-gap-top`,
  `-nav`, `-content`, `-block`, `-grid`, `-end`) and the card text inset
  `--x-card-x`. Colour and type tokens still need all four scopes; these do not.

### Layout system

Three rules keep every page — including ones nobody has looked at — aligned:

1. **Frame once, on `body`.** `body` carries the only side inset
   (`padding-inline: var(--x-inset)`). No structural container may set
   `max-width`, `margin-inline: auto` or `padding-inline` to frame itself; §2
   neutralises the ones Banner, Cascade and the legacy sheets frame. Nested
   self-framing containers are how head and body once sat on different edges.
   Full-bleed bands (`#header`, `#pagefooter`) escape with
   `margin-inline: calc(-1 * var(--x-inset))` and re-pad with the same token.
2. **Top gaps only.** Each region and each body block owns only its top gap, from
   a `--x-gap-*` token; nothing carries a bottom margin. The region gaps live in
   one place (§2, "Rhythm"). Inside the body, stacks (`.pagebodydiv`, non-card
   forms, `td.pldefault`, `.qu-transcript-main`) space their block children with
   `--x-gap-block`; the page body and the transcript column are `flow-root`, so
   no gap leaks out of them. A new block type joins that selector list (§2,
   "Stacks") rather than getting its own margin.
3. **One card inset.** Caption, header, label and value cells share
   `--x-card-x`, so text inside a card lines up on one edge.

Two component rules follow from real bugs:

- **Radius by role, never hard-coded.** `--x-r-ctl` for tabs and buttons,
  `--x-r-field` for inputs, `--x-r-pill` for crumb chips and badges,
  `--x-r-card` for cards, panels and list options, `--x-r-area` for banners,
  notices and overlays; icon chips are circles. The QU scope squares everything,
  pseudo-elements included.
- **Messages are never flex rows.** Their text flows as ordinary inline content
  and the icon hangs in a padded gutter. As a flex row, every inline element in
  a message (a `<b>`, a link) became a column of its own.

Module tabs, Home cards and level-3 options carry no icons; only level-2 cards
do. On phones (≤640px) the module bar is hidden; Home keeps its module cards.

**Motion.** One easing, `--x-ease: cubic-bezier(0, .78, .28, 1)`; hover changes
take `--x-dur-hover` (0.5s) and panels that open take `--x-dur-reveal` (0.7s). A
universal rule eases colours, borders and shadows on every element — never
opacity, transforms or sizes, which Cascade animates with jQuery. The level-3
panel and the search results slide down from `height: 0` via `@starting-style`
(with `interpolate-size: allow-keywords`). The popup's Animations switch and the
OS reduced-motion setting both zero the duration tokens.

Section map — find where a rule belongs before adding one:

```
 0  FIRST RULES          6  MENU PAGES          12  RTL
 1  TOKENS               7  LEAF PAGES          13  RESPONSIVE
1b  LAYOUT TOKENS       7b  ACADEMIC TRANSCRIPT 14  PRINT
 2  PAGE FRAME           8  FOOTER              15  REDUCED MOTION
 3  GLOBAL BAR           9  ANONYMOUS + SIGN-IN 16  LATE OVERRIDES
 4  SEARCH              10  EXTENSION NOTICES   17  TABLE SHAPING
 5  PAGE HEAD           11  HELP OVERLAY
```

## Assets

A bare `url()` inside the injected sheet resolves against `mybanner.qu.edu.qa`
and 404s. **Every asset URL is therefore written at runtime through
`chrome.runtime.getURL`**, from `enhance.js`, never typed into `skin.css`:

- `BUNDLED_FONTS` → the `@font-face` block. Only faces actually present in
  `assets/fonts/` belong here; a 404ing face costs a flash of invisible text on
  every load that `font-display: swap` does not absorb.
- `ICON_VARS` → the `--qu-i-*` custom properties for chrome icons (search,
  chevrons, banner glyphs). Referenced from `skin.css` by variable.
- `ICONS` (procedure id → icon), `LABEL_ICONS` (regex → icon) and `HOST_ICONS`
  (external hostname → icon) → per-item level-2 card icons, resolved by
  `iconFor()` and set by `applyIcon()` as an inline `--qu-icon`. A new per-item
  icon goes in one of these three maps.

Everything is bundled; nothing is fetched.

## Versioning and releases

Bump **two** places together:

- `manifest.json` → `version`
- `src/enhance.js` → `__quEnhancer.version`

There are no git tags. Releases are marked in the commit subject, e.g.
`Fixed bug where the dropdown would dock right after opening, release as 1.0.2`.

## references/ (untracked, may be absent)

If present, `references/` holds material not in git — other clones will not have
it. Never stage it and never copy from it into tracked files: it is untracked but
not gitignored, so a `git add -A` would commit real student data.

- `references/banner_references/` — a redacted offline archive of every reachable
  Banner page. `pages/` is server HTML as returned (including the hidden legacy
  markup Cascade replaces, which carries English descriptions the visible UI
  drops); `rendered/` is post-Cascade DOM snapshots, including a level-3-expanded
  and a search-overlay state; `MANIFEST.md` indexes both. Use it to check
  selectors without a live session. It still contains real grades, fees and
  course data — treat it as student data.
  `02CLAUDECODEHANDOFF.md` is the engineering handoff: page archetypes, verified
  selectors, and the login-family URLs that must never be requested.
- `references/ACM Banner Redesign - Claude Design Output/` — the design canvas.
  Its `CLAUDE.md` carries the copy register for extension-owned strings (QU's
  voice, not product-speak) and the decision to leave Proxy Access out of the
  menus. Read it before writing any new user-facing string.

## Known limitations

See README → Known limitations before touching the transcript, account-detail or
Proxy Access code.
