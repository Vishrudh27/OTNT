/**
 * OTNT Backend — Express API Server
 * ----------------------------------
 * Handles the full tunnel lifecycle:
 *   1. ECDH handshake (establishes an encrypted channel with the client)
 *   2. WireGuard tunnel creation (kernel-level interface + peer registration)
 *   3. Encrypted config delivery (AES-256-GCM, keyed by the ECDH shared secret)
 *   4. Dual-condition expiry monitoring (time OR data volume)
 *   5. Manual/automatic tunnel teardown + crash-recovery cleanup
 *   6. Redis-backed persistence (Objective 2) — tunnel records survive
 *      backend restarts; the in-memory Map is now a CACHE, not the
 *      source of truth.
 *
 * SECURITY FIX (earlier revision):
 * The backend NEVER generates or stores a WireGuard PRIVATE key on behalf of
 * the client. The client generates its own WireGuard keypair in the browser
 * and only ever sends the PUBLIC half to this server (see POST /api/tunnel/create).
 *
 * INPUT VALIDATION FIX (earlier revision):
 * clientECDHPublicKey and peerPublicKey are validated as well-formed base64
 * that decodes to exactly 32 raw bytes (X25519 key size) before any
 * cryptographic or kernel-level operation touches them.
 *
 * DUAL-CONDITION RACE FIX (earlier revision):
 * The time-expiry timer and the data-cap monitor are two independent
 * setIntervals that could both fire in the same tick. A `t.terminating`
 * flag, checked AND set synchronously before any `await`, guarantees only
 * one condition can ever actually win and call terminateTunnel().
 *
 * REDIS PERSISTENCE (this revision — Objective 2, Step 1):
 * Every mutation to a tunnel's state write-throughs to Redis via
 * persistTunnel(). Live `setInterval` timer handles are NOT serializable,
 * so they are stripped before writing and rebuilt fresh on rehydration.
 *
 * CRITICAL STARTUP ORDER (must not regress):
 *   connectRedis() -> rehydrateTunnels() -> cleanupStartup() -> app.listen()
 * rehydrateTunnels() MUST run before cleanupStartup(), because
 * cleanupStaleTunnels() deletes any kernel interface not present in the
 * `tunnels` Map. If the Map were still empty when that runs, every live
 * tunnel's interface would be destroyed on every restart.
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const nacl = require('tweetnacl');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');

const wireguard = require('./wireguard');
const audit = require('./auditLogger');
const redisClient = require('./redisClient');

const app = express();

// --- Global middleware ---
app.use(cors({ origin: ["http://localhost:5173", "http://192.168.29.17:5173"] }));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 60_000, max: 400 }));

const PORT = process.env.PORT || 3001;

/**
 * In-memory tunnel registry.
 * As of Objective 2, this is a CACHE only. Redis (via redisClient.js) is
 * the source of truth; every mutation here must be followed by a call to
 * persistTunnel() to keep the two in sync.
 */
const tunnels = new Map();

/** How often the data-cap monitor polls kernel transfer stats, in ms. */
const DATA_MONITOR_INTERVAL_MS = 250;

/** How often the time-expiry monitor checks, in ms. */
const EXPIRY_MONITOR_INTERVAL_MS = 1000;

/**
 * Fallback Redis key TTL (seconds) for records that don't have a real
 * tunnel expiry yet (e.g. a handshake-only record before /api/tunnel/create
 * is called). This is a safety net so stale JSON can't live in Redis
 * forever if the app crashes mid-handshake — it does NOT control any
 * actual WireGuard teardown logic.
 */
const DEFAULT_TTL_SECONDS = 86400; // 24h

/**
 * Placeholder token embedded in the client config TEMPLATE where the
 * client's own WireGuard PrivateKey must be spliced in, client-side only.
 * The server never sees, generates, or stores this value.
 * Must stay in sync with the same constant on the frontend
 * (frontend/src/components/DownloadEncryptedConfig.jsx).
 */
const CLIENT_PRIVATE_KEY_PLACEHOLDER = '__OTNT_CLIENT_PRIVATE_KEY__';

