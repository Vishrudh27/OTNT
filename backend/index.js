/**
 * OTNT Backend — Express API Server
 * ----------------------------------
 * Handles the full tunnel lifecycle:
 *   1. ECDH handshake (establishes an encrypted channel with the client)
 *   2. WireGuard tunnel creation (kernel-level interface + peer registration)
 *   3. Encrypted config delivery (AES-256-GCM, keyed by the ECDH shared secret)
 *   4. Dual-condition expiry monitoring (time OR data volume)
 *   5. Manual/automatic tunnel teardown + crash-recovery cleanup
 *
 * SECURITY FIX (previous revision):
 * The backend NEVER generates or stores a WireGuard PRIVATE key on behalf of
 * the client. The client generates its own WireGuard keypair in the browser
 * and only ever sends the PUBLIC half to this server (see POST /api/tunnel/create).
 * The encrypted config template shipped to the client contains a placeholder
 * instead of a private key; the browser substitutes it locally, using the
 * private key it already holds, before the file is saved or QR-coded. This
 * guarantees the peer registered on the real kernel interface always matches
 * the private key the client actually ends up using.
 *
 * INPUT VALIDATION FIX (this revision):
 * clientECDHPublicKey and peerPublicKey were previously only checked as
 * "non-empty string" — a malformed value (wrong length, non-base64 garbage,
 * etc.) would pass that check and then fail deep inside tweetnacl or the
 * WireGuard layer with a confusing, unhandled error instead of a clean 400.
 * Both fields are now validated as well-formed base64 that decodes to
 * exactly 32 raw bytes — the actual size of an X25519 key — before any
 * cryptographic or kernel-level operation touches them. This is applied to
 * every endpoint that receives one of these keys, including
 * POST /api/tunnel/:id/client-config, which previously had no format
 * validation whatsoever (just a bare truthiness check).
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

const app = express();

// --- Global middleware ---
app.use(cors({ origin: ["http://localhost:5173", "http://192.168.29.17:5173"] }));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 60_000, max: 400 }));

const PORT = process.env.PORT || 3001;

/**
 * In-memory tunnel registry.
 * NOTE: intentionally a plain Map for Objective 1 — persistence (Redis) is
 * planned for Objective 2 and is out of scope for this fix.
 */
const tunnels = new Map();

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
 * X25519 public/private keys are always exactly 32 raw bytes, which base64
 * encodes to 44 characters (43 chars + 1 padding '=' with standard base64).
 * This checks BOTH the character set (rejects garbage/URL-encoded/etc. input)
 * AND the decoded byte length (rejects truncated or oversized values), so a
 * malformed key is rejected here with a clean 400 instead of surfacing a
 * confusing error deep inside tweetnacl or the WireGuard kernel layer later.
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

// --- Health check ---
app.get('/', (_req, res) => res.send('OTNT Backend up ✅'));

