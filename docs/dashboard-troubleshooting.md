# Dashboard startup: architecture, deployment and troubleshooting

## What a host page must provide

Only this:

```html
<div data-mtw-dashboard-mount></div>   <!-- optional; without it the dashboard is appended to <body> -->
<script src="BASE/apps/dashboard/js/navigation/dashboard-navigation.js"></script>
```

`apps/dashboard/index.html` is a working minimal host. The live Webflow page must also provide:

- `window.MTW` (Firebase: `db`, `collection`, `getDocs`, …). Without it, tool settings fail to load and the built-in defaults are used.
- `apps/dashboard/js/access/admin.js`, which sends the visitor to `/admin` unless `sessionStorage.mtw_admin_logged_in === 'true'`.

No Webflow Designer wrappers, menu cards or panels are required. If legacy Webflow markup (`.db-main-wrapper` etc.) is present, it is reused instead of duplicated.

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
- [ ] Sign in as a Counter user: only Counter tools are visible.

## Not yet migrated

Tool panels such as `.barcode-label-panels`, `.product-tool-panel` and `.et-body-wrapper` are still expected to come from Webflow markup or from each tool's own script. Where a panel is missing, the dashboard shows a clear "not migrated" note instead of failing.
