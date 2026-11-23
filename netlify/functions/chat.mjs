const ALLOWED_ORIGINS = new Set([
  "https://apokolips.xyz",
  "https://www.apokolips.xyz"
]);

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://apokolips.xyz",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
});

const json = (payload, status, headers) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers }
  });

export default async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: "Origin not allowed" }, 403, headers);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, headers);
  }

  const apiKey = Netlify.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json({ error: "AI service is not configured yet." }, 503, headers);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20000) {
    return json({ error: "Request is too large." }, 413, headers);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "A valid JSON body is required." }, 400, headers);
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message || message.length > 4000) {
    return json({ error: "Message must contain 1–4000 characters." }, 400, headers);
  }

  const suppliedHistory = Array.isArray(payload.history) ? payload.history.slice(-16) : [];
  const history = suppliedHistory
    .filter((item) =>
      item &&
      ["user", "assistant"].includes(item.role) &&
      typeof item.content === "string" &&
      item.content.length <= 4000
    )
    .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));

  // Use the client history only as conversational context; always append the current message.
  const last = history[history.length - 1];
  const conversation = last?.role === "user" && last.content === message
    ? history
    : [...history, { role: "user", content: message }];

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        store: false,
        instructions: "You are APOLONIA AI, the helpful assistant for the Apokolips digital platform. Be accurate, clear, safe, and honest. Never claim to have performed actions you did not perform. Match the user's language where practical.",
        input: conversation
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("[APOLONIA] OpenAI API error:", upstream.status, data?.error?.code || "unknown");
      return json({ error: "The AI provider could not complete this request." }, 502, headers);
    }

    const reply = typeof data.output_text === "string"
      ? data.output_text.trim()
      : (data.output || [])
          .flatMap((item) => item.content || [])
          .filter((item) => item.type === "output_text")
          .map((item) => item.text || "")
          .join("\n")
          .trim();

    if (!reply) {
      return json({ error: "The AI provider returned an empty response." }, 502, headers);
    }

    return json({ reply }, 200, headers);
  } catch (error) {
    console.error("[APOLONIA] Request failed:", error?.name || "Error");
    return json({ error: "The AI service is temporarily unavailable." }, 502, headers);
  }
};

export const config = {
  path: "/api/chat",
  method: ["POST", "OPTIONS"],
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip"],
    windowSize: 60,
    windowLimit: 12
  }
};
