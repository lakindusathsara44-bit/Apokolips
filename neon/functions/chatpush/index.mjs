import { createSign } from "node:crypto";

const UPSTREAM_CHAT_API_URL = process.env.UPSTREAM_CHAT_API_URL || "";
const DATA_API_URL = process.env.DATA_API_URL || process.env.NEON_DATA_API_URL || "";
const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL || "";
const FCM_SERVICE_ACCOUNT_JSON = process.env.FCM_SERVICE_ACCOUNT_JSON || "";
const CHAT_PUSH_DISPATCH_SECRET = process.env.CHAT_PUSH_DISPATCH_SECRET || "";

const ALLOWED_ROUTES = new Map([
  ["POST /session", true],
  ["POST /register", true],
  ["GET /messages", true],
  ["POST /messages", true],
  ["POST /media/presign", true],
  ["POST /profile/avatar", true],
  ["POST /attachments", true],
]);

const corsHeaders = {
  "Access-Control-Allow-Headers": "Content-Type, X-Guest-Token, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

let serviceAccount;
let oauthCache;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders, ...headers },
  });
}

function applyCors(headers, request) {
  const origin = request.headers.get("Origin");
  if (origin === "https://apokolips.xyz" || origin === "https://www.apokolips.xyz") {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function getServiceAccount() {
  if (!FCM_SERVICE_ACCOUNT_JSON) return null;
  if (!serviceAccount) {
    serviceAccount = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
    if (!serviceAccount.client_email || !serviceAccount.private_key || !serviceAccount.project_id) {
      throw new Error("Invalid Firebase service-account configuration.");
    }
  }
  return serviceAccount;
}

async function getAnonymousJwt() {
  if (!NEON_AUTH_BASE_URL) throw new Error("Neon Auth is not configured.");
  const response = await fetch(NEON_AUTH_BASE_URL.replace(/\/$/, "") + "/token/anonymous", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("Could not obtain a Neon anonymous token (" + response.status + ").");
  let token = raw.trim().replace(/^"|"$/g, "");
  try {
    const parsed = JSON.parse(raw);
    token = parsed.token || parsed.accessToken || parsed.jwt || token;
  } catch {}
  if (!token) throw new Error("Neon anonymous token response was empty.");
  return token;
}

async function callRpc(name, payload) {
  if (!DATA_API_URL) throw new Error("Neon Data API is not configured.");
  const jwt = await getAnonymousJwt();
  const base = DATA_API_URL.endsWith("/") ? DATA_API_URL : DATA_API_URL + "/";
  const response = await fetch(base + "rpc/" + name, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer " + jwt,
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error("Neon RPC failed:", name, response.status, raw.slice(0, 300));
    throw new Error("Neon push operation failed.");
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function validGuestToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(token);
}

async function handlePushRegistration(request, unregister = false) {
  const guestToken = request.headers.get("X-Guest-Token") || "";
  if (!validGuestToken(guestToken)) return json({ error: "unauthorized" }, 401);

  let payload;
  try { payload = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const deviceId = String(payload.deviceId || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
    return json({ error: "invalid_device_id" }, 400);
  }

  try {
    if (unregister) {
      await callRpc("chat_push_unregister_device", {
        p_guest_token: guestToken,
        p_device_id: deviceId,
      });
      return json({ ok: true });
    }

    const fcmToken = String(payload.fcmToken || "");
    if (fcmToken.length < 50 || fcmToken.length > 4096) {
      return json({ error: "invalid_fcm_token" }, 400);
    }
    await callRpc("chat_push_register_device", {
      p_guest_token: guestToken,
      p_device_id: deviceId,
      p_fcm_token: fcmToken,
    });
    return json({ ok: true });
  } catch (error) {
    console.error("Push device registration failed:", error?.message || error);
    return json({ error: "push_registration_failed" }, 503);
  }
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function getGoogleAccessToken(account) {
  if (oauthCache && oauthCache.expiresAt > Date.now() + 60000) return oauthCache.token;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = header + "." + claims;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + "." + signer.sign(account.private_key, "base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error("Google OAuth token request failed (" + response.status + ").");
  }
  oauthCache = {
    token: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  return oauthCache.token;
}

async function removeInvalidToken(fcmToken) {
  if (!CHAT_PUSH_DISPATCH_SECRET) return;
  try {
    await callRpc("chat_push_remove_invalid_token", {
      p_dispatch_secret: CHAT_PUSH_DISPATCH_SECRET,
      p_fcm_token: fcmToken,
    });
  } catch (error) {
    console.error("Could not remove an invalid FCM token:", error?.message || error);
  }
}

async function sendMessagePush(messageId) {
  if (!messageId || !FCM_SERVICE_ACCOUNT_JSON || !CHAT_PUSH_DISPATCH_SECRET) return;

  try {
    const account = getServiceAccount();
    const rows = await callRpc("chat_push_dispatch_message", {
      p_message_id: messageId,
      p_dispatch_secret: CHAT_PUSH_DISPATCH_SECRET,
    });
    if (!Array.isArray(rows) || rows.length === 0) return;

    const accessToken = await getGoogleAccessToken(account);
    await Promise.all(rows.map(async (row) => {
      const fcmToken = String(row.fcm_token || "");
      if (!fcmToken) return;
      const message = {
        message: {
          token: fcmToken,
          data: {
            message_id: String(row.message_id || messageId),
            title: String(row.notification_title || "Apokolips member").slice(0, 80),
            body: String(row.notification_body || "New message").slice(0, 160),
            message_type: String(row.message_type || "text"),
            route: "group_chat",
          },
          android: { priority: "HIGH" },
        },
      };

      const response = await fetch(
        "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(account.project_id) + "/messages:send",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404 || errorText.includes("UNREGISTERED")) {
          await removeInvalidToken(fcmToken);
        }
        console.error("FCM delivery failed:", response.status, errorText.slice(0, 240));
      }
    }));
  } catch (error) {
    // Notification delivery must never make an already-saved chat message fail.
    console.error("Group Chat push dispatch failed:", error?.message || error);
  }
}

async function proxyChatRequest(request, pathname, url) {
  const method = request.method.toUpperCase();
  if (!ALLOWED_ROUTES.has(method + " " + pathname)) return json({ error: "not_found" }, 404);
  if (!UPSTREAM_CHAT_API_URL) return json({ error: "chat_api_not_configured" }, 503);

  const guestToken = request.headers.get("X-Guest-Token") || "";
  if (!validGuestToken(guestToken)) return json({ error: "unauthorized" }, 401);

  let rawBody;
  let requestPayload = null;
  if (method !== "GET") {
    rawBody = await request.arrayBuffer();
    try { requestPayload = JSON.parse(new TextDecoder().decode(rawBody)); } catch {}
  }

  const upstreamBase = UPSTREAM_CHAT_API_URL.endsWith("/") ? UPSTREAM_CHAT_API_URL : UPSTREAM_CHAT_API_URL + "/";
  const upstreamUrl = new URL(pathname.replace(/^\//, "") + url.search, upstreamBase);
  const headers = new Headers({
    Accept: request.headers.get("Accept") || "application/json",
    "X-Guest-Token": guestToken,
  });
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body: method === "GET" ? undefined : rawBody,
  });

  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (!["connection", "transfer-encoding", "content-length", "content-encoding"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }
  applyCors(responseHeaders, request);

  const responseBody = await upstream.arrayBuffer();
  if (upstream.ok) {
    let messageId = "";
    if (method === "POST" && pathname === "/messages" && requestPayload?.messageType === "text") {
      try { messageId = JSON.parse(new TextDecoder().decode(responseBody)).id || ""; } catch {}
    } else if (method === "POST" && pathname === "/attachments") {
      messageId = String(requestPayload?.messageId || "");
    }
    if (messageId) await sendMessagePush(messageId);
  }

  return new Response(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      const headers = applyCors(new Headers(corsHeaders), request);
      return new Response(null, { status: 204, headers });
    }
    if (request.method === "GET" && pathname === "/health") {
      return json({ ok: true, service: "apokolips-chat-push-proxy" });
    }
    if (request.method === "POST" && pathname === "/push/register") {
      return handlePushRegistration(request, false);
    }
    if (request.method === "POST" && pathname === "/push/unregister") {
      return handlePushRegistration(request, true);
    }

    return proxyChatRequest(request, pathname, url);
  },
};
