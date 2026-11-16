import { createHash, createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const BUCKET = 'apokolips-blog-share';
const PREFIX = 'share/';
const TTL_MS = 10 * 60 * 1000;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const SIMPLE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const PART_BYTES = 8 * 1024 * 1024;
const MAX_PARTS = Math.ceil(MAX_FILE_BYTES / PART_BYTES);
const MULTIPART_MAX_AGE_MS = 60 * 60 * 1000;
const MAX_LIST_KEYS = 1000;
const PASSWORD_SALT = process.env.SHARE_PASSWORD_SALT;
const PASSWORD_HASH = process.env.SHARE_PASSWORD_HASH;
const ALLOWED_ORIGINS = new Set(
  (process.env.SHARE_ALLOWED_ORIGINS || 'https://www.apokolips.xyz,https://apokolips.xyz')
    .split(',').map(value => value.trim()).filter(Boolean)
);

const s3Endpoint = process.env.AWS_ENDPOINT_URL_S3;
const s3Region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!PASSWORD_SALT || !PASSWORD_HASH) throw new Error('Share password hash and salt are required.');
if (!s3Endpoint || !s3Region || !accessKeyId || !secretAccessKey) {
  throw new Error('Neon Object Storage credentials are required.');
}

const failedAttempts = new Map();
const EMPTY_HASH = createHash('sha256').update('').digest('hex');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}
function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}
function canonicalQuery(queryPairs) {
  // AWS SigV4 requires bytewise (ASCII/UTF-8 encoded) ordering, not locale-aware
  // ordering. localeCompare can put lowercase response-* parameters before the
  // uppercase X-Amz-* parameters and produce SignatureDoesNotMatch.
  const compareBytes = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  return queryPairs
    .map(([name, value]) => [awsEncode(name), awsEncode(value)])
    .sort((a, b) => compareBytes(a[0], b[0]) || compareBytes(a[1], b[1]))
    .map(([name, value]) => name + '=' + value).join('&');
}
function objectUri(key = '') {
  const endpoint = new URL(s3Endpoint);
  const bucketPath = '/' + awsEncode(BUCKET);
  const objectPath = key ? '/' + key.split('/').map(awsEncode).join('/') : '';
  return (endpoint.pathname.replace(/\/$/, '') + bucketPath + objectPath) || '/';
}
function xmlDecode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
    if (code[0] === '#') {
      const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[code.toLowerCase()] || '';
  });
}
function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function tagValue(xml, tag) {
  const match = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
  return match ? xmlDecode(match[1]) : '';
}
function encodeObjectName(name) {
  const bytes = Buffer.from(String(name || 'file').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180), 'utf8');
  return bytes.toString('base64url') || Buffer.from('file').toString('base64url');
}
function decodeObjectName(key) {
  const token = key.split('/')[3] || '';
  try {
    const value = Buffer.from(token, 'base64url').toString('utf8').replace(/[\u0000-\u001f\u007f]/g, '');
    return value || 'shared-file';
  } catch {
    return 'shared-file';
  }
}
function corsHeaders(request) {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Share-Password, X-Share-Upload-Token, X-Share-Part-Number');
    headers.set('Access-Control-Max-Age', '600');
    headers.set('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
  }
  return headers;
}
function jsonResponse(request, data, status = 200, extraHeaders = {}) {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}
function errorResponse(request, message, status) {
  return jsonResponse(request, { error: message }, status);
}
function fingerprint(request) {
  return sha256((request.headers.get('user-agent') || 'unknown') + '\n' + (request.headers.get('accept-language') || ''));
}
function verifyPassword(request, password) {
  const key = fingerprint(request);
  const now = Date.now();
  for (const [finger, item] of failedAttempts) {
    if (item.resetAt <= now) failedAttempts.delete(finger);
  }
  const attempt = failedAttempts.get(key);
  if (attempt && attempt.blockedUntil > now) {
    return { ok: false, blocked: true, retryAfter: Math.max(1, Math.ceil((attempt.blockedUntil - now) / 1000)) };
  }

  let supplied;
  try {
    if (typeof password !== 'string' || password.length > 128) throw new Error('Invalid password value.');
    supplied = scryptSync(password, Buffer.from(PASSWORD_SALT, 'base64url'), 64);
  } catch {
    supplied = Buffer.alloc(64);
  }
  const expected = Buffer.from(PASSWORD_HASH, 'hex');
  const ok = expected.length === supplied.length && timingSafeEqual(expected, supplied);
  if (ok) {
    failedAttempts.delete(key);
    return { ok: true };
  }

  const current = attempt && attempt.resetAt > now ? attempt : { failures: 0, resetAt: now + 15 * 60 * 1000, blockedUntil: 0 };
  current.failures += 1;
  if (current.failures >= 5) current.blockedUntil = now + 15 * 60 * 1000;
  if (failedAttempts.size > 2000) failedAttempts.clear();
  failedAttempts.set(key, current);
  return { ok: false, blocked: current.blockedUntil > now, retryAfter: current.blockedUntil > now ? 900 : 0 };
}
function authorized(request, password) {
  const result = verifyPassword(request, password);
  if (result.ok) return null;
  return errorResponse(request, result.blocked ? 'Too many incorrect attempts. Try again later.' : 'Incorrect password.', result.blocked ? 429 : 401);
}
function signingKey(dateStamp) {
  const dateKey = hmac('AWS4' + secretAccessKey, dateStamp);
  const regionKey = hmac(dateKey, s3Region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}
async function s3Request(method, key = '', options = {}) {
  const endpoint = new URL(s3Endpoint);
  const canonicalUri = objectUri(key);
  const queryPairs = options.query || [];
  const query = canonicalQuery(queryPairs);
  const url = new URL(endpoint.origin + canonicalUri + (query ? '?' + query : ''));

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const body = options.body ?? undefined;
  const payloadHash = body === undefined ? EMPTY_HASH : sha256(body);
  const headers = new Map([
    ['host', url.host],
    ['x-amz-content-sha256', payloadHash],
    ['x-amz-date', amzDate]
  ]);
  for (const [name, value] of Object.entries(options.headers || {})) {
    headers.set(name.toLowerCase(), String(value).trim().replace(/\s+/g, ' '));
  }
  const sortedHeaders = [...headers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalHeaders = sortedHeaders.map(([name, value]) => name + ':' + value + '\n').join('');
  const signedHeaders = sortedHeaders.map(([name]) => name).join(';');
  const canonicalRequest = [method, canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = dateStamp + '/' + s3Region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(dateStamp), stringToSign, 'hex');
  const authorization = 'AWS4-HMAC-SHA256 Credential=' + accessKeyId + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const requestHeaders = new Headers(options.headers || {});
  requestHeaders.set('x-amz-content-sha256', payloadHash);
  requestHeaders.set('x-amz-date', amzDate);
  requestHeaders.set('Authorization', authorization);
  return fetch(url, { method, headers: requestHeaders, body, redirect: 'manual' });
}
function presignedGetUrl(key, name, expiresInSeconds) {
  const endpoint = new URL(s3Endpoint);
  const canonicalUri = objectUri(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = dateStamp + '/' + s3Region + '/s3/aws4_request';
  const disposition = contentDisposition(name);
  const queryPairs = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', accessKeyId + '/' + scope],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresInSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
    ['response-content-disposition', disposition]
  ];
  const query = canonicalQuery(queryPairs);
  const canonicalHeaders = 'host:' + endpoint.host + '\n';
  const canonicalRequest = ['GET', canonicalUri, query, canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(dateStamp), stringToSign, 'hex');
  return endpoint.origin + canonicalUri + '?' + query + '&X-Amz-Signature=' + signature;
}
function contentDisposition(name) {
  const fallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_').slice(0, 120) || 'shared-file';
  return 'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}
function validKey(key) {
  return typeof key === 'string' && key.startsWith(PREFIX) && key.length <= 1024 && !key.includes('..') && !key.includes('\\');
}

function makeUploadToken(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = hmac(Buffer.from(PASSWORD_SALT, 'base64url'), payload, 'hex');
  return payload + '.' + signature;
}
function readUploadToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const supplied = Buffer.from(token.slice(dot + 1), 'hex');
  const expected = Buffer.from(hmac(Buffer.from(PASSWORD_SALT, 'base64url'), payload, 'hex'), 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let value;
  try { value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!value || !validKey(value.key) || typeof value.uploadId !== 'string' || !value.uploadId || value.uploadId.length > 2048) return null;
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_FILE_BYTES) return null;
  if (!Number.isSafeInteger(value.startedAt) || Date.now() - value.startedAt > MULTIPART_MAX_AGE_MS || value.startedAt > Date.now() + 60000) return null;
  if (typeof value.name !== 'string' || typeof value.contentType !== 'string') return null;
  return value;
}

function parseObjects(xml) {
  return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, part]) => {
    const key = tagValue(part, 'Key');
    const lastModified = tagValue(part, 'LastModified');
    const size = Number(tagValue(part, 'Size')) || 0;
    return { key, lastModified, uploadedAt: Date.parse(lastModified), size };
  }).filter(item => item.key.startsWith(PREFIX) && Number.isFinite(item.uploadedAt));
}
async function listObjects() {
  const response = await s3Request('GET', '', { query: [['list-type', '2'], ['prefix', PREFIX], ['max-keys', String(MAX_LIST_KEYS)]] });
  const xml = await response.text();
  if (!response.ok) throw new Error('Storage listing failed (' + response.status + '): ' + xml.slice(0, 400));
  return parseObjects(xml);
}
async function deleteObject(key) {
  const response = await s3Request('DELETE', key);
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error('Storage deletion failed (' + response.status + '): ' + body.slice(0, 300));
  }
}
async function removeExpired(objects) {
  const now = Date.now();
  const expired = objects.filter(item => item.uploadedAt + TTL_MS <= now);
  await Promise.all(expired.map(item => deleteObject(item.key)));
  return objects.filter(item => item.uploadedAt + TTL_MS > now);
}
async function currentFiles() {
  const objects = await listObjects();
  const alive = await removeExpired(objects);
  return alive.sort((a, b) => b.uploadedAt - a.uploadedAt).map(item => ({
    key: item.key,
    name: decodeObjectName(item.key),
    size: item.size,
    uploadedAt: new Date(item.uploadedAt).toISOString(),
    expiresAt: new Date(item.uploadedAt + TTL_MS).toISOString()
  }));
}
function parseParts(xml) {
  return [...xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map(([, part]) => ({
    partNumber: Number(tagValue(part, 'PartNumber')),
    etag: tagValue(part, 'ETag'),
    size: Number(tagValue(part, 'Size')) || 0
  })).filter(item => Number.isInteger(item.partNumber) && item.partNumber >= 1 && item.partNumber <= MAX_PARTS && item.etag);
}
async function listUploadParts(info) {
  const response = await s3Request('GET', info.key, { query: [['uploadId', info.uploadId]] });
  const xml = await response.text();
  if (!response.ok) throw new Error('Could not inspect upload parts (' + response.status + '): ' + xml.slice(0, 250));
  return parseParts(xml);
}
async function listMultipartUploads() {
  const response = await s3Request('GET', '', { query: [['uploads', ''], ['prefix', PREFIX], ['max-uploads', String(MAX_LIST_KEYS)]] });
  const xml = await response.text();
  if (!response.ok) throw new Error('Multipart cleanup listing failed (' + response.status + '): ' + xml.slice(0, 300));
  return [...xml.matchAll(/<Upload>([\s\S]*?)<\/Upload>/g)].map(([, part]) => ({
    key: tagValue(part, 'Key'),
    uploadId: tagValue(part, 'UploadId'),
    initiatedAt: Date.parse(tagValue(part, 'Initiated'))
  })).filter(item => validKey(item.key) && item.uploadId && Number.isFinite(item.initiatedAt));
}
async function abortMultipart(info) {
  const response = await s3Request('DELETE', info.key, { query: [['uploadId', info.uploadId]] });
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error('Multipart abort failed (' + response.status + '): ' + body.slice(0, 250));
  }
}
function multipartInfo(request, body) {
  const passwordError = authorized(request, body && body.password);
  if (passwordError) return { response: passwordError };
  const info = readUploadToken(body && body.token);
  if (!info) return { response: errorResponse(request, 'This upload session is invalid or has expired. Choose the file again to start a new upload.', 410) };
  return { info };
}
async function handleMultipartStart(request) {
  const body = await request.json().catch(() => ({}));
  const passwordError = authorized(request, body.password);
  if (passwordError) return passwordError;
  const size = Number(body.size);
  if (!Number.isSafeInteger(size) || size < 1) return errorResponse(request, 'Empty or invalid files cannot be uploaded.', 400);
  if (size > MAX_FILE_BYTES) return errorResponse(request, 'The maximum file size is 1 GB (1024 MB).', 413);
  const name = String(body.name || 'shared-file').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'shared-file';
  const contentType = String(body.contentType || 'application/octet-stream').slice(0, 160);
  const key = PREFIX + Date.now() + '/' + randomUUID() + '/' + encodeObjectName(name);
  const response = await s3Request('POST', key, { query: [['uploads', '']], headers: { 'content-type': contentType } });
  const xml = await response.text();
  if (!response.ok) {
    console.error('Multipart initiate failed:', response.status, xml.slice(0, 400));
    return errorResponse(request, 'The storage service could not start this upload. Please try again.', 502);
  }
  const uploadId = tagValue(xml, 'UploadId');
  if (!uploadId) return errorResponse(request, 'The storage service returned an invalid upload session.', 502);
  const startedAt = Date.now();
  const token = makeUploadToken({ key, uploadId, name, size, contentType, startedAt });
  return jsonResponse(request, { ok: true, token, partBytes: PART_BYTES, partCount: Math.ceil(size / PART_BYTES), maxFileBytes: MAX_FILE_BYTES }, 201);
}
async function handleMultipartPart(request) {
  const passwordError = authorized(request, request.headers.get('x-share-password'));
  if (passwordError) return passwordError;
  const info = readUploadToken(request.headers.get('x-share-upload-token'));
  if (!info) return errorResponse(request, 'This upload session is invalid or has expired. Restart the upload.', 410);
  const partNumber = Number(request.headers.get('x-share-part-number'));
  const count = Math.ceil(info.size / PART_BYTES);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count || partNumber > MAX_PARTS) {
    return errorResponse(request, 'Invalid upload part number.', 400);
  }
  const expectedBytes = Math.min(PART_BYTES, info.size - ((partNumber - 1) * PART_BYTES));
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength !== expectedBytes) {
    return errorResponse(request, 'The uploaded chunk size is invalid. Please retry this part.', 400);
  }
  const response = await s3Request('PUT', info.key, {
    query: [['partNumber', String(partNumber)], ['uploadId', info.uploadId]],
    body: bytes
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Share part upload failed:', response.status, detail.slice(0, 350));
    return errorResponse(request, 'A file part could not be stored. Please retry the upload.', 502);
  }
  return jsonResponse(request, { ok: true, partNumber, size: bytes.byteLength, etag: response.headers.get('etag') || '' });
}
async function handleMultipartStatus(request) {
  const body = await request.json().catch(() => ({}));
  const result = multipartInfo(request, body);
  if (result.response) return result.response;
  const parts = await listUploadParts(result.info);
  return jsonResponse(request, { ok: true, parts, expectedParts: Math.ceil(result.info.size / PART_BYTES), size: result.info.size });
}
async function handleMultipartComplete(request) {
  const body = await request.json().catch(() => ({}));
  const result = multipartInfo(request, body);
  if (result.response) return result.response;
  const info = result.info;
  const expectedCount = Math.ceil(info.size / PART_BYTES);
  const parts = await listUploadParts(info);
  const byNumber = new Map(parts.map(part => [part.partNumber, part]));
  if (byNumber.size !== expectedCount) {
    return errorResponse(request, 'Some upload parts are missing. Retry the upload before completing it.', 409);
  }
  const ordered = [];
  for (let partNumber = 1; partNumber <= expectedCount; partNumber++) {
    const part = byNumber.get(partNumber);
    const expectedBytes = Math.min(PART_BYTES, info.size - ((partNumber - 1) * PART_BYTES));
    if (!part || part.size !== expectedBytes) return errorResponse(request, 'An upload part is incomplete. Retry the upload.', 409);
    ordered.push(part);
  }
  const xml = '<CompleteMultipartUpload>' + ordered.map(part =>
    '<Part><PartNumber>' + part.partNumber + '</PartNumber><ETag>' + xmlEscape(part.etag) + '</ETag></Part>'
  ).join('') + '</CompleteMultipartUpload>';
  const response = await s3Request('POST', info.key, {
    query: [['uploadId', info.uploadId]],
    body: Buffer.from(xml),
    headers: { 'content-type': 'application/xml' }
  });
  const detail = await response.text();
  if (!response.ok || /<Error(?:\s|>)/.test(detail)) {
    console.error('Multipart completion failed:', response.status, detail.slice(0, 500));
    return errorResponse(request, 'The storage service could not finish assembling this file. The upload can be retried.', 502);
  }
  const head = await s3Request('HEAD', info.key);
  if (!head.ok) return errorResponse(request, 'The completed file could not be verified in storage.', 502);
  const storedSize = Number(head.headers.get('content-length')) || 0;
  if (storedSize !== info.size) {
    await deleteObject(info.key).catch(() => {});
    return errorResponse(request, 'The completed file size did not match the selected file.', 502);
  }
  const uploadedAt = Date.parse(head.headers.get('last-modified') || '') || Date.now();
  const file = {
    key: info.key,
    name: info.name,
    size: storedSize,
    uploadedAt: new Date(uploadedAt).toISOString(),
    expiresAt: new Date(uploadedAt + TTL_MS).toISOString()
  };
  return jsonResponse(request, { ok: true, file }, 201);
}
async function handleMultipartAbort(request) {
  const body = await request.json().catch(() => ({}));
  const result = multipartInfo(request, body);
  if (result.response) return result.response;
  await abortMultipart(result.info);
  return jsonResponse(request, { ok: true });
}

