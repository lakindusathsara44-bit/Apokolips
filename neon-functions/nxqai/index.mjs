import {
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const OPEN_WEIGHT_ID = /(gpt-oss|llama|deepseek|qwen|mistral|mixtral|gemma|phi[-.]|olmo|falcon|command-r|starcoder|codestral|jamba|internlm|dbrx|granite|aya[-.])/i;
const MAX_BODY_BYTES = 8_000;
const SESSION_TTL_MS = 15 * 60 * 1000;
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_ATTEMPTS = 6;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function parseOrigins(env) {
  const value = env.NEXIST_ALLOWED_ORIGINS || 'https://apokolips.xyz,https://www.apokolips.xyz';
  return new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
}

function requestKey(request) {
  const candidate = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || 'unknown';
  return candidate.split(',')[0].trim().slice(0, 100);
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function issueSession(secret, now) {
  const payload = encode(JSON.stringify({
    scope: 'nexist-q-intelligence',
    expires: now + SESSION_TTL_MS,
    nonce: randomBytes(16).toString('hex'),
  }));
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function validSession(token, secret, now) {
  if (typeof token !== 'string' || token.length > 2048) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const received = Buffer.from(parts[1], 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.scope === 'nexist-q-intelligence'
      && Number.isFinite(payload.expires)
      && payload.expires > now;
  } catch {
    return false;
  }
}

function bearerToken(request) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function readJson(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > MAX_BODY_BYTES) return { error: 'The request is too large.' };
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return { error: 'The request is too large.' };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'A JSON object is required.' };
    }
    return { value };
  } catch {
    return { error: 'The request body must be valid JSON.' };
  }
}

function modelRows(catalog) {
  const items = Array.isArray(catalog?.data) ? catalog.data : [];
  return items
    .filter((model) => model && model.enabled === true && typeof model.id === 'string' && OPEN_WEIGHT_ID.test(model.id))
    .map((model) => ({
      id: model.id.slice(0, 180),
      name: String(model.name || model.id).slice(0, 120),
      provider: String(model.owned_by || 'open-weight provider').slice(0, 60),
    }))
    .slice(0, 40);
}

function extractJson(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('The AI model returned an empty response.');
  const text = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const finish = text.lastIndexOf('}');
  if (start < 0 || finish <= start) throw new Error('The AI model did not return the requested JSON structure.');
  return JSON.parse(text.slice(start, finish + 1));
}

function normalizePlan(raw, prompt, budget) {
  const source = Array.isArray(raw?.items) ? raw.items : [];
  if (source.length < 2 || source.length > 10) {
    throw new Error('The AI plan must contain between 2 and 10 candidates.');
  }
  const titles = new Set();
  const items = source.map((item) => {
    const title = String(item?.title || '').trim().slice(0, 90);
    const benefit = Number(item?.benefit);
    const resourceCost = Number(item?.resource_cost);
    if (!title || titles.has(title.toLowerCase())) throw new Error('The AI returned a missing or duplicate candidate title.');
    if (!Number.isFinite(benefit) || benefit < 0 || benefit > 1000) throw new Error('Candidate benefit must be between 0 and 1000.');
    if (!Number.isFinite(resourceCost) || resourceCost < 0 || resourceCost > 1_000_000_000) throw new Error('Candidate resource cost is outside the supported range.');
    titles.add(title.toLowerCase());
    return {
      title,
      benefit,
      resource_cost: resourceCost,
      rationale: String(item?.rationale || '').trim().slice(0, 420),
      depends_on_titles: Array.isArray(item?.depends_on_titles)
        ? item.depends_on_titles.slice(0, 10).map((value) => String(value).slice(0, 90)) : [],
      conflicts_with_titles: Array.isArray(item?.conflicts_with_titles)
        ? item.conflicts_with_titles.slice(0, 10).map((value) => String(value).slice(0, 90)) : [],
    };
  });
  const validTitles = new Set(items.map((item) => item.title.toLowerCase()));
  for (const item of items) {
    item.depends_on_titles = item.depends_on_titles.filter((name) => validTitles.has(name.toLowerCase()) && name.toLowerCase() !== item.title.toLowerCase());
    item.conflicts_with_titles = item.conflicts_with_titles.filter((name) => validTitles.has(name.toLowerCase()) && name.toLowerCase() !== item.title.toLowerCase());
  }
  return {
    goal: String(raw?.goal || prompt).trim().slice(0, 500),
    items,
    assumptions: Array.isArray(raw?.assumptions) ? raw.assumptions.slice(0, 8).map((value) => String(value).slice(0, 220)) : [],
    risk_notes: Array.isArray(raw?.risk_notes) ? raw.risk_notes.slice(0, 8).map((value) => String(value).slice(0, 220)) : [],
    budget,
    status: 'PROPOSAL_ONLY',
    provenance: 'AI-generated proposal; not evidence, verification, authorization, or a prediction.',
  };
}

