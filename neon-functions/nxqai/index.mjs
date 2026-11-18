const ALLOWED_ORIGINS = new Set([
  "https://apokolips.xyz",
  "https://www.apokolips.xyz",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);
const DEFAULT_MODEL = "gpt-oss-120b";
const ALLOWED_MODELS = new Set([DEFAULT_MODEL]);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 3;
const rateState = new Map();

function gatewayBase() {
  return String(process.env.NEON_AI_GATEWAY_BASE_URL || "").replace(/\/+$/, "");
}
function gatewayToken() {
  return process.env.NEON_AI_GATEWAY_TOKEN || "";
}
function response(data, status = 200, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return new Response(JSON.stringify(data), { status, headers });
}
function rateLimitKey(request) {
  const address = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  return address.slice(0, 96);
}
function allowRequest(request) {
  const now = Date.now();
  const key = rateLimitKey(request);
  const current = rateState.get(key) || { start: now, count: 0 };
  if (now - current.start >= WINDOW_MS) {
    current.start = now;
    current.count = 0;
  }
  current.count += 1;
  rateState.set(key, current);
  if (rateState.size > 2000) {
    for (const [entry, value] of rateState) {
      if (now - value.start > WINDOW_MS) rateState.delete(entry);
    }
  }
  return current.count <= MAX_REQUESTS;
}
function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
function slug(value, index) {
  const result = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return result || "candidate-" + (index + 1);
}
function extractJson(content) {
  let text = String(content || "").trim();
  const fence = String.fromCharCode(96).repeat(3);
  if (text.startsWith(fence)) {
    const newline = text.indexOf("\n");
    text = newline >= 0 ? text.slice(newline + 1) : text.slice(3);
    if (text.endsWith(fence)) text = text.slice(0, -3);
  }
  const parsed = JSON.parse(text.trim());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model returned a non-object plan.");
  }
  return parsed;
}
function validatePlan(raw, requestedBudget) {
  if (!Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > 10) {
    throw new Error("The model must return between 1 and 10 candidate items.");
  }
  const items = raw.items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("A candidate item is malformed.");
    }
    const title = String(item.title || item.name || ("Candidate " + (index + 1))).trim().slice(0, 90);
    if (!title) throw new Error("A candidate title is empty.");
    return {
      id: slug(title, index),
      title,
      benefit: finiteNonNegative(item.benefit),
      resource_cost: finiteNonNegative(item.resource_cost),
      rationale: String(item.rationale || "").slice(0, 320),
      depends_on_titles: Array.isArray(item.depends_on_titles)
        ? item.depends_on_titles.map((value) => String(value).slice(0, 90)).slice(0, 10)
        : [],
      conflicts_with_titles: Array.isArray(item.conflicts_with_titles)
        ? item.conflicts_with_titles.map((value) => String(value).slice(0, 90)).slice(0, 10)
        : [],
    };
  });
  return {
    goal: String(raw.goal || "").slice(0, 500),
    budget: finiteNonNegative(requestedBudget, finiteNonNegative(raw.budget)),
    items,
    assumptions: Array.isArray(raw.assumptions)
      ? raw.assumptions.map((value) => String(value).slice(0, 240)).slice(0, 8)
      : [],
    risk_notes: Array.isArray(raw.risk_notes)
      ? raw.risk_notes.map((value) => String(value).slice(0, 240)).slice(0, 8)
      : [],
    status: "AI_PROPOSAL_ONLY",
    evidence_verified: false,
  };
}
async function modelAvailability() {
  if (!gatewayBase() || !gatewayToken()) {
    return { status: "needs_configuration", message: "Branch AI Gateway credentials are not injected into this function." };
  }
  const catalog = await fetch(gatewayBase() + "/v1/models", {
    headers: { "Authorization": "Bearer " + gatewayToken() },
    signal: AbortSignal.timeout(12000),
  });
  if (!catalog.ok) throw new Error("Gateway model catalogue returned HTTP " + catalog.status);
  const payload = await catalog.json();
  const model = Array.isArray(payload.data) ? payload.data.find((item) => item.id === DEFAULT_MODEL) : null;
  if (!model || model.enabled === false) {
    return { status: "model_unavailable", message: "The selected model is not enabled for this branch. Check AI Gateway credits and model access." };
  }
  return { status: "ready", message: "Open-weight model is available through the branch AI Gateway." };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) return response({ error: "Origin not allowed." }, 403);
      return response({ ok: true }, 200, origin);
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return response({ error: "Origin not allowed." }, 403);
    }
    if (request.method === "GET" && url.pathname.endsWith("/health")) {
      try {
        const availability = await modelAvailability();
        return response({ ...availability, provider: "Neon AI Gateway", model: DEFAULT_MODEL }, 200, origin);
      } catch (error) {
        return response({
          status: "gateway_unavailable",
          provider: "Neon AI Gateway",
          model: DEFAULT_MODEL,
          message: String(error.message || error).slice(0, 180),
        }, 200, origin);
      }
    }
    if (request.method !== "POST" || !url.pathname.endsWith("/plan")) {
      return response({ error: "Use GET /health or POST /plan." }, 404, origin);
    }
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return response({ error: "A permitted browser Origin header is required." }, 403);
    }
    if (!allowRequest(request)) {
      return response({ error: "Rate limit reached. Try again later.", code: "RATE_LIMIT" }, 429, origin);
    }
    if (!gatewayBase() || !gatewayToken()) {
      return response({ error: "Neon AI Gateway credentials are not available in this function deployment.", code: "AI_NOT_CONFIGURED" }, 503, origin);
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 12000) return response({ error: "Request is too large." }, 413, origin);
    let body;
    try { body = await request.json(); }
    catch { return response({ error: "Request body must be valid JSON." }, 400, origin); }
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 3000) {
      return response({ error: "Prompt must contain 1 to 3000 characters." }, 400, origin);
    }
    const model = ALLOWED_MODELS.has(body?.model) ? body.model : DEFAULT_MODEL;
    const budget = finiteNonNegative(body?.budget, 0);
    const systemMessage = [
      "You are the proposal-planning assistant for NEXIST Q-Intelligence.",
      "Turn the user's planning goal into a small resource-allocation proposal.",
      "Return only valid JSON with this exact top-level shape:",
      '{"goal":"string","items":[{"title":"string","benefit":number,"resource_cost":number,"rationale":"string","depends_on_titles":["string"],"conflicts_with_titles":["string"]}],"assumptions":["string"],"risk_notes":["string"]}.',
      "Use at most 10 candidate items. Benefits and resource costs must be non-negative numbers.",
      "Use the user's budget as a hard planning limit. Do not invent evidence, approvals, source documents, or verified facts.",
      "Each item is only an AI proposal. It must remain POTENTIAL until a human supplies and reviews evidence in NEXIST.",
      "Do not claim quantum advantage. The quantum simulator is separate; classical validation remains required.",
    ].join(" ");
    let upstream;
    try {
      upstream = await fetch(gatewayBase() + "/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + gatewayToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: "Budget: " + budget + "\nPlanning goal: " + prompt },
          ],
          temperature: 0.2,
          max_tokens: 1400,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(55000),
      });
    } catch {
      return response({ error: "The Neon AI Gateway could not be reached.", code: "UPSTREAM_UNAVAILABLE" }, 502, origin);
    }
    if (!upstream.ok) {
      let detail = "The selected model provider rejected the request.";
      try {
        const payload = await upstream.json();
        detail = String(payload?.error?.message || payload?.error || detail).slice(0, 300);
      } catch {}
      return response({ error: detail, code: "UPSTREAM_ERROR", upstream_status: upstream.status }, 502, origin);
    }
    try {
      const payload = await upstream.json();
      const raw = extractJson(payload?.choices?.[0]?.message?.content);
      const plan = validatePlan(raw, budget);
      return response({
        plan,
        provider: "Neon AI Gateway",
        model,
        evidence_verified: false,
        warning: "AI output is a proposal only. NEXIST requires independently supplied evidence before eligibility.",
      }, 200, origin);
    } catch (error) {
      return response({
        error: "The model response could not be validated as a safe proposal.",
        detail: String(error?.message || "Invalid response").slice(0, 240),
        code: "INVALID_MODEL_OUTPUT",
      }, 502, origin);
    }
  },
};