// --- Base64 <-> Uint8Array helpers ---
const u8ToB64 = (u8) => Buffer.from(u8).toString('base64');
const b64ToU8 = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));

/**
 * Validates that a string is a well-formed X25519 key encoded as base64.
 */
function isValidX25519KeyB64(value) {
  if (typeof value !== 'string') return false;
  if (!/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 32;
  } catch {
    return false;
  }
}

/** Generates a fresh X25519 (WireGuard-compatible) keypair. */
function generateWireGuardKeys() {
  const kp = nacl.box.keyPair();
  return { privateKey: u8ToB64(kp.secretKey), publicKey: u8ToB64(kp.publicKey) };
}

/** Returns the first non-loopback IPv4 address of this host, for auto endpoint detection. */
function getHostIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

/** Picks the next WireGuard interface name (wgN) not currently reported by `wg show interfaces`. */
async function getNextFreeWGInterface() {
  return new Promise((resolve, reject) => {
    exec('wg show interfaces', (err, stdout) => {
      if (err) return reject(err);
      const existing = stdout.split(/\s+/).filter(Boolean);
      for (let i = 1; i < 9999; i++) {
        const name = `wg${i}`;
        if (!existing.includes(name)) return resolve(name);
      }
      reject(new Error('No free WireGuard interface available'));
    });
  });
}

/**
 * Checks whether a given interface name is currently live in the kernel.
 * Used by rehydrateTunnels() to detect orphaned Redis records whose
 * interface no longer exists (e.g. the machine rebooted, wiping all
 * kernel state, but the Redis record itself survived).
 */
async function ifaceExists(ifaceName) {
  return new Promise((resolve) => {
    exec('wg show interfaces', (err, stdout) => {
      if (err) return resolve(false);
      const existing = stdout.split(/\s+/).filter(Boolean);
      resolve(existing.includes(ifaceName));
    });
  });
}

/** Removes any leftover OTNT-owned WireGuard interfaces from the kernel. */
async function cleanupOTNTInterfaces() {
  return new Promise((resolve) => {
    exec('wg show interfaces', (err, stdout) => {
      if (err) return resolve();
      const interfaces = stdout.split(/\s+/).filter(Boolean)
        .filter((iface) => iface.startsWith('wg') || iface.startsWith('client'));
      if (!interfaces.length) return resolve();

      let pending = interfaces.length;
      interfaces.forEach((iface) => {
        exec(`sudo ip link delete ${iface}`, (err2) => {
          if (!err2) console.log(`[WG CLEANUP] Removed ${iface}`);
          else console.warn(`[WG CLEANUP] Failed to remove ${iface}: ${err2.message}`);
          if (--pending === 0) resolve();
        });
      });
    });
  });
}

/**
 * Write-throughs a tunnel's current in-memory state to Redis.
 * Strips the `timers` field (setInterval handles are not serializable)
 * before writing. TTL is set generously past the tunnel's own expiry so
 * Redis doesn't accumulate stale JSON, but the TTL itself never performs
 * any actual teardown — that's still done by terminateTunnel().
 */
async function persistTunnel(tunnelId) {
  const t = tunnels.get(tunnelId);
  if (!t) return;

  const { timers, ...serializable } = t;

  let ttl = DEFAULT_TTL_SECONDS;
  if (t.expiry) {
    ttl = Math.max(1, Math.ceil((t.expiry - Date.now()) / 1000) + 300);
  }

  try {
    await redisClient.saveTunnel(tunnelId, serializable, ttl);
  } catch (e) {
    console.error(`[REDIS] Failed to persist tunnel ${tunnelId}:`, e.message);
  }
}

/**
 * Starts (or restarts, on rehydration) the expiry and data-cap monitors
 * for a tunnel, based on whatever t.expiry / t.dataCap are currently set
 * to on the in-memory record. Factored out so both the normal creation
 * path and the startup rehydration path share identical timer logic.
 */
