# NEXIST Q-Intelligence AI endpoint

This folder contains the server-side Neon AI Gateway adapter. The branch AI Gateway is enabled and Neon injects its branch-scoped credentials into this function at runtime.

## Runtime configuration

No Hugging Face token is required. The Neon AI Gateway is enabled on the existing project branch and injects NEON_AI_GATEWAY_BASE_URL and NEON_AI_GATEWAY_TOKEN into the deployed Neon Function. The function verifies that the requested model appears as enabled in the branch model catalogue before making a request.

The default open-weight model is gpt-oss-120b. The current allow-list deliberately limits model selection to this model until usage, provider availability, and cost are reviewed.

## Routes

- GET /health reports whether the server-side token is configured.
- POST /plan accepts a JSON prompt and returns a schema-checked proposal.

The endpoint limits prompt length, item count, accepted model IDs, CORS origins, and in-memory request rate. The rate counter is per Function isolate and is not a complete authentication or DDoS control. Before wider public use, add authenticated Neon Auth sessions and/or a durable shared rate limiter. AI output is always AI_PROPOSAL_ONLY and is never treated as evidence or permission to realize an NX Unit.

## Provider notes

Neon AI Gateway exposes an OpenAI-compatible chat-completions endpoint. The function discovers availability at runtime through the branch-scoped model catalogue. Model access and prepaid AI credits may change. Gateway credentials remain server-side; the frontend never receives them.
