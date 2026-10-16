const encoder = new TextEncoder();

const SPIN_WHEEL_URL =
  'https://raw.githack.com/Mikes-Transport/mtw/main/apps/website/checkout/checkout-spinwheel.js';
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const AI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    assistantMessage: { type: 'string' },
    title: { type: 'string' },
    html: { type: 'string' },
    css: { type: 'string' },
    js: { type: 'string' },
    editableFields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string', enum: ['text', 'color', 'number', 'boolean'] },
          defaultValue: { type: ['string', 'number', 'boolean'] }
        },
        required: ['key', 'label', 'type', 'defaultValue']
      }
    }
  },
  required: ['assistantMessage', 'title', 'html', 'css', 'js', 'editableFields']
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = configuredOrigins(env);
    const headers = corsHeaders(origin, allowedOrigins);

    if (request.method === 'OPTIONS') {
      if (!allowedOrigins.has(origin)) {
        return jsonResponse({ error: 'Origin is not allowed.' }, 403, headers);
      }
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405, headers);
    }
    if (!allowedOrigins.has(origin)) {
      return jsonResponse({ error: 'Origin is not allowed.' }, 403, headers);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, headers);
    }

    try {
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > 49152) {
        return jsonResponse({ error: 'The request is too large.' }, 413, headers);
      }
      const bodyText = await request.text();
      if (bodyText.length > 49152) {
        return jsonResponse({ error: 'The request is too large.' }, 413, headers);
      }

      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return jsonResponse({ error: 'The request body must be valid JSON.' }, 400, headers);
      }

      if (new URL(request.url).pathname === '/ai/draft') {
        if (!env.AI || typeof env.AI.run !== 'function') {
          return jsonResponse({ error: 'Workers AI is not configured.' }, 503, headers);
        }
        const conversation = validateConversation(body && body.messages, body && body.draft);
        if (!conversation) {
          return jsonResponse({ error: 'The conversation is invalid or too large.' }, 400, headers);
        }
        const generated = await generateDraft(conversation, env.AI);
        if (!generated) {
          return jsonResponse({ error: 'The AI response did not match the required template format. Please try again.' }, 502, headers);
        }
        return jsonResponse({ ok: true, draft: generated }, 200, headers);
      }

      if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_BRANCH || !env.GITHUB_TOKEN) {
        return jsonResponse({ error: 'GitHub publishing is not configured.' }, 503, headers);
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
      const isAiRequest = new URL(request.url).pathname === '/ai/draft';
      console.error(`[custom-element-publisher] ${isAiRequest ? 'AI generation' : 'publish'} failed:`, error && error.message ? error.message : 'Unknown error');
      const publicMessage = error && error.publicMessage
        ? error.publicMessage
        : isAiRequest
          ? 'Workers AI generation failed. Check the Worker binding and daily free allocation.'
          : 'The element could not be published.';
      return jsonResponse({ error: publicMessage }, error && error.statusCode ? error.statusCode : (isAiRequest ? 502 : 500), headers);
    }
  }
};

function validateConversation(messages, draft) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 8) return null;
  let totalLength = 0;
  const validMessages = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' || !message.content.trim() ||
        message.content.length > 2000) return null;
    totalLength += message.content.length;
    validMessages.push({ role: message.role, content: message.content });
  }
  if (totalLength > 10000) return null;

  let validDraft = null;
  if (draft != null) {
    validDraft = validateDraft(draft);
    if (!validDraft) return null;
  }
  return { messages: validMessages, draft: validDraft };
}

function validateDraft(value) {
  if (!value || typeof value !== 'object') return null;
  const strings = ['title', 'assistantMessage', 'html', 'css', 'js'];
  const draft = {};
  for (const field of strings) {
    if (typeof value[field] !== 'string' || value[field].length > 16000) return null;
    draft[field] = value[field];
  }
  if (draft.title.length > 100 || draft.assistantMessage.length > 1200) return null;
  if (!draft.title.trim() || !draft.assistantMessage.trim() || !draft.html.trim()) return null;
  if (draft.html.length + draft.css.length + draft.js.length > 36000) return null;
  if (!Array.isArray(value.editableFields) || value.editableFields.length > 12) return null;
  const keys = new Set();
  draft.editableFields = [];
  for (const field of value.editableFields) {
    if (!field || typeof field !== 'object' ||
        typeof field.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(field.key) ||
        keys.has(field.key) || typeof field.label !== 'string' || !field.label.trim() ||
        field.label.length > 80 || !['text', 'color', 'number', 'boolean'].includes(field.type)) return null;
    keys.add(field.key);
    if (field.type === 'text' && (typeof field.defaultValue !== 'string' || field.defaultValue.length > 300)) return null;
    if (field.type === 'color' && (typeof field.defaultValue !== 'string' || !/^#[0-9a-f]{6}$/i.test(field.defaultValue))) return null;
    if (field.type === 'number' && (!Number.isFinite(field.defaultValue) || Math.abs(field.defaultValue) > 100000)) return null;
    if (field.type === 'boolean' && typeof field.defaultValue !== 'boolean') return null;
    const source = `${draft.html}\n${draft.css}\n${draft.js}`;
    if (!source.includes(`{{field:${field.key}}}`) &&
        !source.includes(`MTW_SETTINGS["${field.key}"]`) &&
        !source.includes(`MTW_SETTINGS['${field.key}']`)) return null;
    draft.editableFields.push({
      key: field.key,
      label: field.label.trim(),
      type: field.type,
      defaultValue: field.defaultValue
    });
  }
  return draft;
}

async function generateDraft(conversation, ai) {
  const systemPrompt = [
    'You create a draft custom web element for a small business dashboard.',
    'Return the requested JSON object only. The HTML is a body fragment, CSS is scoped under a unique root class, and JavaScript is optional.',
    'Create original, self-contained HTML/CSS/JavaScript. Do not load external scripts, fonts, images, or libraries.',
    'This is a visual prototype, not a production checkout integration. Never claim to connect to a real order, payment, account, database, or reward system. Use simulated interactions only.',
    'Do not use network requests, cookies, localStorage, sessionStorage, or browser navigation.',
    'Provide up to 12 editableFields with key, label, type (text, color, number, boolean), and defaultValue.',
    'Use {{field:key}} placeholders in HTML text/attribute values and CSS values when an editable field should control the design. JavaScript can read window.MTW_SETTINGS["key"].',
    'Use a unique root class in the HTML and scope all CSS to it. Keep the design responsive and accessible.',
    'When given an existing draft, refine it while preserving unrelated working parts.',
    conversation.draft ? `Existing draft JSON:\n${JSON.stringify(conversation.draft)}` : ''
  ].filter(Boolean).join('\n');

  const response = await ai.run(AI_MODEL, {
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversation.messages
    ],
    max_tokens: 3500,
    response_format: {
      type: 'json_schema',
      json_schema: AI_RESPONSE_SCHEMA
    }
  });
  let output = response && response.response != null ? response.response : response;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return null;
    }
  }
  return validateDraft(output);
}

function configuredOrigins(env) {
  return new Set(
    [env.DASHBOARD_ORIGIN, env.DASHBOARD_ORIGINS]
      .filter(Boolean)
      .flatMap(value => value.split(','))
      .map(value => value.trim())
      .filter(Boolean)
  );
}

function corsHeaders(origin, allowedOrigins) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
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