function scheduleTimers(tunnelId) {
  const t = tunnels.get(tunnelId);
  if (!t) return;

  if (t.expiry) {
    t.timers.expiry = setInterval(() => {
      if (t.terminating) return;
      if (Date.now() >= t.expiry) {
        t.terminating = true;
        terminateTunnel(tunnelId, t, 'expired');
      }
    }, EXPIRY_MONITOR_INTERVAL_MS);
  }

  if (t.dataCap) {
    t.timers.datamon = setInterval(async () => {
      if (t.terminating) return;
      try {
        const used = await wireguard.getTransferBytes(t.ifaceName);
        t.dataUsed = used;

        if (t.terminating) return;

        if (used >= t.dataCap) {
          t.terminating = true;
          await terminateTunnel(tunnelId, t, 'hit data cap and was deleted');
        }
      } catch (e) {
        console.warn(`Data monitor read error for ${tunnelId}:`, e.message);
      }
    }, DATA_MONITOR_INTERVAL_MS);
  }
}

/**
 * Ends a tunnel exactly once, no matter which condition (time, data cap,
 * or manual delete) triggered it. All three paths funnel through here.
 * The `t.terminating` flag is set synchronously by the CALLER, before
 * this is invoked, so this function can safely assume it's the only one
 * tearing this tunnel down.
 */
async function terminateTunnel(tunnelId, t, reason) {
  if (t.timers.expiry) clearInterval(t.timers.expiry);
  if (t.timers.datamon) clearInterval(t.timers.datamon);
  try {
    await wireguard.deleteTunnel(t.ifaceName);
  } catch {
    /* already gone — fine, this is teardown, not creation */
  }
  tunnels.delete(tunnelId);
  try {
    await redisClient.deleteTunnel(tunnelId);
  } catch (e) {
    console.error(`[REDIS] Failed to delete tunnel ${tunnelId}:`, e.message);
  }
  audit.log(`Tunnel ${tunnelId} ${reason}`);
}

/**
 * Deletes an orphaned Redis record found at startup — one whose tunnel
 * had already finished expiring/terminating, or whose kernel interface
 * no longer exists (e.g. after a full machine reboot).
 */
async function cleanupOrphan(tunnelId, record) {
  try {
    if (record.ifaceName) await wireguard.deleteTunnel(record.ifaceName);
  } catch {
    /* interface may already be gone — fine */
  }
  try {
    await redisClient.deleteTunnel(tunnelId);
  } catch (e) {
    console.error(`[REDIS] Failed to clean up orphan ${tunnelId}:`, e.message);
  }
  console.log(`[REHYDRATE] Cleaned up orphaned tunnel ${tunnelId}`);
}

/**
 * Runs once at startup, BEFORE cleanupStartup(). Reads every tunnel
 * record out of Redis and either:
 *   - discards it (already terminating, already past expiry, or its
 *     kernel interface no longer exists), or
 *   - reloads it into the in-memory Map and restarts its timers.
 */
async function rehydrateTunnels() {
  const records = await redisClient.getAllTunnels();

  if (!records.length) {
    console.log('[REDIS] No records found');
    return;
  }

  console.log(`[REDIS] Found ${records.length} tunnel record(s)...`);

  for (const { id, record } of records) {
    const alreadyTerminating = record.terminating === true;
    const alreadyExpired = record.expiry && Date.now() >= record.expiry;
    const ifaceMissing = record.ifaceName ? !(await ifaceExists(record.ifaceName)) : false;

    if (alreadyTerminating || alreadyExpired || ifaceMissing) {
      await cleanupOrphan(id, record);
      continue;
    }

    tunnels.set(id, { ...record, timers: {} });

    if (record.ifaceName) {
      scheduleTimers(id);
      console.log(`Rehydrated tunnel ${id} (iface ${record.ifaceName})`);
    }
  }
}

// --- Health check ---
app.get('/', (_req, res) => res.send('OTNT Backend up ✅'));

/**
 * POST /api/handshake/init
 */
