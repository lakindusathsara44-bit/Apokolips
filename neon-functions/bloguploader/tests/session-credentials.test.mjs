import test from "node:test";
import assert from "node:assert/strict";
import { extractPublishCredentials } from "../index.mjs";

test("publish credentials are read from multipart fields", async () => {
  const form = new FormData();
  form.set("session_token", "s".repeat(64));
  form.set("database_token", "database-jwt");
  const request = new Request("https://example.test/publish", { method: "POST", body: form });
  assert.deepEqual(extractPublishCredentials(request, await request.formData()), {
    token: "s".repeat(64),
    jwt: "database-jwt"
  });
});

test("legacy header credentials remain supported", async () => {
  const form = new FormData();
  const request = new Request("https://example.test/publish", {
    method: "POST",
    headers: { Authorization: "Bearer " + "l".repeat(64), "X-Neon-Token": "legacy-jwt" },
    body: form
  });
  assert.deepEqual(extractPublishCredentials(request, await request.formData()), {
    token: "l".repeat(64),
    jwt: "legacy-jwt"
  });
});

test("dedicated headers take precedence over multipart fallback", async () => {
  const form = new FormData();
  form.set("session_token", "f".repeat(64));
  form.set("database_token", "fallback-jwt");
  const request = new Request("https://example.test/publish", {
    method: "POST",
    headers: { "X-Blog-Session": "h".repeat(64), "X-Neon-Token": "header-jwt" },
    body: form
  });
  assert.deepEqual(extractPublishCredentials(request, await request.formData()), {
    token: "h".repeat(64),
    jwt: "header-jwt"
  });
});
