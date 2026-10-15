import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';

const dashboardOrigin = 'https://dashboard.example.com';
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

test('commits validated wheel files to the fixed GitHub path without Firebase auth', async () => {
  let existingSha = '';
  const requests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (init.method === 'PUT') {
      return Response.json({ commit: { sha: 'published-commit' } }, { status: 201 });
    }
    return existingSha
      ? Response.json({ sha: existingSha })
      : Response.json({ message: 'Not Found' }, { status: 404 });
  };

  try {
    const env = {
      GITHUB_OWNER: 'Mikes-Transport',
      GITHUB_REPO: 'mtw',
      GITHUB_BRANCH: 'main',
      GITHUB_TOKEN: 'test-token',
      DASHBOARD_ORIGIN: dashboardOrigin
    };

    const createResponse = await worker.fetch(makeRequest(config), env);
    const createResult = await createResponse.json();
    assert.equal(createResponse.status, 200);
    assert.equal(createResult.ok, true);
    assert.equal(createResult.url, 'https://raw.githack.com/Mikes-Transport/mtw/main/apps/website/custom-elements/custom-element-wheel-test-123.js');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].init.headers.Authorization, 'Bearer test-token');

    const createBody = JSON.parse(requests[1].init.body);
    assert.equal(createBody.sha, undefined);
    const generated = Buffer.from(createBody.content, 'base64').toString('utf8');
    assert.match(generated, /MYSTERY/);
    assert.match(generated, /checkout-spinwheel\.js/);
    assert.doesNotThrow(() => new Function(generated));
    assert.equal(requests[1].url.includes('/custom-element-wheel-test-123.js'), true);

    existingSha = 'existing-file-sha';
    requests.length = 0;
    const updateResponse = await worker.fetch(makeRequest(config), env);
    const updateResult = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updateResult.ok, true);
    assert.equal(JSON.parse(requests[1].init.body).sha, existingSha);

    requests.length = 0;
    const invalidConfig = { ...config, id: '../other-file' };
    const invalidResponse = await worker.fetch(makeRequest(invalidConfig), env);
    assert.equal(invalidResponse.status, 400);
    assert.equal(requests.length, 0);

    const invalidOriginResponse = await worker.fetch(makeRequest(config, 'https://untrusted.example'), env);
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

function makeRequest(payload, origin = dashboardOrigin) {
  return new Request('https://publisher.example.com/publish', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: payload.id, config: payload })
  });
}
