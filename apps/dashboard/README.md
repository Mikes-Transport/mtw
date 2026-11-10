# MTW Dashboard

Everything in the dashboard is built from this folder. The host page needs one tag:

```html
<script type="module" src="https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/js/dashboard.js"></script>
```

- `js/dashboard.js`: entry point (Firebase, styles, templates, navigation, tool scripts)
- `templates/`: one HTML file per tool panel
- `styles/`: `admin-dashboard.css` (shell, navigation) and `tools.css` (tool panels)
- `assets/`: fonts and label sheet images

Startup, deployment, caching and troubleshooting: [`docs/dashboard-troubleshooting.md`](../../docs/dashboard-troubleshooting.md).
Tests: `cd tests && npm install && npm run check && npm test`.
