# MTW Dashboard

The dashboard shell, navigation and tool registry are built entirely by code in this folder. A host page needs one script tag. See `index.html` for a minimal host.

- Startup, deployment, caching and troubleshooting: [`docs/dashboard-troubleshooting.md`](../../docs/dashboard-troubleshooting.md)
- Tests: `cd tests && npm install && npm run check && npm test`. (Test tooling lives in `tests/` so the repository root has no `package.json`; a root lockfile broke the Cloudflare Worker build.)
