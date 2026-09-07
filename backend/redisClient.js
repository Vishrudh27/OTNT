/**
 * redisClient.js — Redis connection + tunnel-record helpers for OTNT.
 * --------------------------------------------------------------------
 * OBJECTIVE 2 (Persistence): replaces the previous plain in-memory Map()
 * for tunnel state. Redis gives us:
 *   1. Survival across backend restarts (a crash/restart no longer wipes
 *      every active tunnel's record).
 *   2. A durable handshake-dedup check (a replayed clientECDHPublicKey
 *      can no longer bypass the "already in progress" guard just by
 *      timing it around a restart).
 *
 * IMPORTANT — what Redis does NOT solve on its own:
 * A live `setInterval` timer handle is a JS runtime object; it cannot be
 * serialized into Redis and cannot survive a process restart, no matter
 * what we do here. index.js keeps a small local Map of timer handles
 * separately, and rehydrates fresh timers from these Redis records on
 * startup (see cleanupStartup() / rehydrateTunnels() in index.js).
 */

const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Key prefix keeps OTNT's keys namespaced in case this Redis instance is
// ever shared with something else.
const TUNNEL_KEY_PREFIX = 'otnt:tunnel:';
const TUNNEL_ID_SET = 'otnt:tunnel:ids';

const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.error('[REDIS ERROR]', err.message));
client.on('connect', () => console.log('[REDIS] Connecting...'));
client.on('ready', () => console.log('[REDIS] Connected and ready ✅'));

let connectPromise = null;
/** Idempotent connect — safe to call multiple times, only connects once. */
function connectRedis() {
  if (!connectPromise) connectPromise = client.connect();
  return connectPromise;
}

/**
 * Persists (or overwrites) a tunnel record in Redis.
 * `record` must be a plain JSON-serializable object — DO NOT pass timer
 * handles or anything non-serializable in here.
 * `ttlSeconds` (optional) sets a backstop expiry on the Redis key itself,
 * independent of OTNT's own expiry-timer logic — a safety net so a record
 * doesn't live forever in Redis even if the app crashes and never runs
 * its own cleanup. Pass a generous buffer above the tunnel's real
 * expirySeconds (index.js adds one) — this is NOT what actually tears
 * down the WireGuard interface, it only prevents Redis from accumulating
 * stale JSON forever.
 */
async function saveTunnel(tunnelId, record, ttlSeconds = null) {
  const key = TUNNEL_KEY_PREFIX + tunnelId;
  const payload = JSON.stringify(record);
  if (ttlSeconds) {
    await client.set(key, payload, { EX: ttlSeconds });
  } else {
    await client.set(key, payload);
  }
  await client.sAdd(TUNNEL_ID_SET, tunnelId);
}

/** Reads a single tunnel record. Returns null if it doesn't exist. */
async function getTunnel(tunnelId) {
  const raw = await client.get(TUNNEL_KEY_PREFIX + tunnelId);
  return raw ? JSON.parse(raw) : null;
}

/** Reads every tunnel record currently in Redis. */
async function getAllTunnels() {
  const ids = await client.sMembers(TUNNEL_ID_SET);
  if (!ids.length) return [];
  const keys = ids.map((id) => TUNNEL_KEY_PREFIX + id);
  const rawValues = await client.mGet(keys);
  const records = [];
  for (let i = 0; i < ids.length; i++) {
    if (rawValues[i]) {
      records.push({ id: ids[i], record: JSON.parse(rawValues[i]) });
    } else {
      // Key expired via TTL or was never written properly — prune the
      // dangling id from the set so getAllTunnels() stays accurate.
      await client.sRem(TUNNEL_ID_SET, ids[i]);
    }
  }
  return records;
}

/** Deletes a tunnel record entirely (used on manual delete + termination). */
async function deleteTunnel(tunnelId) {
  await client.del(TUNNEL_KEY_PREFIX + tunnelId);
  await client.sRem(TUNNEL_ID_SET, tunnelId);
}

module.exports = {
  client,
  connectRedis,
  saveTunnel,
  getTunnel,
  getAllTunnels,
  deleteTunnel
};
