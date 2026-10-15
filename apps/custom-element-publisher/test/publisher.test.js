import assert from 'node:assert/strict';
import { generateKeyPair, sign } from 'node:crypto';
import { test } from 'node:test';
import worker from '../src/index.js';

const dashboardOrigin = 'https://dashboard.example.com';
const projectId = 'mtw-dashboard-test';
const uid = 'publisher-user-1';
const config = {
  id: 'wheel-test-123',
  version: 1,
  eyebrow: 'MTW',
  titleTop: 'MYSTERY',
  titleBottom: 'GIVEAWAY',
  subtitle: 'Spin to win',
  centreLabel: 'SPIN',
  buttonTop: 'SPIN THE WHEEL',
  buttonBottom: 'WIN SOMETHING',
  finePrint: '',
  background: '#07110b',
  accent: '#22c55e',
  dailyLimit: true,
  logSpins: false,
  prizes: [
    { label: 'NO PRIZE', value: 'NO PRIZE', code: '', chance: 50, color: '#17171c', textColor: '#ffffff' },
    { label: 'PRIZE', value: 'PRIZE', code: 'PRIZE-1', chance: 50, color: '#22c55e', textColor: '#ffffff' }
  ]
};

test('publishes only an authenticated, allowlisted configuration to the fixed GitHub path', async () => {
  const { privateKey, publicKey } = await new Promise((resolve, reject) => {
    generateKeyPair('rsa', {
      modulusLength: 2048,
      publicExponent: 0x10001
    }, (error, publicKey, privateKey) => {
      if (error) reject(error);
      else resolve({ publicKey, privateKey });
    });
  });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'test-firebase-key';
  jwk.alg = 'RS256';
  let existingSha = '';
  const requests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('securetoken@system.gserviceaccount.com')) {
      return Response.json({ keys: [jwk] });
    }
    requests.push({ url, init });
    if (init.method === 'PUT') {
      return Response.json({ commit: { sha: 'published-commit' } }, { status: 201 });
    }
    return existingSha
      ? Response.json({ sha: existingSha })
      : Response.json({ message: 'Not Found' }, { status: 404 });
  };

  try {
    const token = createFirebaseToken(privateKey, uid);
    const env = {
      FIREBASE_PROJECT_ID: projectId,
      ALLOWED_FIREBASE_UIDS: uid,
      GITHUB_OWNER: 'Mikes-Transport',
      GITHUB_REPO: 'mtw',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'test-token',
      DASHBOARD_ORIGIN: dashboardOrigin
    };

    const createResponse = await worker.fetch(makeRequest(token, config), env);
    const createResult = await createResponse.json();
    assert.equal(createResponse.status, 200);
    assert.equal(createResult.ok, true);
    assert.equal(createResult.url, 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/website/custom-elements/custom-element-wheel-test-123.js');
    assert.equal(requests.length, 2);

    const createBody = JSON.parse(requests[1].init.body);
    assert.equal(createBody.sha, undefined);
    const generated = Buffer.from(createBody.content, 'base64').toString('utf8');
    assert.match(generated, /MYSTERY/);
    assert.match(generated, /checkout-spinwheel\.js/);
    assert.doesNotThrow(() => new Function(generated));
    assert.equal(requests[1].url.includes('/custom-element-wheel-test-123.js'), true);

    existingSha = 'existing-file-sha';
    requests.length = 0;
    const updateResponse = await worker.fetch(makeRequest(token, config), env);
    const updateResult = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updateResult.ok, true);
    assert.equal(JSON.parse(requests[1].init.body).sha, existingSha);

    requests.length = 0;
    const deniedToken = createFirebaseToken(privateKey, 'not-allowlisted-user');
    const deniedResponse = await worker.fetch(makeRequest(deniedToken, config), env);
    assert.equal(deniedResponse.status, 403);
    assert.equal(requests.length, 0);

    const invalidConfig = { ...config, id: '../other-file' };
    const invalidResponse = await worker.fetch(makeRequest(token, invalidConfig), env);
    assert.equal(invalidResponse.status, 400);
    assert.equal(requests.length, 0);

    const invalidOriginResponse = await worker.fetch(makeRequest(token, config, 'https://untrusted.example'), env);
    assert.equal(invalidOriginResponse.status, 403);
    assert.equal(requests.length, 0);

    const preflightResponse = await worker.fetch(new Request('https://publisher.example.com/', {
      method: 'OPTIONS',
      headers: { Origin: dashboardOrigin }
    }), env);
    assert.equal(preflightResponse.status, 204);
    assert.equal(preflightResponse.headers.get('Access-Control-Allow-Origin'), dashboardOrigin);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function makeRequest(token, payload, origin = dashboardOrigin) {
  return new Request('https://publisher.example.com/publish', {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: payload.id, config: payload })
  });
}

function createFirebaseToken(privateKey, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-firebase-key' }));
  const claims = base64Url(JSON.stringify({
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: subject,
    iat: now,
    exp: now + 3600
  }));
  const content = `${header}.${claims}`;
  const signature = sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url');
  return `${content}.${signature}`;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}
