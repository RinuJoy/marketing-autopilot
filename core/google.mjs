// Google APIs (Search Console, Play Developer) with one service account, no packages: a signed JWT swapped for a token.
// GOOGLE_SERVICE_ACCOUNT holds the account's JSON key. Add the account's email as a user in Search Console and in
// Play Console (Users and permissions, "View app information" and "Reply to reviews").
import { createSign } from "node:crypto";

const b64 = s => Buffer.from(s).toString("base64url");
const tokens = new Map();

export function jwt(key, scope, now = Math.floor(Date.now() / 1000)) {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ iss: key.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key.private_key, "base64url");
  return `${head}.${body}.${sig}`;
}

export async function token(scope, env = process.env) {
  if (!env.GOOGLE_SERVICE_ACCOUNT) throw new Error("GOOGLE_SERVICE_ACCOUNT not set");
  const hit = tokens.get(scope);
  if (hit && hit.until > Date.now()) return hit.value;
  const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt(key, scope) }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed: HTTP ${res.status}`);
  const j = await res.json();
  tokens.set(scope, { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 });
  return j.access_token;
}

export async function gapi(url, { scope, method = "GET", body, env } = {}) {
  const res = await fetch(url, {
    method, headers: { authorization: `Bearer ${await token(scope, env)}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const SC = "https://www.googleapis.com/auth/webmasters.readonly";
export const PLAY = "https://www.googleapis.com/auth/androidpublisher";
