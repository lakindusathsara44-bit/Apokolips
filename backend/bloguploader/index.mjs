import { createHash, createHmac, randomUUID } from "node:crypto";

const BUCKET = "apokolips-blog-media";
const DATA_API = "https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1";
const MAX_BYTES = 80 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg"]);
const DEFAULT_ORIGINS = ["https://apokolips.xyz", "https://www.apokolips.xyz"];

function origins() {
  const configured = (process.env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ORIGINS);
}
function headersFor(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Neon-Token",
    "Access-Control-Max-Age": "86400"
  };
  if (origin && origins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), { status, headers: headersFor(origin) });
}
function fail(message, status = 400, origin = "") {
  return json({ error: message }, status, origin);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}
function safeFilename(value) {
  const original = String(value || "upload").split(/[\\/]/).pop();
  const normalized = original.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "");
  const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return safe || "upload";
}
function makeTitle(description, type) {
  const first = String(description || "").split(/\r?\n/).map(line => line.trim()).find(Boolean) || "";
  return first.split(/[.!?]/)[0].trim().slice(0, 80) || (type === "text" ? "A new note" : "A new memory");
}
async function neonRpc(name, args, token) {
  const response = await fetch(DATA_API + "/rpc/" + name, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "apikey": token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(args)
  });
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : null; } catch (_) { parsed = body; }
  if (!response.ok) {
    const message = typeof parsed === "string" ? parsed : parsed?.message || parsed?.hint || parsed?.details || "Neon database request failed (" + response.status + ").";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return parsed;
}
async function storageRequest(method, key, body, contentType) {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "ap-southeast-1";
  if (!endpoint || !accessKey || !secretKey) throw new Error("Neon Blog storage credentials are not available to the function.");
  const base = endpoint.replace(/\/+$/, "");
  const objectPath = "/" + BUCKET + "/" + key.split("/").map(encodeURIComponent).join("/");
  const url = new URL(base + objectPath);
  const payload = body || new Uint8Array(0);
  const payloadHash = sha256(Buffer.from(payload));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const signed = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (contentType) signed["content-type"] = contentType;
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map(name => name + ":" + String(signed[name]).trim() + "\n").join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = day + "/" + region + "/s3/aws4_request";
  const stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256(canonicalRequest);
  const dateKey = hmac(Buffer.from("AWS4" + secretKey, "utf8"), day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const requestHeaders = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature
  };
  if (contentType) requestHeaders["content-type"] = contentType;
  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: method === "PUT" ? payload : undefined
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    throw new Error("Storage request failed (" + response.status + "). " + detail);
  }
  return url.toString();
}
function makeDatePath() {
  const now = new Date();
  return { year: String(now.getUTCFullYear()), month: String(now.getUTCMonth() + 1).padStart(2, "0"), day: now.toISOString().slice(0, 10) };
}
async function publish(request, origin) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/i);
  const sessionToken = match?.[1] || "";
  const neonToken = request.headers.get("x-neon-token") || "";
  if (!sessionToken || !neonToken) return fail("Please log in again to publish.", 401, origin);

  const valid = await neonRpc("bloguploader_check_session", { input_token: sessionToken }, neonToken);
  if (valid !== true) return fail("Your uploader session has expired. Please log in again.", 401, origin);

  let form;
  try { form = await request.formData(); }
  catch (_) { return fail("The upload form could not be read.", 400, origin); }
  const type = String(form.get("type") || "").toLowerCase();
  const description = String(form.get("description") || "").trim();
  const file = form.get("media");
  if (!["image", "video", "text"].includes(type)) return fail("Choose a valid post type.", 400, origin);
  if (!description || description.length > 20000) return fail("Add a description (up to 20,000 characters).", 400, origin);

  const date = makeDatePath();
  const slug = "uploaded-" + date.day + "-" + randomUUID().slice(0, 8);
  let mediaKey = null, mediaUrl = null, filename = null, contentType = null, mediaSize = null;

  if (type === "text") {
    if (file && typeof file.arrayBuffer === "function" && file.size > 0) return fail("Text posts do not need a media file.", 400, origin);
  } else {
    if (!file || typeof file.arrayBuffer !== "function") return fail("Choose a media file first.", 400, origin);
    if (file.size <= 0) return fail("Empty files cannot be published.", 400, origin);
    if (file.size > MAX_BYTES) return fail("The maximum media size is 80 MB.", 413, origin);
    contentType = String(file.type || "application/octet-stream").toLowerCase();
    if (type === "image" && !IMAGE_TYPES.has(contentType)) return fail("Unsupported image format.", 415, origin);
    if (type === "video" && !VIDEO_TYPES.has(contentType)) return fail("Unsupported video format.", 415, origin);
    filename = safeFilename(file.name);
    mediaSize = file.size;
    mediaKey = "posts/" + date.year + "/" + date.month + "/" + slug + "/" + filename;
    mediaUrl = process.env.AWS_ENDPOINT_URL_S3.replace(/\/+$/, "") + "/" + BUCKET + "/" + mediaKey.split("/").map(encodeURIComponent).join("/");
    const bytes = new Uint8Array(await file.arrayBuffer());
    await storageRequest("PUT", mediaKey, bytes, contentType);
  }

  try {
    const saved = await neonRpc("bloguploader_publish_post", {
      input_token: sessionToken,
      p_slug: slug,
      p_post_type: type,
      p_title: makeTitle(description, type),
      p_description: description,
      p_filename: filename,
      p_media_key: mediaKey,
      p_media_url: mediaUrl,
      p_content_type: contentType,
      p_media_size: mediaSize
    }, neonToken);
    const row = Array.isArray(saved) ? saved[0] : saved;
    return json({ success: true, post: row }, 201, origin);
  } catch (error) {
    if (mediaKey) {
      try { await storageRequest("DELETE", mediaKey, new Uint8Array(0), null); } catch (cleanupError) { console.error("[bloguploader] Media cleanup failed:", cleanupError); }
    }
    if (error.status === 401 || error.status === 403) return fail("Your uploader session could not be verified. Please log in again.", 401, origin);
    if (/session|invalid/i.test(error.message || "")) return fail("Your uploader session has expired. Please log in again.", 401, origin);
    throw error;
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("origin") || "";
    if (origin && !origins().has(origin)) return fail("Origin not allowed.", 403, "");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headersFor(origin) });
    try {
      if (path === "/health" && request.method === "GET") {
        const storageReady = Boolean(process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
        return json({ ready: storageReady, storageConfigured: storageReady }, 200, origin);
      }
      if ((path === "/publish" || path === "/api/publish") && request.method === "POST") return await publish(request, origin);
      return fail("Not found.", 404, origin);
    } catch (error) {
      console.error("[bloguploader]", error);
      return fail("The Blog service could not complete the request. Please try again.", 500, origin);
    }
  }
};