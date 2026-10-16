const encoder = new TextEncoder();

const SPIN_WHEEL_URL =
  'https://raw.githack.com/Mikes-Transport/mtw/main/apps/website/checkout/checkout-spinwheel.js';
const MENU_TEMPLATE = 'dashboard-menu-item';
const MENU_REGISTRY_PATH = 'apps/dashboard/js/custom-elements/generated-admin-menus.js';
const MENU_ROLES = ['Counter', 'Stores', 'KeyAccounts', 'Admin', 'Developer'];
const RESERVED_MENU_IDS = new Set([
  'activity-logs', 'secondhand-tool', 'product-info', 'csv-config',
  'mte-config', 'promotion-label', 'barcodes', 'model-tool-access',
  'custom-web-element', 'exit-btn'
]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env.DASHBOARD_ORIGIN);

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin, env.DASHBOARD_ORIGIN)) {
        return jsonResponse({ error: 'Origin is not allowed.' }, 403, headers);
      }
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
    }
    if (!isAllowedOrigin(origin, env.DASHBOARD_ORIGIN)) {
      return jsonResponse({ error: 'Origin is not allowed.' }, 403, headers);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, headers);
    }
    if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_BRANCH || !env.GITHUB_TOKEN) {
      return jsonResponse({ error: 'GitHub publishing is not configured.' }, 503, headers);
    }

    try {
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > 32768) {
        return jsonResponse({ error: 'The element configuration is too large.' }, 413, headers);
      }
      const bodyText = await request.text();
      if (bodyText.length > 32768) {
        return jsonResponse({ error: 'The element configuration is too large.' }, 413, headers);
      }

      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return jsonResponse({ error: 'The request body must be valid JSON.' }, 400, headers);
      }

      const config = body && body.config && body.config.templateId === MENU_TEMPLATE
        ? validateMenuConfig(body.config)
        : validateConfig(body && body.config);
      if (!config || body.id !== config.id) {
        return jsonResponse({ error: 'The element configuration is invalid.' }, 400, headers);
      }

      if (config.templateId === MENU_TEMPLATE) {
        const registry = await readMenuRegistry(env);
        const existingIndex = registry.findIndex(item => item.id === config.id);
        const menu = {
          id: config.id,
          title: config.title,
          allowedRoles: config.allowedRoles,
          panelTemplate: config.panelTemplate
        };
        if (existingIndex >= 0) registry[existingIndex] = menu;
        else registry.push(menu);
        registry.sort((a, b) => a.title.localeCompare(b.title));
        const path = MENU_REGISTRY_PATH;
        const result = await publishFile(path, generatedMenuRegistry(registry), env);
        return jsonResponse({
          ok: true,
          path,
          url: `https://raw.githack.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${path}`,
          commit: result.commit
        }, 200, headers);
      }

      const path = `apps/website/custom-elements/custom-element-${config.id}.js`;
      const file = generatedFile(config);
      const result = await publishFile(path, file, env);

      return jsonResponse({
        ok: true,
        path,
        url: `https://raw.githack.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${path}`,
        commit: result.commit
      }, 200, headers);
    } catch (error) {
      console.error('[custom-element-publisher] publish failed:', error && error.message ? error.message : 'Unknown error');
      return jsonResponse({ error: error && error.publicMessage ? error.publicMessage : 'The element could not be published.' }, error && error.statusCode ? error.statusCode : 500, headers);
    }
  }
};

function corsHeaders(origin, allowedOrigin) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin && origin === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

function isAllowedOrigin(origin, allowedOrigin) {
  return !!origin && !!allowedOrigin && origin === allowedOrigin;
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function validateConfig(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const id = typeof value.id === 'string' ? value.id : '';
  if (!/^[a-z0-9-]{1,80}$/i.test(id)) return null;
  if (!Array.isArray(value.prizes) || value.prizes.length < 2 || value.prizes.length > 16) return null;

  const textFields = [
    ['eyebrow', 80],
    ['titleTop', 35],
    ['titleBottom', 35],
    ['subtitle', 100],
    ['centreLabel', 12],
    ['buttonTop', 32],
    ['buttonBottom', 32],
    ['finePrint', 120]
  ];
  const config = { id, version: 1 };
  for (const [field, maxLength] of textFields) {
    const text = value[field] == null ? '' : value[field];
    if (typeof text !== 'string' || text.length > maxLength) return null;
    config[field] = text;
  }

  for (const field of ['background', 'accent']) {
    if (typeof value[field] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[field])) return null;
    config[field] = value[field];
  }
  if (typeof value.dailyLimit !== 'boolean' || typeof value.logSpins !== 'boolean') return null;
  config.dailyLimit = value.dailyLimit;
  config.logSpins = value.logSpins;

  let totalChance = 0;
  config.prizes = value.prizes.map(prize => {
    if (!prize || typeof prize !== 'object') return null;
    if (typeof prize.label !== 'string' || !prize.label.trim() || prize.label.length > 32) return null;
    if (typeof prize.code !== 'string' || prize.code.length > 50) return null;
    if (typeof prize.value !== 'string' || prize.value.length > 60) return null;
    if (!Number.isFinite(prize.chance) || prize.chance < 0 || prize.chance > 100) return null;
    if (typeof prize.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(prize.color)) return null;
    if (typeof prize.textColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(prize.textColor)) return null;
    totalChance += prize.chance;
    return {
      label: prize.label,
      value: prize.value,
      code: prize.code,
      chance: prize.chance,
      color: prize.color,
      textColor: prize.textColor
    };
  });
  if (config.prizes.some(prize => !prize) || Math.abs(totalChance - 100) > 0.01) return null;
  return config;
}

