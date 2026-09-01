# Contributing

Thanks for picking this up. This extension runs on a live university portal
that students use for registration, grades and money, so a few rules are not
negotiable.

## Before you change anything

- **Never fetch a Banner URL.** Banner keeps one session cookie per browser
  profile, and requesting the bare root or any sign-in address makes the server
  reissue it and sign the user out of every open tab. A background `fetch`, a
  prefetch, an `<img>` probe and a second tab all count. The extension
  currently makes no requests at all; `LOGOUT_TRAP` in `src/enhance.js` is the
  guard if that ever changes.
- **Never touch a credential field.** No reading, writing, prefilling,
  autofilling or submitting a username, PIN or `input[type="password"]`.
  `hasCredentials()` is there to gate anything that might.
- **Never log, store or transmit page data.** Student IDs, names, addresses,
  grades and balances are all on these pages. Style them; do not keep them.
- **Never widen `host_permissions`.** It is `https://mybanner.qu.edu.qa/*` and
  nothing else. The university SSO is on a different host, and this manifest
  makes it unreachable on purpose.
- **Never rewrite a server string.** Labels can be wrapped and re-laid-out, not
  reworded or translated.

## Restyle, never rebuild

The portal binds jQuery handlers to `button.menubaseButton` and
`div.htmlButtonLevel2-3`, and its level-3 links use `href="javascript:void(0)"`,
which means the click handler *is* the navigation. Replacing any of those nodes
breaks the portal.

Add classes, data-attributes and wrapper spans inside labels. Moving a node is
fine — it keeps its listeners — but do not clone, replace or recreate one.

## Working on the code

`src/enhance.js` re-runs on every DOM mutation, so **every branch you add has
to be a no-op the second time round.** The usual guard is a `data-qu*`
attribute you set on the first pass and check on entry. The quick test is that
`document.querySelectorAll('[data-qu]').length` stops growing while you click
around.

`src/skin.css` needs `!important` on every declaration and `html.qu-x` on every
selector, for the reasons in the README.

To try a change: edit the file, hit refresh on the extension's card in
`chrome://extensions`, then reload your myBanner tab. `window.__quEnhancer` in
the console exposes a `stats()` helper and the current theme.

Before opening a pull request, walk a menu page, a leaf page and the Academic
Transcript in all four theme scopes (QU and ACM, light and dark), and check
that turning the extension off still hands back a clean page.

## Comments

Explain *why*, especially where a workaround looks strange — most of this
codebase is working around a portal built in 2011, and the reason is rarely
obvious from the code. Skip comments that restate what the line already says.

## Pull requests

One concern per pull request. Say in the description what you checked and what
you did not — "not verified against the live signed-in site" is a useful thing
to know and a perfectly acceptable thing to write.
