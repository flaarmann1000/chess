// Storage abstraction with three interchangeable backends, auto-detected from
// environment variables:
//
//   1. Vercel Edge Config  (EDGE_CONFIG present)
//        - Reads  : ultra-fast global read endpoint (perfect for polling).
//        - Writes : go through the Vercel REST API, so a VERCEL_API_TOKEN is
//                   required. Edge Config is read-optimized and writes are
//                   rate-limited, but a turn-based game writes rarely (only on
//                   a move / seat claim / reset), so this is fine.
//   2. Upstash Redis / Vercel KV  (KV_* or UPSTASH_* present)
//   3. In-memory  (nothing configured — used for local dev)
//
// Note: Edge Config keys may only contain [A-Za-z0-9_-], so game keys must not
// use colons. See GAME_KEY in lib/game.ts.

import { Redis } from "@upstash/redis";

// ---------- Edge Config ----------
// The EDGE_CONFIG connection string looks like:
//   https://edge-config.vercel.com/ecfg_xxxxx?token=<read-token>
function parseEdgeConfig(conn: string): { id: string; readToken: string } | null {
  if (!conn) return null;
  try {
    const u = new URL(conn);
    const id = u.pathname.replace(/^\/+/, "").split("/")[0];
    const readToken = u.searchParams.get("token") || "";
    if (id && readToken) return { id, readToken };
  } catch {
    /* fall through */
  }
  return null;
}

const edge = parseEdgeConfig(process.env.EDGE_CONFIG || "");
// Optional explicit override for the Edge Config id (else parsed above).
const edgeId = process.env.EDGE_CONFIG_ID || edge?.id || "";
// Vercel API token with Edge Config write scope (required for writes).
const vercelToken = process.env.VERCEL_API_TOKEN || "";
// Team id, only needed when the Edge Config belongs to a Vercel team.
const vercelTeam = process.env.VERCEL_TEAM_ID || "";

async function edgeGet<T>(key: string): Promise<T | null> {
  if (!edge) return null;
  const res = await fetch(
    `https://edge-config.vercel.com/${edge.id}/item/${encodeURIComponent(key)}`,
    {
      headers: { Authorization: `Bearer ${edge.readToken}` },
      cache: "no-store",
    }
  );
  if (res.status === 404) return null; // key not set yet
  if (!res.ok) {
    throw new Error(`Edge Config read failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as T;
}

async function edgeSet<T>(key: string, value: T): Promise<void> {
  if (!edgeId) throw new Error("Edge Config id is not configured.");
  if (!vercelToken) {
    throw new Error(
      "VERCEL_API_TOKEN is required to write to Edge Config. Create a Vercel API token and add it as an env var."
    );
  }
  const qs = vercelTeam ? `?teamId=${encodeURIComponent(vercelTeam)}` : "";
  const res = await fetch(`https://api.vercel.com/v1/edge-config/${edgeId}/items${qs}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${vercelToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items: [{ operation: "upsert", key, value }] }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Edge Config write failed (${res.status}): ${await res.text().catch(() => "")}`
    );
  }
}

// ---------- Redis / Vercel KV ----------
const redisUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const redisToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// ---------- In-memory fallback ----------
const globalStore = globalThis as unknown as {
  __chessMemStore?: Map<string, unknown>;
};
const memStore =
  globalStore.__chessMemStore ?? (globalStore.__chessMemStore = new Map());

// ---------- Public API ----------
export const backend: "edge-config" | "redis" | "memory" = edge
  ? "edge-config"
  : redis
  ? "redis"
  : "memory";

export async function getJSON<T>(key: string): Promise<T | null> {
  if (edge) return edgeGet<T>(key);
  if (redis) return (await redis.get<T>(key)) ?? null;
  return (memStore.get(key) as T) ?? null;
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  if (edge) return edgeSet<T>(key, value);
  if (redis) {
    await redis.set(key, value);
    return;
  }
  memStore.set(key, value);
}
