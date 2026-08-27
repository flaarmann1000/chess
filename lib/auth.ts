// Cookie-based auth helpers. Uses Web Crypto (HMAC-SHA256) so the same code
// runs in both the Edge middleware and Node route handlers.

export const AUTH_COOKIE = "chess_auth";
export const CLIENT_COOKIE = "chess_client";

function getSecret(): string {
  return process.env.SESSION_SECRET || "insecure-dev-secret";
}

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

// The token proves the holder knew the password, without storing it.
export async function createAuthToken(): Promise<string> {
  return hmac("authenticated", getSecret());
}

export async function verifyAuthToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await createAuthToken();
  // Constant-time-ish compare.
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.GAME_PASSWORD || "";
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function newClientId(): string {
  return crypto.randomUUID();
}
