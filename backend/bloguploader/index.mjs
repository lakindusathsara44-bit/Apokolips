import { Pool } from "pg";
import { createHash, createHmac, randomUUID } from "node:crypto";

const BUCKET = "apokolips-blog-media";
const MAX_BYTES = 80 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/ogg"]);
const DEFAULT_ORIGINS = ["https://apokolips.xyz", "https://www.apokolips.xyz"];
let pool;

function db() {
  if (!process.env.DATABASE_URL) throw new Error("Database connection is not configured.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  return pool;
}
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
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400"
  };
  if (origin && origins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: headersFor(origin) });
}
function fail(message, status, origin) {
  return json({ error: message }, status || 400, origin);
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
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
function dateLabel(value) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}
function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
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
  const payloadHash = hash(Buffer.from(payload));
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
  const stringToSign = "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + hash(canonicalRequest);
  const dateKey = hmac(Buffer.from("AWS4" + secretKey, "utf8"), day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = "AWS4-HMAC-SHA256 Credential=" + accessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
  const requestHeaders = { "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, Authorization: authorization };
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
function toPost(row) {
  const date = new Date(row.created_at).toISOString().slice(0, 10);
  return {
    id: row.slug,
    slug: row.slug,
    type: row.post_type,
    title: row.title,
    date,
    dateLabel: dateLabel(row.created_at),
    description: row.description,
    filename: row.filename || "",
    mediaUrl: row.media_url || "",
    src: row.media_url || ""
  };
}
async function listPosts(origin) {
  const result = await db().query(
    "SELECT slug, post_type, title, description, filename, media_url, created_at FROM public.bloguploader_posts ORDER BY created_at DESC LIMIT 500"
  );
  return json({ posts: result.rows.map(toPost) }, 200, origin);
}
async function publish(request, origin) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/i);
  if (!match) return fail("Please log in again to publish.", 401, origin);
  const tokenHash = hash(match[1]);
  const session = await db().query(
    "UPDATE public.bloguploader_sessions SET last_seen_at = now() WHERE token_hash = $1 AND expires_at > now() RETURNING token_hash",
    [tokenHash]
  );
  if (!session.rowCount) return fail("Your uploader session has expired. Please log in again.", 401, origin);

  let form;
  try { form = await request.formData(); }
  catch (_) { return fail("The upload form could not be read.", 400, origin); }
  const type = String(form.get("type") || "").toLowerCase();
  const description = String(form.get("description") || "").trim();
  const file = form.get("media");
  if (!["image", "video", "text"].includes(type)) return fail("Choose a valid post type.", 400, origin);
  if (!description || description.length > 20000) return fail("Add a description (up to 20,000 characters).", 400, origin);

  let mediaKey = null, mediaUrl = null, filename = null, contentType = null, mediaSize = null;
  const slug = "uploaded-" + new Date().toISOString().slice(0, 10) + "-" + randomUUID().slice(0, 8);
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
    mediaKey = "uploads/" + slug + "/" + filename;
    const bytes = new Uint8Array(await file.arrayBuffer());
    mediaUrl = await storageRequest("PUT", mediaKey, bytes, contentType);
  }
  try {
    const inserted = await db().query(
      "INSERT INTO public.bloguploader_posts (slug, post_type, title, description, filename, media_key, media_url, content_type, media_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING slug, post_type, title, description, filename, media_url, created_at",
      [slug, type, makeTitle(description, type), description, filename, mediaKey, mediaUrl, contentType, mediaSize]
    );
    return json({ success: true, post: toPost(inserted.rows[0]) }, 201, origin);
  } catch (error) {
    if (mediaKey) {
      try { await storageRequest("DELETE", mediaKey, new Uint8Array(0), null); } catch (_) {}
    }
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
        let databaseReady = false;
        try { await db().query("SELECT 1"); databaseReady = true; } catch (_) {}
        const storageReady = Boolean(process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
        return json({ ready: databaseReady && storageReady, databaseConfigured: databaseReady, storageConfigured: storageReady }, 200, origin);
      }
      if ((path === "/posts" || path === "/api/posts") && request.method === "GET") return await listPosts(origin);
      if ((path === "/publish" || path === "/api/publish") && request.method === "POST") return await publish(request, origin);
      return fail("Not found.", 404, origin);
    } catch (error) {
      console.error("[bloguploader]", error);
      return fail("The Blog service could not complete the request. Please try again.", 500, origin);
    }
  }
};