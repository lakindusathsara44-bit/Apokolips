# NEXIST Q-Intelligence AI endpoint

This folder contains the server-side Hugging Face Inference Providers adapter.

## Runtime configuration

Deploy the Neon Function with the HF_TOKEN secret set in the function environment. The token must have the Hugging Face Inference Providers permission. Never put it in browser JavaScript, HTML, the Git repository, or a public CI variable.

The default open-weight model is openai/gpt-oss-120b. The current allow-list deliberately limits the model selection to that model until usage, provider availability, and cost are reviewed.

## Routes

- GET /health reports whether the server-side token is configured.
- POST /plan accepts a JSON prompt and returns a schema-checked proposal.

The endpoint limits prompt length, item count, accepted model IDs, CORS origins, and in-memory request rate. The rate counter is per Function isolate and is not a complete authentication or DDoS control. Before wider public use, add authenticated Neon Auth sessions and/or a durable shared rate limiter. AI output is always AI_PROPOSAL_ONLY and is never treated as evidence or permission to realize an NX Unit.

## Provider notes

Hugging Face Inference Providers uses an OpenAI-compatible chat-completions endpoint. Model and provider availability, usage credits, and pricing can change. Configure the credential in the deployed function only; the frontend never receives it.
