const encoder = new TextEncoder();
let signingKeys;

const FIREBASE_KEYS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const SPIN_WHEEL_URL =
  'https://raw.githack.com/Mikes-Transport/mtw/main/apps/website/checkout/checkout-spinwheel.js';

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
    if (!env.FIREBASE_PROJECT_ID || !env.ALLOWED_FIREBASE_UIDS) {
      return jsonResponse({ error: 'Publisher authentication is not configured.' }, 503, headers);
    }
    if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_BRANCH || !env.GITHUB_TOKEN) {
      return jsonResponse({ error: 'GitHub publishing is not configured.' }, 503, headers);
    }

    try {
      const uid = await authenticateFirebaseUser(request, env);
      const allowedUids = env.ALLOWED_FIREBASE_UIDS.split(',').map(value => value.trim()).filter(Boolean);
      if (!allowedUids.includes(uid)) {
        return jsonResponse({ error: 'This Firebase user is not allowed to publish.' }, 403, headers);
      }

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

      const config = validateConfig(body && body.config);
      if (!config || body.id !== config.id) {
        return jsonResponse({ error: 'The element configuration is invalid.' }, 400, headers);
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
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
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

async function authenticateFirebaseUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (!match) {
    throw httpError(401, 'Sign in again before publishing.');
  }

  const tokenParts = match[1].split('.');
  if (tokenParts.length !== 3) {
    throw httpError(401, 'The Firebase sign-in token is invalid.');
  }

  const header = decodeJsonPart(tokenParts[0]);
  const claims = decodeJsonPart(tokenParts[1]);
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !claims) {
    throw httpError(401, 'The Firebase sign-in token is invalid.');
  }

  const now = Math.floor(Date.now() / 1000);
  const projectId = env.FIREBASE_PROJECT_ID;
  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 60
  ) {
    throw httpError(401, 'The Firebase sign-in token has expired or is not valid for this project.');
  }

  const key = await getFirebaseSigningKey(header.kid);
  if (!key) {
    throw httpError(401, 'The Firebase sign-in token could not be verified.');
  }

  let signature;
  try {
    signature = decodeBase64Url(tokenParts[2]);
  } catch {
    throw httpError(401, 'The Firebase sign-in token is invalid.');
  }
  const signedContent = encoder.encode(`${tokenParts[0]}.${tokenParts[1]}`);
  const verified = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature,
    signedContent
  );
  if (!verified) {
    throw httpError(401, 'The Firebase sign-in token could not be verified.');
  }

  return claims.sub;
}

async function getFirebaseSigningKey(kid) {
  if (!signingKeys) {
    signingKeys = fetch(FIREBASE_KEYS_URL, {
      cf: { cacheTtl: 3600, cacheEverything: true }
    }).then(async response => {
      if (!response.ok) throw new Error(`Firebase signing keys request failed: ${response.status}`);
      const body = await response.json();
      return new Map((body.keys || []).filter(key => key.kid).map(key => [key.kid, key]));
    }).catch(error => {
      signingKeys = null;
      throw error;
    });
  }

  let keys = await signingKeys;
  if (!keys.has(kid)) {
    signingKeys = null;
    keys = await getFirebaseSigningKeySet();
  }
  const jwk = keys.get(kid);
  return jwk
    ? crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    : null;
}

async function getFirebaseSigningKeySet() {
  signingKeys = fetch(FIREBASE_KEYS_URL, {
    cf: { cacheTtl: 0, cacheEverything: true }
  }).then(async response => {
    if (!response.ok) throw new Error(`Firebase signing keys refresh failed: ${response.status}`);
    const body = await response.json();
    return new Map((body.keys || []).filter(key => key.kid).map(key => [key.kid, key]));
  }).catch(error => {
    signingKeys = null;
    throw error;
  });
  return signingKeys;
}

function decodeJsonPart(part) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(part)));
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
