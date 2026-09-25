# myQU Banner — UI Enhancer

A Chrome extension that restyles **mybanner.qu.edu.qa** in place.

Same server, same pages, same data — only the presentation changes. Nothing is
added to your record, nothing is removed from it, and no page content is
rewritten.

Two themes from one design system: institutional **QU maroon** and the
chapter's own **ACM mint**, each in light and dark.

Built and maintained by the **ACM Student Chapter at Qatar University**.

---

## Install

The extension is not on the Chrome Web Store, so it installs unpacked. It takes
about a minute.

1. **Download this repository.** Either `git clone` it, or use the green
   **Code** button → **Download ZIP** and unzip it somewhere you will not
   delete by accident. Chrome loads the extension from that folder every time
   it starts, so don't leave it in Downloads.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and select the folder you just unzipped — the one
   containing `manifest.json`.
5. **Sign in to myBanner first**, then open the main menu:
   <https://mybanner.qu.edu.qa/PROD/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu>

> **Sign in before you load the extension, and reach myBanner from a
> bookmark or a link rather than by typing the bare address.** This is a quirk
> of Banner itself, not of the extension — see
> [Why not the bare address?](#why-not-the-bare-address) below.

Chrome will show "Developer mode extensions" warnings on startup. That is
normal for any unpacked extension and can be dismissed.

### Updating

`git pull` (or download the ZIP again and replace the folder), then click the
refresh icon on the extension's card in `chrome://extensions`. Reload any open
myBanner tab afterwards.

---

## Using it

**The toolbar popup** — click the extension's icon for the theme (QU maroon or
ACM mint), the appearance (auto, light, dark) and an on/off switch.

Turning it off hands the page straight back to Banner, untouched. Your choices
are stored in Chrome's own sync storage, so they follow your Chrome profile
across machines.

---

## What it changes

| Area | Treatment |
|---|---|
| **Layout** | Every page shares one frame and one spacing scale: the same left and right edges from the header to the footer, and the same gaps between regions and blocks, on every page type and screen width |
| **Global bar** | An 84px band with a co-branded lockup and Sign Out / Help. Theme, appearance and the on/off switch are in the toolbar popup |
| **Menu pages** | On Home the five modules become a grid of title-and-description cards. Drilling into a module shows the module row → breadcrumb and search → a 3-column card grid with per-item icons, badges naming the destination on links that leave the portal, and a level-3 panel under the open card |
| **Leaf pages** | Compact navigation, the breadcrumb with the identity block beside it, status banners, form cards, and both Banner table shapes — key/value and grid — with sticky headers, tabular numerals and section headings |
| **Arabic labels** | Where the site puts English and Arabic in one run, each half gets its own font, size and text direction |
| **Signed-out landing** | The six public links that sit hidden in the legacy markup are surfaced as cards |
| **Academic Transcript** | A sticky "on this page" rail, a print button, per-term headers with standing badges, and a print stylesheet the page never had |
| **Empty and error pages** | A message with nothing beside it becomes a proper empty state instead of a stray red line, and server error pages get a branded replacement with a way back |

It also quietly fixes a number of long-standing issues in the portal: text that
fails colour-contrast guidelines, a search box that floats over the content, no
visible keyboard focus anywhere, no responsive layout below ~1100px, a search
panel that returns duplicates, truncated Arabic card titles, and a signed-out
page that renders blank while its links sit hidden in the markup.

---

## Privacy

This is your student portal, so it is worth being precise about what the
extension can and cannot do.

**It has no network access.** The extension requests no network permission and
makes no requests of any kind — not to our servers, not to anyone's. There is
nothing to send data to. Every font and icon it uses is bundled in this
repository and loaded from your own disk.

**It runs on one host and nothing else.** Its permissions are
`https://mybanner.qu.edu.qa/*`. The university SSO is on a different host and
is unreachable — with this manifest, the extension physically cannot run there.
If a future version ever asks to widen this, treat that as a red flag and ask
the chapter about it.

**It never touches your credentials.** The sign-in pages are styled like any
other page, but the code never reads, writes, prefills, autofills or submits a
username, PIN or password field.

