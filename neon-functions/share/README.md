# Apokolips Blog Temporary Share API

This folder contains the source and deployment bundle for the private temporary Share Folder shown on the Apokolips Blog.

## Runtime
- Neon project: \`frosty-mouse-83735944\`
- Branch: \`br-silent-frost-b3chnc64\`
- Function slug: \`aposhare\`
- Runtime: Node.js 24
- Private Object Storage bucket: \`apokolips-blog-share\`
- Function URL: \`https://br-silent-frost-b3chnc64-aposhare.compute.c-4.ap-southeast-1.aws.neon.tech/\`

The deployable source is \`index.mjs\`; \`function.zip.b64\` is its ZIP deployment bundle. The bundle contains no credentials or password values. The live Function keeps its secrets in Neon server-side environment variables.

## Upload API
- \`POST /api/files\`: JSON body with \`password\`; returns active files.
- \`POST /api/upload/start\`: JSON body with \`password\`, \`name\`, \`size\`, and \`contentType\`; starts an S3 multipart upload and returns a signed opaque session token.
- \`PUT /api/upload/part\`: binary chunk body; password, session token, and part number are sent in request headers.
- \`POST /api/upload/status\`: JSON body with \`password\` and \`token\`; lists completed parts to support resume.
- \`POST /api/upload/complete\`: JSON body with \`password\` and \`token\`; verifies every part and completes the object.
- \`POST /api/upload/abort\`: JSON body with \`password\` and \`token\`; aborts an unfinished upload.
- \`POST /api/download\`: JSON body with \`password\` and the opaque file key; returns a short-lived signed download URL.
- \`POST /cleanup\`: scheduled Neon trigger endpoint; not a public cleanup endpoint.

The private bucket is never made public. Every API operation verifies the password on the server. Multipart session tokens are HMAC-signed and expire after one hour. Browser requests send each 8 MiB chunk through the function; the browser never receives S3 credentials.

## Limits, expiry, and recovery
- Maximum completed file size: **1 GiB (1024 MiB)**.
- Upload chunks: 8 MiB; at most 128 parts for a 1 GiB file.
- Up to three parts are uploaded concurrently. Failed parts are retried automatically up to three times.
- The browser stores the resumable session token in the current tab's session storage. After a refresh or interrupted transfer, select the exact same file again to resume already completed parts. If the browser tab/session is closed or the session expires, a new upload may be required.
- Each completed file remains downloadable for 10 minutes from the storage object's LastModified time. Downloads are checked against expiry and use a signed GET URL whose lifetime cannot extend beyond the remaining file lifetime.
- An enabled Neon schedule trigger runs every minute. Expired files are deleted; incomplete multipart sessions older than 60 minutes are aborted.
- All file types are accepted. The 1 GiB limit is enforced by both the browser and server.
- Large downloads go directly from private Neon storage to the browser, avoiding loading a 1 GiB file into the Function's memory.

## Environment
The deployed function requires server-side \`SHARE_PASSWORD_SALT\` and \`SHARE_PASSWORD_HASH\` values for scrypt password verification, plus \`SHARE_ALLOWED_ORIGINS\`. Neon injects the S3-compatible endpoint, region, and credentials into the Function runtime. Do not add any of these values to frontend source or this repository.

The configured password is the four-digit value previously requested. It is weak for an internet-facing service; replace it with a long, unique password before using this service for sensitive files. The failed-attempt throttle is an in-process safeguard, not a substitute for a shared edge rate limiter.
