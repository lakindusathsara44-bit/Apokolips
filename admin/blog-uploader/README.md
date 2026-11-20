# Apokolips.Blog — Content Studio

A password-protected publishing page for the Apokolips blog.

## Pages

- `admin/blog-uploader/index.html` — Password login and image, video, or text post upload. No live preview, GitHub token field, or destination-repository field.
- `admin/blog-uploader/posts.html` — Browse posts uploaded through this repository and their Like and Comment counts.
- `admin/blog-uploader/insights.html` — Analytics with Like/Comment charts and engagement summaries.
- `admin/blog-uploader/analytics.js` — Shared post reader and read-only Apokolips engagement data client.

## Login

Visitors enter one shared password. The password is stored in the Neon database as a salted PBKDF2-HMAC-SHA256 hash; it is not embedded in this repository or returned to the browser.

After login, the browser stores only a random session token in localStorage. The database stores its SHA-256 hash. Sessions last 30 days, and users remain signed in across browser restarts until the browser data is cleared, the session expires, or the user logs out. Failed logins are rate-limited.

## One-time owner publishing setup

The Neon Function `bloguploader` handles publishing. Friends do not need a GitHub account, personal access token, or repository choice.

The repository owner must configure one fine-grained GitHub token as the Neon Function environment variable `GITHUB_TOKEN`. Restrict that token to this repository and grant **Contents: Read and write** only. Do not put the token in this repository, in the browser, or in messages. Once configured on the backend, every authorized uploader uses the shared password only.

Function URL:
`https://br-silent-frost-b3chnc64-bloguploader.compute.c-4.ap-southeast-1.aws.neon.tech/`

## Publish format

Media files are saved in `uploads/`; Markdown posts are saved in `posts/`; `posts/index.json` is updated automatically.

- Image/video posts: `[Media]`, media reference, then description.
- Text-only posts: `[Text]`, then text content.
- No author attribution is appended.

The uploader currently accepts files up to 80 MB. Large file publishing should be tested with the deployed hosting/runtime before relying on the maximum.

## GitHub Pages

Enable **Settings → Pages → Deploy from a branch → main → /(root)** if Pages is not already enabled.

Expected URL:
`https://lakindusathsara44-bit.github.io/BlogUploader/`

## Community activity

Like and Comment counts come from the existing Apokolips Neon tables:
- `apokolips_blog_reactions`
- `apokolips_blog_comments`

The uploader does not create a separate Like/Comment system. Visitors continue to interact with posts on the Apokolips blog.