app.post('/api/handshake/init',
  body('clientECDHPublicKey')
    .isString().notEmpty()
    .custom((value) => {
      if (!isValidX25519KeyB64(value)) {
        throw new Error('clientECDHPublicKey must be a valid base64-encoded 32-byte X25519 public key');
      }
      return true;
    }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { clientECDHPublicKey } = req.body;

      for (const t of tunnels.values()) {
        if (t.clientECDHPublicKey === clientECDHPublicKey) {
          return res.status(400).json({ error: 'Handshake already in progress' });
        }
      }

      const clientPubU8 = b64ToU8(clientECDHPublicKey);
      const serverKeyPair = nacl.box.keyPair();
      const sharedSecret = nacl.scalarMult(serverKeyPair.secretKey, clientPubU8);
      const { privateKey: wgPriv, publicKey: wgPub } = generateWireGuardKeys();

      const tunnelId = uuidv4();
      const serverIP = await wireguard.getNextFreeIP();
      const clientIP = await wireguard.getNextFreeIP();

      tunnels.set(tunnelId, {
        id: tunnelId,
        ifaceName: null,
        wgPriv,
        wgPub,
        serverIP,
        clientIP,
        serverECDHPrivateKey: u8ToB64(serverKeyPair.secretKey),
        serverECDHPublicKey: u8ToB64(serverKeyPair.publicKey),
        clientECDHPublicKey,
        ecdhShared: u8ToB64(sharedSecret),
        peerPublicKey: null,
        timers: {},
        expiry: null,
        dataCap: null,
        dataUsed: 0,
        clientConfig: null,
        clientIfaceName: null,
        terminating: false
      });

      await persistTunnel(tunnelId);

      audit.log(`Handshake init for ${tunnelId}`);

      res.json({
        tunnelId,
        serverECDHPublicKey: u8ToB64(serverKeyPair.publicKey),
        serverWireGuardPublicKey: wgPub,
        serverIP,
        clientIP
      });
    } catch (e) {
      console.error('Handshake error:', e);
      res.status(500).json({ error: 'Handshake failed' });
    }
  });

/**
 * POST /api/tunnel/create
 */
app.post('/api/tunnel/create', [
  body('tunnelId').isString().notEmpty(),
  body('peerPublicKey')
    .isString().notEmpty()
    .custom((value) => {
      if (!isValidX25519KeyB64(value)) {
        throw new Error('peerPublicKey must be a valid base64-encoded 32-byte X25519 public key');
      }
      return true;
    }),
  body('allowedIPs').isString().notEmpty(),
  body('endpoint').optional().isString(),
  body('expirySeconds').optional().isInt({ min: 5, max: 86400 }),
  body('dataCapBytes').optional().isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { tunnelId, peerPublicKey, endpoint, expirySeconds, dataCapBytes } = req.body;
  const t = tunnels.get(tunnelId);
  if (!t) return res.status(404).json({ error: 'Unknown tunnelId' });

  try {
    if (t.ifaceName) {
      return res.json({
        message: 'Tunnel already exists',
        tunnelId,
        serverWireGuardPublicKey: t.wgPub
      });
    }

    await cleanupOTNTInterfaces();
    const ifaceName = await getNextFreeWGInterface();

    const hostIP = endpoint || getHostIP();
    const finalEndpoint = `${hostIP}:51820`;

    const result = await wireguard.createTunnel({
      privateKey: t.wgPriv,
      address: t.serverIP,
      peerPublicKey,
      allowedIPs: t.clientIP,
      endpoint: finalEndpoint,
      ifaceName
    });

    t.ifaceName = result.ifaceName;
    t.peerPublicKey = peerPublicKey;
    t.clientIfaceName = `wg${tunnelId.slice(0, 8)}`;

    t.clientConfig = `[Interface]
PrivateKey = ${CLIENT_PRIVATE_KEY_PLACEHOLDER}
Address = ${t.clientIP}
DNS = 1.1.1.1

[Peer]
PublicKey = ${t.wgPub}
AllowedIPs = 0.0.0.0/0
Endpoint = ${finalEndpoint}
PersistentKeepalive = 25`;

    if (expirySeconds) {
      t.expiry = Date.now() + expirySeconds * 1000;
    }
    if (dataCapBytes) {
      t.dataCap = dataCapBytes;
    }

    scheduleTimers(tunnelId);
    await persistTunnel(tunnelId);

    audit.log(`Tunnel created: ${tunnelId}`);
    res.json({
      message: 'Tunnel created',
      tunnelId,
      serverWireGuardPublicKey: t.wgPub,
      clientConfig: t.clientConfig
    });
  } catch (e) {
    console.error('Create tunnel error:', e);
    res.status(500).json({ error: e.message || 'Failed to create tunnel' });
  }
});