async function handleUpload(request) {
  const form = await request.formData();
  const passwordError = authorized(request, form.get('password'));
  if (passwordError) return passwordError;
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return errorResponse(request, 'Choose a file to upload.', 400);
  if (file.size <= 0) return errorResponse(request, 'Empty files are not accepted.', 400);
  if (file.size > SIMPLE_UPLOAD_MAX_BYTES) return errorResponse(request, 'Use multipart upload for files larger than 100 MB.', 413);

  const name = String(file.name || 'shared-file').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'shared-file';
  const key = PREFIX + Date.now() + '/' + randomUUID() + '/' + encodeObjectName(name);
  const contentType = String(file.type || 'application/octet-stream').slice(0, 160);
  const bytes = Buffer.from(await file.arrayBuffer());
  const response = await s3Request('PUT', key, { body: bytes, headers: { 'content-type': contentType } });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Share upload failed:', response.status, detail.slice(0, 400));
    return errorResponse(request, 'The storage service could not save this file. Please try again.', 502);
  }
  const now = Date.now();
  return jsonResponse(request, {
    ok: true,
    file: { key, name, size: bytes.byteLength, uploadedAt: new Date(now).toISOString(), expiresAt: new Date(now + TTL_MS).toISOString() }
  }, 201);
}
async function handleList(request) {
  const body = await request.json().catch(() => ({}));
  const passwordError = authorized(request, body.password);
  if (passwordError) return passwordError;
  const files = await currentFiles();
  return jsonResponse(request, { ok: true, files, ttlSeconds: TTL_MS / 1000, maxFileBytes: MAX_FILE_BYTES, partBytes: PART_BYTES });
}
async function handleDownload(request) {
  const body = await request.json().catch(() => ({}));
  const passwordError = authorized(request, body.password);
  if (passwordError) return passwordError;
  if (!validKey(body.key)) return errorResponse(request, 'Invalid file reference.', 400);

  const head = await s3Request('HEAD', body.key);
  if (head.status === 404) return errorResponse(request, 'This file has already been removed.', 404);
  if (!head.ok) return errorResponse(request, 'Could not verify the file in storage.', 502);
  const uploadedAt = Date.parse(head.headers.get('last-modified') || '');
  if (!Number.isFinite(uploadedAt)) return errorResponse(request, 'The file expiry could not be verified.', 502);
  if (uploadedAt + TTL_MS <= Date.now()) {
    await deleteObject(body.key);
    return errorResponse(request, 'This file has expired and was deleted.', 410);
  }

  const response = await s3Request('GET', body.key);
  if (!response.ok) return errorResponse(request, 'The file could not be downloaded.', response.status === 404 ? 404 : 502);
  const name = decodeObjectName(body.key);
  const headers = corsHeaders(request);
  headers.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
  headers.set('Content-Disposition', contentDisposition(name));
  const length = response.headers.get('content-length');
  if (length) headers.set('Content-Length', length);
  return new Response(response.body, { status: 200, headers });
}
async function handleDownloadUrl(request) {
  const body = await request.json().catch(() => ({}));
  const passwordError = authorized(request, body.password);
  if (passwordError) return passwordError;
  if (!validKey(body.key)) return errorResponse(request, 'Invalid file reference.', 400);

  const head = await s3Request('HEAD', body.key);
  if (head.status === 404) return errorResponse(request, 'This file has already been removed.', 404);
  if (!head.ok) return errorResponse(request, 'Could not verify the file in storage.', 502);
  const uploadedAt = Date.parse(head.headers.get('last-modified') || '');
  if (!Number.isFinite(uploadedAt)) return errorResponse(request, 'The file expiry could not be verified.', 502);
  const expiresAt = uploadedAt + TTL_MS;
  const remainingSeconds = Math.floor((expiresAt - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    await deleteObject(body.key);
    return errorResponse(request, 'This file has expired and was deleted.', 410);
  }
  const name = decodeObjectName(body.key);
  const url = presignedGetUrl(body.key, name, Math.min(60, remainingSeconds));
  return jsonResponse(request, { ok: true, url, name, expiresAt: new Date(expiresAt).toISOString() });
}
async function handleCleanup(request) {
  const body = await request.json().catch(() => null);
  const invocationId = request.headers.get('x-neon-trigger-invocation-id');
  if (!body || !invocationId || body.version !== 1 || body.invocation_id !== invocationId || body.trigger?.type !== 'schedule') {
    return errorResponse(request, 'Unauthorized trigger delivery.', 401);
  }
  const objects = await listObjects();
  const expired = objects.filter(item => item.uploadedAt + TTL_MS <= Date.now());
  await Promise.all(expired.map(item => deleteObject(item.key)));
  const uploads = await listMultipartUploads();
  const staleUploads = uploads.filter(item => item.initiatedAt + MULTIPART_MAX_AGE_MS <= Date.now());
  await Promise.all(staleUploads.map(item => abortMultipart(item)));
  return jsonResponse(request, { ok: true, deleted: expired.length, abortedUploads: staleUploads.length });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('origin');
    if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response('Origin not allowed', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });

    const url = new URL(request.url);
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        return jsonResponse(request, {
          service: 'Apokolips Temporary Share',
          status: 'online',
          lifetimeSeconds: TTL_MS / 1000,
          maxFileBytes: MAX_FILE_BYTES,
          partBytes: PART_BYTES,
          uploadMode: 'multipart'
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/files') return await handleList(request);
      if (request.method === 'POST' && url.pathname === '/api/upload') return await handleUpload(request);
      if (request.method === 'POST' && url.pathname === '/api/upload/start') return await handleMultipartStart(request);
      if (request.method === 'PUT' && url.pathname === '/api/upload/part') return await handleMultipartPart(request);
      if (request.method === 'POST' && url.pathname === '/api/upload/status') return await handleMultipartStatus(request);
      if (request.method === 'POST' && url.pathname === '/api/upload/complete') return await handleMultipartComplete(request);
      if (request.method === 'POST' && url.pathname === '/api/upload/abort') return await handleMultipartAbort(request);
      if (request.method === 'POST' && url.pathname === '/api/download') return await handleDownload(request);
      if (request.method === 'POST' && url.pathname === '/api/download-url') return await handleDownloadUrl(request);
      if (request.method === 'POST' && url.pathname === '/cleanup') return await handleCleanup(request);
      return errorResponse(request, 'Endpoint not found.', 404);
    } catch (error) {
      console.error('Apokolips Share API error:', error);
      return errorResponse(request, 'The share service encountered an error. Please try again.', 500);
    }
  }
};