**It stores five things**, all in Chrome's sync storage: your theme, your
appearance setting, your language setting, whether animations are on, and
whether the extension is on.
Your student ID, name, grades, address and balances are displayed and styled
like any other text on the page — never logged, stored or transmitted.

The whole extension is about 5,500 lines across two files you can read
yourself: `src/enhance.js` and `src/skin.css`.

---

## Troubleshooting

**A page looks wrong, or something is missing.**
Turn the extension off from the toolbar popup. If the page is still
wrong, the problem is on the site's side. If it comes back correct, please
[open an issue](../../issues) with the page you were on and a screenshot.

**I got signed out unexpectedly.**
See below — that is a Banner behaviour that predates this extension.

**Nothing changed after I installed it.**
Reload the myBanner tab. The extension only injects on
`mybanner.qu.edu.qa`, and a tab that was already open when you installed it
will not have it.

**The page flashed unstyled, then corrected itself.**
Expected on a slow connection. The skin applies before first paint, but the
site rebuilds parts of the page afterwards.

### Why not the bare address?

Banner keeps **one session cookie per browser profile**. Requesting the site's
bare root, or any sign-in address, makes the server issue a fresh one — which
silently signs you out of every myBanner tab you have open. This happens with
or without this extension installed.

The practical advice: bookmark the main menu URL from the install steps above
rather than `mybanner.qu.edu.qa` on its own, and don't open myBanner in a
second tab while you're in the middle of something.

The extension is built around this. It makes no requests at all, precisely so
it can never trigger it.

---

## How it works

For anyone reading or extending the code.

`src/enhance.js` is a content script that runs at `document_start`. The site
gives `<body>` no class or id, so the script first derives a page identity from
the URL (`html.qu-x`, `.qu-menu` / `.qu-leaf`, `.qu-home`, `.qu-anon` /
`.qu-auth`). It stamps the theme before first paint, then corrects it once
Chrome's storage resolves, and holds a visibility guard that always lifts —
on `DOMContentLoaded`, on `load`, and on a 1200ms hard fallback.

Everything after that runs from a `MutationObserver`. Menu drilling in this
portal is client-side and hash-routed, and the content area is rebuilt with no
event to hook, so re-running on mutation is not optional. Every branch is
written to be a no-op the second time it runs.

`src/skin.css` is delivered through the manifest so it applies before first
paint. Every declaration carries `!important` and every selector is prefixed
`html.qu-x`. That is not stylistic: the site's own override sheet uses
`!important` on backgrounds and around 72 elements carry JavaScript-written
inline styles, so an ordinary author rule loses whatever its specificity.

**Restyle, never rebuild.** The portal binds jQuery handlers to its menu
buttons and cards, and its level-3 links use `href="javascript:void(0)"` — the
click handler *is* the navigation. Replacing any of those nodes breaks the
portal. The extension only adds classes, data-attributes and wrapper spans.
Moving a node is safe, because it keeps its listeners; the one node it moves is
the search box.

---

## Fonts and marks

Four families are bundled, so nothing is fetched at runtime:

| Family | Licence |
|---|---|
| Droid Arabic Kufi 400 / 700 | Apache-2.0 — the face QU itself uses |
| Lexend 100–900 (variable) | SIL Open Font License 1.1 |
| JetBrains Mono 100–800 (variable) | SIL Open Font License 1.1 |
| Poppins 700 / 800 | SIL Open Font License 1.1 |

About 250KB in total. The Qatar University and ACM marks belong to their
respective owners and appear here for attribution only.

---

## Known limitations

Worth knowing before you rely on it:

- Result pages reached by submitting a term selector — the transcript and
  account detail views — were built against captured markup rather than an
  observed live response. They should be correct; report anything that isn't.
- Print output for the Academic Transcript has not been checked on paper.
- **Proxy Access** is deliberately left out of the menus: its menu returns a
  404 on the live site.

---

## Contributing

Issues and pull requests are welcome, from chapter members and everyone else.
Read [CONTRIBUTING.md](CONTRIBUTING.md) first — this extension runs on a live
portal students use for registration, grades and money, and a few of its rules
are not negotiable.

## License

MIT — see [LICENSE](LICENSE). Bundled fonts keep their own licences.
