# Dashboard startup: architecture, deployment and troubleshooting

## What a host page must provide

The whole Webflow dashboard page body and custom code should be just this:

```html
<script type="module" src="https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/js/dashboard.js"></script>
```

`js/dashboard.js` loads everything else from the same base URL, in order:

1. `styles/tools.css` (tool panel styles) and the Exo/Inter/Montserrat fonts.
2. `js/firebase.js`, which sets up Firebase and `window.MTW`, unless the page already did.
3. Every `templates/<tool>.html` panel file.
4. `js/navigation/dashboard-navigation.js`, which builds the dashboard, installs the panels, then loads the shell, `admin-dashboard.css` and `developer-tools.js`.
5. The tool scripts (`activity/`, `inventory/`, `config/`, `products/`), as ES modules.

No Webflow Designer markup is needed. If the page still has the old Webflow dashboard markup (`.change-logs` and `.db-tool-wrapper` in `<body>`), it is removed, because the repository templates replace it (a console note says so). Without the loader (old embeds), that markup is moved into the dashboard instead.

`apps/dashboard/index.html` is a working minimal host for development.

## Sign-in

The loader checks the sign-in first (`js/access/session-guard.js`). The `/admin` page sets `sessionStorage.mtw_admin_logged_in = "true"` and `mtw_admin_name` (the role: Counter, Stores, KeyAccounts or Managers). Session storage survives refreshes in the same tab and is cleared when the tab or browser closes.

- **Signed in this session:** the dashboard loads.
- **Not signed in** (new tab, or the tab was closed): the page is hidden (`display: none`) and replaced with `/admin` before anything else loads.
- **Sign out** (header button): clears the session, including any unlocked Timesheet PIN, and goes to `/admin`.

The loader is a module script, so it runs after the page is parsed. To hide even that first instant, you can also put this in the Webflow page's **head** custom code:

```html
<script>try{if(!/[?&]share=/.test(location.search)&&sessionStorage.getItem('mtw_admin_logged_in')!=='true'){document.documentElement.style.display='none';location.replace('/admin');}}catch(e){location.replace('/admin');}</script>
```

The `share=` check lets share links through; an older copy of this snippet without it
sends every share link to `/admin`.

## Share links (tablets and desktop shortcuts)

A manager can open one tool without the `/admin` sign-in through a share link:
**Manager Tools → Share links**, pick the tool (only the Timesheet is shareable), give it a
label such as "Workshop tablet", and **Create link**. The link (`…/dashboard?share=<token>`) is
shown once with a Copy button; open it on the tablet and add it to the home screen.

- The page shows only that tool: no Overview tab, no X, no Sign out, no other tools or panels
  are loaded. The tool's own PIN (employee or GM) still applies.
- Firestore `dashboard-share-links/<sha256(token)>` holds `{ tool, label, revoked, createdAt,
  createdBy, lastUsedAt }`. The token itself is never stored.
- **Revoke** in the list stops the link at its next load. A revoked, unknown or mangled link
  shows a short "This link can't be opened" message with the reason (and a link to `/admin`).
- If a share link lands on `/admin` instead, either the page's head code redirects before the
  dashboard runs (use the snippet above), or the browser still has an old `dashboard.js`:
  `MTW_DASHBOARD_DIAGNOSE().loaderBuild` should be the current build.
- Which tools may be shared: `SHAREABLE_TOOLS` in `js/access/session-guard.js`, and what a
  shared tool loads: `SHARE_ASSETS` in `js/dashboard.js`.
- Like the sign-in, the check runs in the browser; Firestore rules are what really protect data.

## Changing a tool's layout

- Markup: `apps/dashboard/templates/<tool>.html`. Keep the class names; the tool scripts find their elements by class. `{{BASE}}` becomes the `apps/dashboard/` URL (used for the label sheet images in `assets/labels/`).
- Styles: `apps/dashboard/styles/tools.css` (tool panels, extracted from the Webflow site stylesheet) and `apps/dashboard/styles/admin-dashboard.css` (shell, navigation and tool frame).
- Promotional label editing opens the old sidebar (`.db-left-content.editing`) as a drawer on the right.

## Startup sequence

1. `dashboard-navigation.js` runs once (guarded by `MTW_DASHBOARD_NAVIGATION_STARTED`). On DOM ready it:
   - builds `.db-main-wrapper`, `.db-left-content`, `.db-menu-list`, `.db-right-content`, the tool wrapper and the overview;
   - generates one navigation card per entry in its `TOOLS` registry;
   - defines `window.openDBTool(id)`, `window.closeDBTool()` and `window.MTW_TOOL_REGISTRY`;
   - sets `MTW_DASHBOARD_NAVIGATION_READY` and dispatches `mtw-dashboard-navigation-ready`;
   - loads `admin-dashboard.css`, `developer-tools.js` and `dashboard-shell.js` from the **same base URL** it was loaded from, unless they are already on the page.
2. `dashboard-shell.js` runs once (guarded by `MTW_DASHBOARD_SHELL_STARTED`). If navigation isn't on the page, it loads it from its own base URL. It waits for the ready signal, then wraps everything in `.mtw-dashboard-shell` (header, navigation bar, content area) and dispatches `mtw-dashboard-shell-ready`.
3. If the shell hasn't been built after 15 seconds, it logs one error naming the cause and the missing pieces.

