// Storage abstraction. Uses Upstash Redis (Vercel KV compatible) when REST
// credentials are present, otherwise falls back to an in-memory Map so the app
// runs with zero config during local development.
//
// Vercel KV exposes KV_REST_API_URL / KV_REST_API_TOKEN.
// Upstash exposes UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
// We accept either naming.

import { Redis } from "@upstash/redis";

const url =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

const redis = url && token ? new Redis({ url, token }) : null;

export const usingRedis = Boolean(redis);

// In-memory fallback that survives dev hot-reloads via globalThis.
const globalStore = globalThis as unknown as {
  __chessMemStore?: Map<string, unknown>;
};
const memStore =
  globalStore.__chessMemStore ?? (globalStore.__chessMemStore = new Map());

export async function getJSON<T>(key: string): Promise<T | null> {
  if (redis) {
    // Upstash auto-deserializes JSON stored values.
    return (await redis.get<T>(key)) ?? null;
  }
  return (memStore.get(key) as T) ?? null;
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  if (redis) {
    await redis.set(key, value);
    return;
  }
  memStore.set(key, value);
}
