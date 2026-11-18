import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './index.mjs';

const salt = 'a6742172bb7372c247c5247b23b0cc48';
const hash = 'a536c7ea372c8263ff9e1a622379fa100315efef89d6117ad176f95222ba291b';
const secret = 'test-session-secret-0123456789abcdef';
const env = {
  NEXIST_ACCESS_HASH: hash,
  NEXIST_ACCESS_SALT: salt,
  NEXIST_SESSION_SECRET: secret,
  NEXIST_ALLOWED_ORIGINS: 'https://apokolips.xyz,https://www.apokolips.xyz',
  NEON_AI_GATEWAY_BASE_URL: 'https://example-gateway.invalid',
  NEON_AI_GATEWAY_TOKEN: 'test-only-gateway-token',
};
const catalogue = { data: [
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', owned_by: 'openai', enabled: true },
  { id: 'qwen3-32b', name: 'Qwen3 32B', owned_by: 'alibaba', enabled: true },
  { id: 'gpt-5-mini', name: 'GPT 5 Mini', owned_by: 'openai', enabled: true },
  { id: 'llama-disabled', name: 'Disabled Llama', owned_by: 'meta', enabled: false },
] };

async function authenticate(handler) {
  const response = await handler(new Request('https://api.test/auth', {
    method: 'POST',
    headers: { origin: 'https://apokolips.xyz', 'content-type': 'application/json' },
    body: JSON.stringify({ password: '0911' }),
  }));
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function request(path, token, init = {}) {
  return new Request('https://api.test' + path, {
    ...init,
    headers: {
      origin: 'https://apokolips.xyz',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(init.headers || {}),
    },
  });
}

test('blocks unapproved browser origins', async () => {
  const handler = createHandler(env);
  const response = await handler(new Request('https://api.test/health', { headers: { origin: 'https://evil.test' } }));
  assert.equal(response.status, 403);
});

test('password authentication issues a short-lived API session', async () => {
  const handler = createHandler(env);
  const token = await authenticate(handler);
  assert.equal(typeof token, 'string');
  assert.equal(token.split('.').length, 2);
});

test('models route returns enabled open-weight models only', async () => {
  const handler = createHandler(env, async (url) => {
    assert.equal(String(url), env.NEON_AI_GATEWAY_BASE_URL + '/v1/models');
    return Response.json(catalogue);
  });
  const token = await authenticate(handler);
  const response = await handler(request('/models', token));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.models.map((item) => item.id), ['openai/gpt-oss-120b', 'qwen3-32b']);
});

test('AI plan response is structured and remains an unverified proposal', async () => {
  let calls = 0;
  const handler = createHandler(env, async (url, init) => {
    calls += 1;
    if (String(url).endsWith('/v1/models')) return Response.json(catalogue);
    const sent = JSON.parse(init.body);
    assert.equal(sent.model, 'openai/gpt-oss-120b');
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      goal: 'Build a community learning space',
      assumptions: ['Budget is in arbitrary planning units.'],
      risk_notes: ['Check maintenance costs.'],
      items: [
        { title: 'Devices', benefit: 8, resource_cost: 4, rationale: 'Shared devices.', depends_on_titles: [], conflicts_with_titles: [] },
        { title: 'Connectivity', benefit: 7, resource_cost: 3, rationale: 'Internet access.', depends_on_titles: ['Devices'], conflicts_with_titles: [] },
      ],
    }) } }] });
  });
  const token = await authenticate(handler);
  const response = await handler(request('/plan', token, {
    method: 'POST', body: JSON.stringify({ prompt: 'Build a community learning space', budget: 10, model: 'openai/gpt-oss-120b' }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(body.verified, false);
  assert.equal(body.plan.status, 'PROPOSAL_ONLY');
  assert.equal(body.plan.items.length, 2);
  assert.deepEqual(body.plan.items[1].depends_on_titles, ['Devices']);
});

test('rejects missing sessions on model and plan endpoints', async () => {
  const handler = createHandler(env);
  for (const path of ['/models', '/plan']) {
    const response = await handler(request(path, '', { method: path === '/models' ? 'GET' : 'POST', ...(path === '/plan' ? { body: '{}' } : {}) }));
    assert.equal(response.status, 401);
  }
});
