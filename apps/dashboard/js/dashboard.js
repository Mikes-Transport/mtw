// MTW dashboard entry point. The host page (Webflow or anything else) needs only:
//
//   <script type="module" src="https://…/apps/dashboard/js/dashboard.js"></script>
//
// It first checks the sign-in (access/session-guard.js): signed-out visitors are sent to
// /admin and see nothing. Everything else (Firebase, styles, panel markup, navigation, shell and every tool
// script) loads from the same base URL as this file, so all of it comes from the same
// commit. See docs/dashboard-troubleshooting.md.

const BASE = new URL('../', import.meta.url).href; // …/apps/dashboard/

// Panel markup, one file per tool in apps/dashboard/templates/.
const TEMPLATES = [
  'change-logs',
  'activity-logs',
  'secondhand-tool',
  'product-info',
  'csv-config',
  'mte-config',
  'promotion-label',
  'barcodes',
  'model-tool-access'
];

// Tool scripts, in the order the Webflow page used to import them. They are ES
// modules (each declares `const { db, $ } = window.MTW` at the top level).
const TOOL_SCRIPTS = [
  'activity/change-logs.js',
  'activity/activity-logs.js',
  'inventory/secondhand-stock.js',
  'config/csv-config.js',
  'products/products.js',
  'config/mte-config.js',
  'products/promotion-cards.js',
  'inventory/barcodes.js',
  'config/model-access.js',
  // Timesheet is its own app (apps/timesheet); the dashboard loads it as a tool.
  '../../timesheet/js/timesheet-core.js',
  '../../timesheet/js/timesheet.js'
];

// What a share link loads: only its tool (no other panels, scripts or data reads).
const SHARE_ASSETS = {
  timesheet: {
    templates: [],
    scripts: ['../../timesheet/js/timesheet-core.js', '../../timesheet/js/timesheet.js']
  }
};

function stylesheet(href) {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.onerror = () => console.error('[dashboard] failed to load stylesheet:', href);
  document.head.appendChild(link);
}

async function loadTemplates(ids) {
  const loaded = await Promise.all(ids.map(async id => {
    const url = `${BASE}templates/${id}.html`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return [id, await response.text()];
    } catch (error) {
      console.error(`[dashboard] could not load the ${id} panel from ${url}:`, error);
      return null;
    }
  }));
  window.MTW_DASHBOARD_TEMPLATES = Object.fromEntries(loaded.filter(Boolean));
}

async function start() {
  if (window.MTW_DASHBOARD_LOADER_STARTED) return;
  window.MTW_DASHBOARD_LOADER_STARTED = true;
  window.MTW_DASHBOARD_BASE_URL = BASE;

  // Access, before anything else loads:
  //   ?share=<token>  a manager's share link: only that tool, no sign-in (its PIN still applies);
  //   otherwise       signed out (no sign-in this browser session) => hidden, sent to /admin.
  await import('./access/session-guard.js');
  const guard = window.MTW_SESSION_GUARD;
  const token = guard.shareToken(window.location);
  let share = null;
  if (token) {
    guard.hide(window);
    if (!window.MTW || !window.MTW.db) await import('./firebase.js');
    share = await guard.validateShare(token, window.MTW);
    if (!share) {
      window.location.replace(guard.LOGIN_URL);
      return;
    }
    window.MTW_DASHBOARD_SHARE = share;
    guard.show(window);
  } else if (!guard.guard(window)) {
    return;
  }

  stylesheet('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&display=swap');
  stylesheet(`${BASE}styles/tools.css`);
  stylesheet(new URL('../timesheet/css/timesheet.css', BASE).href);

  if (!window.MTW || !window.MTW.db) await import('./firebase.js');
  await loadTemplates(share ? SHARE_ASSETS[share.tool].templates : TEMPLATES);

  // Builds the markup, installs the panels, then loads the shell and theme.
  await import('./navigation/dashboard-navigation.js');

  for (const path of (share ? SHARE_ASSETS[share.tool].scripts : TOOL_SCRIPTS)) {
    try {
      await import(`./${path}`);
    } catch (error) {
      console.error(`[dashboard] tool script failed to load: ${path}`, error);
    }
  }
  if (share && typeof window.openDBTool === 'function') window.openDBTool(share.tool);
  document.dispatchEvent(new CustomEvent('mtw-dashboard-loaded'));
}

start().catch(error => console.error('[dashboard] startup failed:', error));