Either script can be the page's only entry point. Including both, or either one twice, is safe.

## Root cause of the November 2026 failure

The console error `dashboard-shell.js:31 … required dashboard markup or navigation is missing` came from two problems:

1. **The live page ran the pre-PR #1 shell.** In that version (`591a356`) the message is on line 31. From PR #1 on, it is on line 37. The error was also logged twice: the old shell has no duplicate guard and was evidently included twice (one copy showed as `VM96`, meaning it was injected or evaluated rather than loaded from a file). So the published page was loading a cached, pinned or pasted copy of the shell, not the current `main`.
2. **PR #1 shipped a syntax error.** `dashboard-navigation.js` declared `const $` twice, so the whole script failed to parse. `openDBTool` never existed and the shell gave up after 6 seconds. PR #2 fixed the declaration.

After PR #2 there was still a runtime bug: `openDBTool` called `$('.db-list-toolcard').forEach(…)`, but `$` returns a single element. Every tool click threw a `TypeError`. That is fixed here, and `npm test` covers it.

## When a tool opens empty

Run this in the browser console on the live dashboard, then copy the output into the issue:

```js
copy(MTW_DASHBOARD_DIAGNOSE())
```

It reports the navigation build, role, whether Firebase is connected, the dashboard script URLs, and, for every tool, whether its panel exists, sits inside the shell, and has content. A tool whose panel is `found: false` has no markup on the page: its Webflow panel was removed, or it hasn't been migrated into the repository yet. Opening such a tool also logs a `[dashboard] … no element matches …` warning.

The tool scripts (`barcodes.js`, `products.js`, etc.) don't build their own panels. They expect the Webflow panel markup to exist, and Webflow's custom code loads them. Migrating each tool's markup into the repository is the next step towards a fully repository-owned dashboard.

## Reading the startup error

| Message says | Meaning | Check |
|---|---|---|
| `dashboard-navigation.js could not be downloaded from <url>` | 404 or network failure | The URL in the Webflow custom code / CDN path |
| `dashboard-navigation.js never ran` | Script tag present but failed to load or parse | Network tab for 404; Console for a SyntaxError *above* this message |
| `started but did not finish initialising` | Navigation threw during `init()` | The first red error in the Console |
| `navigation finished, but … still missing` | Something removed the generated markup | Other page scripts touching `.db-main-wrapper` |

Always fix the **first** error in the console. Later errors are usually knock-on effects.

## Script hosting and caching

Stale copies are the most likely reason a merged fix "doesn't work". Know which URL Webflow loads:

- `raw.githack.com/…/main/…` follows `main`, but it is a development service: changes take minutes to appear (up to an hour for busy files), with no uptime guarantee. Purge with `curl -X DELETE 'https://raw.githack.com/purge?url=<file url>'`.
- `rawcdn.githack.com/…/main/…` is cached **permanently** by URL. A branch-name URL there will keep serving the old file indefinitely.
- `cdn.jsdelivr.net/gh/Mikes-Transport/mtw@main/…` is cached by jsDelivr and by browsers, for hours to days. Purge by swapping `cdn.` for `purge.` in the URL.

Recommended for production: load one commit-pinned URL and bump the SHA on each release:

```html
<script src="https://cdn.jsdelivr.net/gh/Mikes-Transport/mtw@<commit-sha>/apps/dashboard/js/navigation/dashboard-navigation.js"></script>
```

All other dashboard files load relative to that URL, so they all come from the same commit.

Remove any old pasted or inline copies of `dashboard-shell.js` or `dashboard-navigation.js` from the Webflow site/page custom code and embeds.

## Deploying a change

1. Open a PR. CI runs `npm run check` (parses every script) and `npm test` from `tests/` (loads the real scripts into a minimal host page).
2. Merge to `main`.
3. Update the Webflow script URL to the new commit SHA (or purge the CDN cache), then publish Webflow.
4. Run the smoke test below on the published site.

## Published-site smoke test

On the live dashboard, signed in, with DevTools open and **Disable cache** ticked:

- [ ] Network: `dashboard-navigation.js`, `dashboard-shell.js`, `developer-tools.js` and `admin-dashboard.css` each return 200, from the expected URL/commit, **once**.
- [ ] Sources: `dashboard-shell.js` contains `mtw-dashboard-navigation-ready` (proves the new version is served).
- [ ] Console: no red errors. `document.querySelectorAll('.mtw-dashboard-shell').length` → `1`.
- [ ] Header, navigation bar and Overview are visible.
- [ ] Every visible navigation item opens its tool. Tools without a migrated interface show the "has no repository-built interface yet" note.
- [ ] Overview returns to the overview.
- [ ] Normal refresh and hard refresh both render the dashboard.
- [ ] Sign in as Counter: only Counter tools are visible. Sign in as Managers: every tool, including Manager Tools.

## Migrated from Webflow

All tool panels now come from `apps/dashboard/templates/`: activity logs, secondhand stock, product information, CSV config, MTE config, promotional labels, barcode labels (with its x2/x8/x10/x30 label-sheet dropdown in the navigation), model access and change logs. The Webflow page needs no dashboard markup. The barcode panel class is `barcode-label-panels` (Webflow had renamed it `barcode-label-panels-2`, which broke the barcode tool).