function validateMenuConfig(value) {
  if (!value || typeof value !== 'object' || value.version !== 1) return null;
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const id = typeof value.id === 'string' ? value.id : '';
  const normalizedId = title.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!title || title.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ||
      id !== normalizedId || RESERVED_MENU_IDS.has(id)) return null;
  if (!Array.isArray(value.allowedRoles) || value.allowedRoles.length < 1 ||
      value.allowedRoles.some(role => !MENU_ROLES.includes(role)) ||
      new Set(value.allowedRoles).size !== value.allowedRoles.length) return null;
  if (value.panelTemplate !== 'blank') return null;
  return {
    id,
    templateId: MENU_TEMPLATE,
    version: 1,
    title,
    allowedRoles: value.allowedRoles.slice(),
    panelTemplate: 'blank'
  };
}

async function readMenuRegistry(env) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${MENU_REGISTRY_PATH}`;
  const response = await fetch(`${endpoint}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'MTW-Custom-Element-Publisher'
    }
  });
  if (response.status === 404) return [];
  if (!response.ok) throw httpError(502, 'GitHub could not read the generated dashboard menu registry.');
  const file = await response.json();
  if (typeof file.content !== 'string') {
    throw httpError(502, 'The generated dashboard menu registry has an unexpected format.');
  }
  let source;
  try {
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), character => character.charCodeAt(0));
    source = new TextDecoder().decode(bytes);
  } catch {
    throw httpError(502, 'The generated dashboard menu registry could not be decoded.');
  }
  const match = source.match(/^\/\* Generated by MTW Custom Web Element Builder\. \*\/\s*window\.MTW_ADMIN_MENUS\s*=\s*(\[[\s\S]*\]);\s*$/);
  if (!match) throw httpError(502, 'The generated dashboard menu registry has an unexpected format.');
  let registry;
  try {
    registry = JSON.parse(match[1]);
  } catch {
    throw httpError(502, 'The generated dashboard menu registry contains invalid data.');
  }
  const menuIds = new Set();
  if (!Array.isArray(registry) || registry.some(item => {
    if (!item || !validateMenuConfig({ ...item, version: 1 }) || menuIds.has(item.id)) return true;
    menuIds.add(item.id);
    return false;
  })) {
    throw httpError(502, 'The generated dashboard menu registry contains invalid entries.');
  }
  return registry;
}

function generatedMenuRegistry(registry) {
  return `/* Generated by MTW Custom Web Element Builder. */\n` +
    `window.MTW_ADMIN_MENUS = ${JSON.stringify(registry, null, 2)};\n`;
}

function generatedFile(config) {
  const payload = JSON.stringify(config, null, 2);
  return `/* Generated by MTW Custom Web Element Builder. */\n` +
    `(function () {\n  'use strict';\n` +
    `  var config = ${payload};\n` +
    `  var currentScript = document.currentScript;\n` +
    `  var mount = document.createElement('div');\n` +
    `  mount.id = 'mtw-spin-wheel';\n` +
    `  if (currentScript && currentScript.parentNode) {\n` +
    `    currentScript.parentNode.insertBefore(mount, currentScript.nextSibling);\n` +
    `  } else {\n` +
    `    document.body.appendChild(mount);\n` +
    `  }\n` +
    `  var runtime = document.createElement('script');\n` +
    `  runtime.src = ${JSON.stringify(SPIN_WHEEL_URL)};\n` +
    `  runtime.dataset.mtwConfig = encodeURIComponent(JSON.stringify(config));\n` +
    `  (document.head || document.body).appendChild(runtime);\n` +
    `})();\n`;
}

async function publishFile(path, contents, env) {
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'MTW-Custom-Element-Publisher'
  };
  const current = await fetch(`${endpoint}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, { headers });
  let sha;
  if (current.ok) {
    const file = await current.json();
    sha = file.sha;
  } else if (current.status !== 404) {
    throw httpError(502, 'GitHub could not check the existing generated file.');
  }

  const bytes = encoder.encode(contents);
  let binary = '';
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  const requestBody = {
    message: `Publish custom web element ${path.split('/').pop()}`,
    content: btoa(binary),
    branch: env.GITHUB_BRANCH
  };
  if (sha) requestBody.sha = sha;

  const published = await fetch(endpoint, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  if (!published.ok) {
    throw httpError(502, 'GitHub rejected the generated file. Check the repository token and branch settings.');
  }
  const result = await published.json();
  return { commit: result.commit && result.commit.sha ? result.commit.sha : null };
}

function httpError(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}
