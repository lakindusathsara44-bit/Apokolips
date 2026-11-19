import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { createHandler } from "../index.mjs";

const password = "0911";
const salt = "a6742172bb7372c247c5247b23b0cc48";
const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), 210000, 32, "sha256").toString("hex");
const env = {
  NEON_AI_GATEWAY_BASE_URL: "https://gateway.example",
  NEON_AI_GATEWAY_TOKEN: "server-only-test-token",
  NEXIST_ACCESS_HASH: hash,
  NEXIST_ACCESS_SALT: salt,
  NEXIST_SESSION_SECRET: "unit-test-session-secret-that-is-long-enough-for-hmac",
  NEXIST_ALLOWED_ORIGINS: "https://apokolips.xyz",
};
const plan = {
  goal: "Example learning centre",
  items: [
    { title: "Computer room", benefit: 9, resource_cost: 4, rationale: "Provides learner access.", depends_on_titles: [], conflicts_with_titles: [] },
    { title: "Network access", benefit: 7, resource_cost: 2, rationale: "Connects learning devices.", depends_on_titles: ["Computer room"], conflicts_with_titles: [] },
  ],
  assumptions: ["The budget is user-defined."],
  risk_notes: ["The project requires human review."],
};

function fakeGateway(url, options = {}) {
  if (String(url).endsWith("/v1/models")) {
    return Promise.resolve(new Response(JSON.stringify({
      data: [{ id: "gpt-oss-120b", enabled: true, owned_by: "open-weight" }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  if (String(url).endsWith("/v1/chat/completions")) {
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(plan) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
  }
  throw new Error("Unexpected gateway URL: " + url);
}

function makeRequest(path, { method = "GET", body, token, origin = "https://apokolips.xyz" } = {}) {
  const headers = { origin };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = "Bearer " + token;
  return new Request("https://nxqai.example" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function unlock(handle) {
  const response = await handle(makeRequest("/auth", { method: "POST", body: { password } }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.token);
  assert.equal(data.expiresInSeconds, 900);
  return data.token;
}

test("health reports the enabled gateway without exposing credentials", async () => {
  const handle = createHandler(env, fakeGateway, () => 1_800_000_000_000);
  const response = await handle(makeRequest("/health"));
  const data = await response.json();
  assert.equal(data.status, "ready");
  assert.equal(data.provider, "Neon AI Gateway");
  assert.equal(JSON.stringify(data).includes(env.NEON_AI_GATEWAY_TOKEN), false);
});

test("password exchange issues a short-lived session and model list is session gated", async () => {
  const handle = createHandler(env, fakeGateway, () => 1_800_000_000_000);
  const token = await unlock(handle);
  const unauthorized = await handle(makeRequest("/models"));
  assert.equal(unauthorized.status, 401);
  const response = await handle(makeRequest("/models", { token }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.models.length, 1);
  assert.equal(data.models[0].id, "gpt-oss-120b");
});

test("AI planning returns proposals and clearly labels them as unverified", async () => {
  const handle = createHandler(env, fakeGateway, () => 1_800_000_000_000);
  const token = await unlock(handle);
  const response = await handle(makeRequest("/plan", {
    method: "POST",
    token,
    body: { prompt: "Plan a learning centre.", budget: 10, model: "gpt-oss-120b" },
  }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.plan.status, "PROPOSAL_ONLY");
  assert.equal(data.verified, false);
  assert.equal(data.plan.items.length, 2);
});

test("incorrect passwords are throttled and do not issue sessions", async () => {
  const handle = createHandler(env, fakeGateway, () => 1_800_000_000_000);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await handle(makeRequest("/auth", {
      method: "POST",
      body: { password: "wrong" },
    }));
    assert.equal(response.status, 401);
  }
  const limited = await handle(makeRequest("/auth", {
    method: "POST",
    body: { password: "wrong" },
  }));
  assert.equal(limited.status, 429);
});

test("session token expires and non-allowed browser origins are rejected", async () => {
  let now = 1_800_000_000_000;
  const handle = createHandler(env, fakeGateway, () => now);
  const token = await unlock(handle);
  now += 16 * 60 * 1000;
  const expired = await handle(makeRequest("/models", { token }));
  assert.equal(expired.status, 401);
  const denied = await handle(makeRequest("/health", { origin: "https://evil.example" }));
  assert.equal(denied.status, 403);
});
