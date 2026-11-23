# APOLONIA AI — Netlify + OpenAI

This directory contains the isolated Netlify Functions backend for APOLONIA AI.

## Runtime configuration

Set `OPENAI_API_KEY` in the Netlify site's environment variables. Mark it secret and scope it to Functions. Never commit the key or place it in browser JavaScript.

The function serves `POST /api/chat`, uses the OpenAI Responses API with `gpt-5-mini`, does not persist provider-side response state (`store: false`), validates request input, restricts browser origins to the Apokolips domains, and applies a per-IP platform rate limit.

## Deploy

Connect the dedicated Netlify project `apolonia-ai-api` to this repository's production branch `main`, using the repository root as the base directory. Deploy after setting `OPENAI_API_KEY`.

## API discovery library

The [public-apis-for-apokolips](https://github.com/lakindusathsara44-bit/public-apis-for-apokolips) repository is a discovery catalog, not a runtime dependency. Use it to identify candidate APIs when a feature needs external data. Before integrating any API, verify its current documentation, license/terms, authentication, CORS policy, rate limits, privacy implications, and reliability. Keep third-party credentials server-side. Do not automatically call arbitrary endpoints merely because a URL appears in the catalog.
