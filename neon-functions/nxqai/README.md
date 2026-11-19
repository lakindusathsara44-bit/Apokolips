# NEXIST Q-Intelligence AI endpoint

This is the server-side adapter for the project's Neon AI Gateway. It does not expose gateway credentials to the browser.

## Runtime configuration

Neon injects the branch-scoped values NEON_AI_GATEWAY_BASE_URL and NEON_AI_GATEWAY_TOKEN into the function because AI Gateway is enabled for this project branch.

The function also requires:
- NEXIST_ACCESS_HASH: PBKDF2-SHA256 hash of the project access password.
- NEXIST_ACCESS_SALT: hexadecimal salt used to derive that hash.
- NEXIST_SESSION_SECRET: a high-entropy server-only HMAC key for 15-minute API sessions.
- NEXIST_ALLOWED_ORIGINS: comma-separated allowed browser origins.

The project access password is checked server-side using PBKDF2-SHA256 with 210,000 iterations. Successful unlock creates a short-lived, signed session token. Model catalogue and AI plan routes require that token. The password and session signing secret are never returned to the browser. The frontend stores only the short-lived session token in the current tab's session storage.

## Routes

- GET /health — reports whether the server-side AI Gateway is configured.
- POST /auth — verifies the project password and creates a short-lived session token.
- GET /models — lists currently enabled open-weight models; requires a valid session.
- POST /plan — creates a structured candidate proposal using a selected enabled open-weight model; requires a valid session.

The endpoint limits request size, validates the returned proposal, checks the selected model against the live branch catalogue, and rate-limits failed password attempts in each live function instance.

This is still a lightweight project gate, not full user identity management. The password is four digits, and in-memory failure throttling is per function instance rather than a durable global limiter. The page warns against confidential data. A public production service should use authenticated individual user accounts and a durable shared rate limiter.

## Model and evidence boundary

The AI Gateway model catalogue is queried dynamically. Only enabled open-weight model IDs are listed. A model proposal is never treated as evidence, verification, permission, approval, or an execution command. Every imported item starts in POTENTIAL and remains there until evidence is separately supplied and reviewed in NEXIST.
