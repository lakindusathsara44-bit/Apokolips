# Apokolips Blog Temporary Share API

This folder contains the deployment bundle for the private temporary Share Folder shown on blog.html.

## Runtime
- Neon project: frosty-mouse-83735944
- Branch: br-silent-frost-b3chnc64
- Function slug: aposhare
- Runtime: Node.js 24
- Private Object Storage bucket: apokolips-blog-share
- Function URL: https://br-silent-frost-b3chnc64-aposhare.compute.c-4.ap-southeast-1.aws.neon.tech/

The file function.zip.b64 is the base64-encoded ZIP uploaded to Neon Functions. It contains the index.mjs handler and no credentials or password values. Decode it before inspecting or redeploying:

    base64 -d function.zip.b64 > function.zip
    unzip -p function.zip index.mjs

## API
- POST /api/files: JSON body containing password; returns active files only.
- POST /api/upload: multipart form fields password and file.
- POST /api/download: JSON body containing password and the opaque file key.
- POST /cleanup: scheduled Neon trigger endpoint; not a public cleanup endpoint.

Every listing, upload, and download request verifies the password on the server. The browser bundle does not contain the password or its hash. The bucket is private and no public object URLs are issued.

## Expiry and limits
- Each upload is eligible for access for 10 minutes from the storage object's LastModified time.
- Download requests are denied as soon as the 10-minute expiry has passed.
- An enabled Neon schedule trigger invokes cleanup every minute; physical removal therefore follows expiry on the next cleanup run. Listing also removes expired objects opportunistically.
- Maximum upload size: 100 MiB. All file types are accepted; this is not an unlimited-size upload service.
- The folder refreshes its file list every 15 seconds while unlocked.

## Environment
The deployed function requires server-side SHARE_PASSWORD_SALT and SHARE_PASSWORD_HASH values for scrypt password verification. SHARE_ALLOWED_ORIGINS restricts browser origins. Neon injects the S3-compatible storage endpoint, region and credentials into the function runtime. Do not add any of these values to frontend source or this repository.

The configured password is the four-digit value requested for this folder. It is weak for an internet-facing service; replace it with a long, unique password before relying on it for sensitive files. The current failed-attempt throttle is an in-process safeguard, not a substitute for a shared edge rate limiter.
