const ALLOWED_ORIGINS = new Set([
  "https://apokolips.xyz",
  "https://www.apokolips.xyz"
]);

const SYSTEM_INSTRUCTION =
  "You are APOLONIA AI, the helpful assistant for the Apokolips digital platform. " +
  "Be accurate, clear, safe, and honest. Never claim to have performed actions you did not perform. " +
  "Match the user's language where practical.";

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

const getReply = (data) =>
  (data?.candidates?.[0]?.content?.parts || [])
    .filter((part) => typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

async function callGemini(apiKey, conversation) {
  const contents = conversation.map(({ role, content }) => ({
    role: role === "assistant" ? "model" : "user",
    parts: [{ text: content }]
  }));

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: { maxOutputTokens: 2048 }
      }),
      signal: AbortSignal.timeout(45000)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[APOLONIA] Gemini API error:", response.status, data?.error?.status || "unknown");
    throw new Error("Gemini provider request failed");
  }

  const reply = getReply(data);
  if (!reply) throw new Error("Gemini returned an empty response");
  return reply;
}

async function callOpenAI(apiKey, conversation) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      store: false,
      instructions: SYSTEM_INSTRUCTION,
      input: conversation
    }),
    signal: AbortSignal.timeout(45000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[APOLONIA] OpenAI fallback error:", response.status, data?.error?.code || "unknown");
    throw new Error("OpenAI fallback request failed");
  }

  const reply = typeof data.output_text === "string"
    ? data.output_text.trim()
    : (data.output || [])
        .flatMap((item) => item.content || [])
        .filter((item) => item.type === "output_text")
        .map((item) => item.text || "")
        .join("\n")
        .trim();

  if (!reply) throw new Error("OpenAI returned an empty response");
  return reply;
}

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

  const last = history[history.length - 1];
  const conversation = last?.role === "user" && last.content === message
    ? history
    : [...history, { role: "user", content: message }];

  const geminiKey = Netlify.env.get("GEMINI_API_KEY");
  const openAIKey = Netlify.env.get("OPENAI_API_KEY");

  if (!geminiKey && !openAIKey) {
    return json({ error: "AI service is not configured yet." }, 503, headers);
  }

  // Gemini is the primary provider. OpenAI is retained as a server-side fallback.
  if (geminiKey) {
    try {
      const reply = await callGemini(geminiKey, conversation);
      return json({ reply, provider: "gemini" }, 200, headers);
    } catch (error) {
      console.error("[APOLONIA] Gemini primary failed:", error?.name || "Error");
      if (!openAIKey) {
        return json({ error: "The AI provider could not complete this request." }, 502, headers);
      }
    }
  }

  if (openAIKey) {
    try {
      const reply = await callOpenAI(openAIKey, conversation);
      return json({ reply, provider: "openai-fallback" }, 200, headers);
    } catch (error) {
      console.error("[APOLONIA] OpenAI fallback failed:", error?.name || "Error");
    }
  }

  return json({ error: "The AI service is temporarily unavailable." }, 502, headers);
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
