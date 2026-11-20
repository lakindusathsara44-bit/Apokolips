# Apokolips.Blog Neon Function

This directory contains the source for the deployed `bloguploader` Neon Function.

## Routes

- `GET /health` reports whether Neon Object Storage is available to the function.
- `POST /publish` accepts multipart form data (`type`, `description`, optional `file`) and requires the uploader session in `Authorization: Bearer` plus the Neon anonymous JWT in `X-Neon-Token`.

## Runtime configuration

Set these function environment variables:

- `ALLOWED_ORIGINS`
- `BLOG_DATA_API_URL`
- `BLOG_MEDIA_BUCKET=apokolips-blog-media`

Neon Functions supplies the Object Storage credentials and endpoint at runtime. Do not put credentials, passwords, or tokens in this repository.

## Storage and limits

The function uses the persistent `apokolips-blog-media` bucket, with an 80 MB upload limit. Do not point it at the temporary Network Folder bucket `apokolips-blog-share`.