/**
 * POST /api/tunnel/:id/client-config
 */
app.post('/api/tunnel/:id/client-config', async (req, res) => {
  const t = tunnels.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!t.clientConfig) return res.status(400).json({ error: 'Tunnel not fully created' });

  try {
    const clientPubB64 = req.body.clientECDHPublicKey;
    if (!clientPubB64) return res.status(400).json({ error: 'Missing clientECDHPublicKey' });
    if (!isValidX25519KeyB64(clientPubB64)) {
      return res.status(400).json({ error: 'clientECDHPublicKey must be a valid base64-encoded 32-byte X25519 public key' });
    }

    const clientPub = b64ToU8(clientPubB64);
    const serverPriv = b64ToU8(t.serverECDHPrivateKey);
    const shared = nacl.scalarMult(serverPriv, clientPub);

    const aesKey = crypto.createHash('sha256').update(Buffer.from(shared)).digest();

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(t.clientConfig, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    res.json({
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      serverECDHPublicKey: t.serverECDHPublicKey,
      ifaceName: t.clientIfaceName
    });
  } catch (e) {
    console.error('Client config error:', e);
    res.status(500).json({ error: 'Failed to generate config' });
  }
});

// --- Tunnel status ---
app.get('/api/tunnel/status/:id', async (req, res) => {
  const t = tunnels.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });

  try {
    try {
      const used = await wireguard.getTransferBytes(t.ifaceName);
      t.dataUsed = used; // only overwrite on a successful read
    } catch (e) {
      console.warn(`Status read error for ${t.id}:`, e.message);
    }

    const timeLeft = t.expiry ? Math.max(0, Math.floor((t.expiry - Date.now()) / 1000)) : null;

    res.json({
      tunnelId: t.id,
      iface: t.ifaceName,
      serverIP: t.serverIP,
      clientIP: t.clientIP,
      timeLeftSeconds: timeLeft,
      bytesTransferred: t.dataUsed,
      dataCapBytes: t.dataCap,
      status: 'active'
    });
  } catch (e) {
    console.error('Tunnel status error:', e);
    res.status(500).json({ error: 'Status error' });
  }
});

// --- Delete tunnel ---
app.post('/api/tunnel/delete', body('tunnelId').isString().notEmpty(), async (req, res) => {
  const { tunnelId } = req.body;
  const t = tunnels.get(tunnelId);
  if (!t) return res.status(404).json({ error: 'Not found' });

  if (t.terminating) {
    return res.status(409).json({ error: 'Tunnel is already being terminated' });
  }
  t.terminating = true;

  try {
    await terminateTunnel(tunnelId, t, 'manually deleted');
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Delete tunnel error:', e);
    res.status(500).json({ error: e.message || 'Delete failed' });
  }
});

// --- List tunnels ---
app.get('/api/tunnel/list', (_req, res) => {
  res.json(Array.from(tunnels.values()).map((t) => ({
    tunnelId: t.id,
    iface: t.ifaceName,
    serverIP: t.serverIP,
    clientIP: t.clientIP,
    expiresAt: t.expiry,
    dataCapBytes: t.dataCap
  })));
});

// --- Startup crash-recovery cleanup ---
async function cleanupStartup() {
  try {
    if (typeof wireguard.cleanupStaleTunnels === 'function') {
      await wireguard.cleanupStaleTunnels(tunnels);
    }
  } catch (e) {
    console.error('cleanupStaleTunnels failed:', e.message);
  }
}

/**
 * Startup sequence. Order is critical — see the file header comment.
 */
async function main() {
  try {
    await redisClient.connectRedis();
  } catch (e) {
    console.error('[REDIS] Connection failed — cannot start without persistence:', e.message);
    process.exit(1);
  }

  await rehydrateTunnels();
  await cleanupStartup();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 OTNT Backend listening at http://0.0.0.0:${PORT}`);
  });
}

main();