/**
 * POST /api/handshake/init
 * Establishes the ECDH shared secret used later to encrypt the config
 * delivered to the client. Also provisions the SERVER's WireGuard keypair
 * and reserves IPs for both ends of the tunnel.
 *
 * This endpoint no longer generates a WireGuard keypair on the client's
 * behalf. The client generates and keeps its own WireGuard keypair entirely
 * client-side and only ever shares its PUBLIC key, in the follow-up call to
 * POST /api/tunnel/create.
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

      // Prevent duplicate concurrent handshakes for the same client key.
      for (const t of tunnels.values()) {
        if (t.clientECDHPublicKey === clientECDHPublicKey) {
          return res.status(400).json({ error: 'Handshake already in progress' });
        }
      }

      const clientPubU8 = b64ToU8(clientECDHPublicKey);

      // Server's ECDH keypair for this session + shared secret derivation.
      const serverKeyPair = nacl.box.keyPair();
      const sharedSecret = nacl.scalarMult(serverKeyPair.secretKey, clientPubU8);

      // Server's own WireGuard keypair — this server IS one end of the tunnel.
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
        // Filled in by POST /api/tunnel/create once the client shares its
        // WireGuard PUBLIC key. The server never stores a client PRIVATE key.
        peerPublicKey: null,
        timers: {},
        expiry: null,
        dataCap: null,
        dataUsed: 0,
        clientConfig: null,   // plaintext template — private-key placeholder only
        clientIfaceName: null
      });

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
 * Registers the client's WireGuard PUBLIC key as a peer on a real kernel
 * WireGuard interface, and starts the dual-condition expiry monitors.
 *
 * `peerPublicKey` here is the same public key the client keeps the matching
 * private key for, locally, in its own browser — this is what fixes the
 * previous mismatch between the registered peer and the downloadable config.
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

    // 1. Clear any leftover OTNT interfaces before provisioning a new one.
    await cleanupOTNTInterfaces();

    // 2. Reserve an interface name (collision-checked against `wg show interfaces`).
    const ifaceName = await getNextFreeWGInterface();

    // 3. Resolve the endpoint the client will connect to.
    const hostIP = endpoint || getHostIP();
    const finalEndpoint = `${hostIP}:51820`;

    // 4. Create the real kernel WireGuard interface, registering the
    //    CLIENT-SUPPLIED public key as the trusted peer.
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
    t.clientIfaceName = `wg${tunnelId.slice(0, 8)}`; // cosmetic label, used only for the downloaded filename

    // 5. Build the client config TEMPLATE. The PrivateKey line uses a
    //    placeholder — the browser fills this in with the private key it
    //    already generated and never shared, immediately before saving the
    //    file. This is what makes the delivered file match the peer that
    //    was actually registered on the interface above.
    t.clientConfig = `[Interface]
PrivateKey = ${CLIENT_PRIVATE_KEY_PLACEHOLDER}
Address = ${t.clientIP}
DNS = 1.1.1.1

[Peer]
PublicKey = ${t.wgPub}
AllowedIPs = 0.0.0.0/0
Endpoint = ${finalEndpoint}
PersistentKeepalive = 25`;

    // 6. Expiry timer (time-based condition).
    if (expirySeconds) {
      t.expiry = Date.now() + expirySeconds * 1000;
      t.timers.expiry = setInterval(async () => {
        if (Date.now() >= t.expiry) {
          clearInterval(t.timers.expiry);
          if (t.timers.datamon) clearInterval(t.timers.datamon);
          try { await wireguard.deleteTunnel(t.ifaceName); } catch { /* already gone */ }
          tunnels.delete(tunnelId);
          audit.log(`Tunnel ${tunnelId} expired`);
        }
      }, 1000);
    }

    // 7. Data-cap monitor (data-volume condition).
    if (dataCapBytes) {
      t.dataCap = dataCapBytes;
      t.timers.datamon = setInterval(async () => {
        try {
          const used = await wireguard.getTransferBytes(t.ifaceName);
          t.dataUsed = used;
          if (used >= t.dataCap) {
            clearInterval(t.timers.datamon);
            if (t.timers.expiry) clearInterval(t.timers.expiry);
            try { await wireguard.deleteTunnel(t.ifaceName); } catch { /* already gone */ }
            tunnels.delete(tunnelId);
            audit.log(`Tunnel ${tunnelId} hit data cap and was deleted`);
          }
        } catch (e) {
          console.warn('Data monitor error:', e.message);
        }
      }, 1000);
    }

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
 * Encrypts the stored config TEMPLATE (private-key placeholder, not a real
 * key) under AES-256-GCM, keyed by SHA-256(ECDH shared secret). The browser
 * decrypts this, then locally substitutes its own private key before saving.
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
    const used = await wireguard.getTransferBytes(t.ifaceName);
    t.dataUsed = used;
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

  try {
    if (t.timers.expiry) clearInterval(t.timers.expiry);
    if (t.timers.datamon) clearInterval(t.timers.datamon);

    await wireguard.deleteTunnel(t.ifaceName);
    tunnels.delete(tunnelId);
    audit.log(`Tunnel deleted: ${tunnelId}`);
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

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 OTNT Backend listening at http://0.0.0.0:${PORT}`);
  await cleanupStartup();
});