export function createHandler(env = process.env, fetcher = fetch, clock = () => Date.now()) {
  const failures = new Map();
  const allowedOrigins = parseOrigins(env);

  async function gateway(path, options = {}) {
    const base = String(env.NEON_AI_GATEWAY_BASE_URL || '').replace(/\/$/, '');
    const token = env.NEON_AI_GATEWAY_TOKEN;
    if (!base || !token) throw new Error('The AI Gateway is not configured for this service.');
    return fetcher(`${base}/v1${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) },
      signal: options.signal || AbortSignal.timeout(45_000),
    });
  }

  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (origin && !allowedOrigins.has(origin)) return json({ error: 'Origin not allowed.' }, 403);
    const cors = origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '600',
      vary: 'Origin',
    } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const now = clock();

    if (request.method === 'GET' && path === '/health') {
      const configured = Boolean(env.NEON_AI_GATEWAY_BASE_URL && env.NEON_AI_GATEWAY_TOKEN);
      return json({
        status: configured ? 'ready' : 'setup_required',
        provider: 'Neon AI Gateway',
        model: 'Dynamically selected enabled open-weight model',
        authentication: 'short-lived server-side session required for model calls',
      }, 200, cors);
    }

    if (request.method === 'POST' && path === '/auth') {
      const key = requestKey(request);
      const record = failures.get(key) || { count: 0, started: now };
      if (now - record.started > AUTH_WINDOW_MS) { record.count = 0; record.started = now; }
      if (record.count >= AUTH_ATTEMPTS) return json({ error: 'Too many attempts. Please try again later.' }, 429, cors);
      const parsed = await readJson(request);
      if (parsed.error) return json({ error: parsed.error }, 400, cors);
      const password = parsed.value.password;
      if (typeof password !== 'string' || password.length > 64) return json({ error: 'Invalid access request.' }, 400, cors);
      const { NEXIST_ACCESS_HASH: hash, NEXIST_ACCESS_SALT: salt, NEXIST_SESSION_SECRET: secret } = env;
      if (!hash || !salt || !secret) return json({ error: 'Private access service is not configured.' }, 503, cors);
      const actual = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 210_000, 32, 'sha256');
      const expected = Buffer.from(hash, 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
        record.count += 1;
        failures.set(key, record);
        return json({ error: 'Incorrect project password.' }, 401, cors);
      }
      failures.delete(key);
      return json({ token: issueSession(secret, now), expiresInSeconds: SESSION_TTL_MS / 1000 }, 200, cors);
    }

    if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, cors);
    const secret = env.NEXIST_SESSION_SECRET;
    if (!secret || !validSession(bearerToken(request), secret, now)) {
      return json({ error: 'Your project session expired. Unlock the project again.' }, 401, cors);
    }

    if (request.method === 'GET' && path === '/models') {
      try {
        const response = await gateway('/models');
        if (!response.ok) return json({ error: `The AI model catalogue is unavailable (${response.status}).` }, 502, cors);
        const models = modelRows(await response.json());
        return json({ models, count: models.length, source: 'Live enabled open-weight model catalogue' }, 200, cors);
      } catch (error) {
        return json({ error: error.message || 'Could not load models.' }, 503, cors);
      }
    }

    if (request.method === 'POST' && path === '/plan') {
      const parsed = await readJson(request);
      if (parsed.error) return json({ error: parsed.error }, 400, cors);
      const prompt = typeof parsed.value.prompt === 'string' ? parsed.value.prompt.trim() : '';
      const budget = Number(parsed.value.budget);
      const model = typeof parsed.value.model === 'string' ? parsed.value.model.trim() : '';
      if (!prompt || prompt.length > 3000) return json({ error: 'Enter a planning goal from 1 to 3000 characters.' }, 400, cors);
      if (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000_000) return json({ error: 'The budget is outside the supported range.' }, 400, cors);
      if (!model || model.length > 180 || !OPEN_WEIGHT_ID.test(model)) return json({ error: 'Select an enabled open-weight model.' }, 400, cors);
      try {
        const listing = await gateway('/models');
        if (!listing.ok) return json({ error: 'The model catalogue could not be checked.' }, 502, cors);
        const enabled = modelRows(await listing.json());
        if (!enabled.some((item) => item.id === model)) return json({ error: 'This model is not currently enabled for your AI Gateway.' }, 400, cors);

        const instructions = [
          'You are the open-weight AI planning advisor inside NEXIST Q-Intelligence.',
          'Convert the user planning goal into a portfolio of candidate project proposals for a small constrained selection experiment.',
          'Return only valid JSON with keys goal, items, assumptions, risk_notes.',
          'items must have 2 to 10 objects. Each item requires title, benefit, resource_cost, rationale, depends_on_titles, conflicts_with_titles.',
          'benefit and resource_cost must be non-negative finite numbers in the user-defined budget unit. Use estimated relative benefit, not an objectively measured result.',
          'Describe dependencies and conflicts by exact candidate title. Return empty arrays when none apply.',
          'Never invent approvals, source documents, measurements, evidence, or verified facts. Clearly state assumptions and risks.',
          'AI proposals are POTENTIAL only. They are not evidence, approval, implementation, financial advice, or a factual prediction.',
          'Do not request personal or confidential information. Avoid unsafe or unlawful recommendations.',
        ].join(' ');
        const response = await gateway('/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: instructions },
              { role: 'user', content: JSON.stringify({ goal: prompt, budget, budget_unit: 'user-defined units' }) },
            ],
            temperature: 0.2,
            max_tokens: 2000,
          }),
        });
        if (!response.ok) return json({ error: `The AI provider request failed (${response.status}).` }, 502, cors);
        const completion = await response.json();
        const raw = completion?.choices?.[0]?.message?.content;
        const plan = normalizePlan(extractJson(raw), prompt, budget);
        return json({ plan, model, provider: 'Neon AI Gateway', verified: false }, 200, cors);
      } catch (error) {
        return json({ error: error.message || 'AI planning could not be completed.' }, 502, cors);
      }
    }

    return json({ error: 'Route not found.' }, 404, cors);
  };
}

export default { fetch: (request) => createHandler()(request) };
