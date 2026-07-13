const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const nacl = require('tweetnacl');
const crypto = require('crypto');

const wireguard = require('./wireguard');
const audit = require('./auditLogger');

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://192.168.29.17:5173"] }));
app.use(bodyParser.json());
app.use(rateLimit({ windowMs: 60_000, max: 400 }));

const PORT = process.env.PORT || 3001;
const tunnels = new Map();

const u8ToB64 = u8 => Buffer.from(u8).toString('base64');
const b64ToU8 = b64 => Uint8Array.from(Buffer.from(b64, 'base64'));

function generateWireGuardKeys() {
  const kp = nacl.box.keyPair();
  return { privateKey: u8ToB64(kp.secretKey), publicKey: u8ToB64(kp.publicKey) };
}

// --- Health check ---
app.get('/', (_req, res) => res.send('OTNT Backend up ✅'));

// --- Handshake ---
app.post('/api/handshake/init',
  body('clientECDHPublicKey').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { clientECDHPublicKey } = req.body;

      // prevent duplicate handshake
      for (let t of tunnels.values()) {
        if (t.clientECDHPublicKey === clientECDHPublicKey)
          return res.status(400).json({ error: 'Handshake already in progress' });
      }

      // --- Convert client's pubkey ---
      const clientPubU8 = b64ToU8(clientECDHPublicKey);

      // --- Generate server ECDH keypair ---
      const serverKeyPair = nacl.box.keyPair();

      // --- Derive shared secret (ECDH) ---
      const sharedSecret = nacl.scalarMult(serverKeyPair.secretKey, clientPubU8);

      // --- WireGuard keys for server ---
      const { privateKey: wgPriv, publicKey: wgPub } = generateWireGuardKeys();

      // --- 🔥 FIX: Generate client WireGuard keys ---
      const { privateKey: clientPriv, publicKey: clientPub } = generateWireGuardKeys();

      // --- Assign IPs ---
      const tunnelId = uuidv4();
      const serverIP = await wireguard.getNextFreeIP();
      const clientIP = await wireguard.getNextFreeIP();

      // --- Save tunnel ---
      tunnels.set(tunnelId, {
        id: tunnelId,
        ifaceName: null,
        wgPriv,                 // server private key
        wgPub,                  // server public key
        serverIP,
        clientIP,
        // Save both pub + priv for later ECDH use
        serverECDHPrivateKey: u8ToB64(serverKeyPair.secretKey),
        serverECDHPublicKey: u8ToB64(serverKeyPair.publicKey),
        clientECDHPublicKey,
        ecdhShared: u8ToB64(sharedSecret),
        timers: {},
        expiry: null,
        dataCap: null,
        dataUsed: 0,
        clientPriv,             // 🔥 FIX: store client private key
        clientPub,              // 🔥 FIX: also store client public key
        clientConfig: null
      });

      audit.log(`Handshake init for ${tunnelId}`);

      res.json({
        tunnelId,
        serverECDHPublicKey: u8ToB64(serverKeyPair.publicKey),
        serverWireGuardPublicKey: wgPub,
        clientWireGuardPublicKey: clientPub,   // 🔥 return to client
        serverIP,
        clientIP
      });
    } catch (e) {
      console.error('Handshake error:', e);
      res.status(500).json({ error: 'Handshake failed' });
    }
  });

 

// app.post('/api/tunnel/create', [
    //   body('tunnelId').isString().notEmpty(),
//   body('peerPublicKey').isString().notEmpty(),   // client WireGuard public key
//   body('allowedIPs').isString().notEmpty(),
//   body('endpoint').optional().isString(),
//   body('expirySeconds').optional().isInt({ min: 5, max: 86400 }),
//   body('dataCapBytes').optional().isInt({ min: 1 })
// ], async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

//   const { tunnelId, peerPublicKey, endpoint, expirySeconds, dataCapBytes } = req.body;
//   let t = tunnels.get(tunnelId);

//   try {
//     if (!t) return res.status(404).json({ error: 'Unknown tunnelId' });

//     if (t.ifaceName) {
//       return res.json({
//         message: 'Tunnel already exists',
//         tunnelId,
//         serverWireGuardPublicKey: t.wgPub
//       });
//     }

//     const ifaceName = `wg${tunnelId}`;
//     await wireguard.cleanupIface(ifaceName);

//     const result = await wireguard.createTunnel({
//       privateKey: t.wgPriv,
//       address: t.serverIP,
//       peerPublicKey,
//       allowedIPs: t.clientIP,
//       endpoint
//     });

//     t.ifaceName = result.ifaceName;

//     // Build client WireGuard config
//     t.clientConfig = `[Interface]
// PrivateKey = ${t.clientPriv }
// Address = ${t.clientIP}
// DNS = 1.1.1.1

// [Peer]
// PublicKey = ${t.wgPub}
// AllowedIPs = 0.0.0.0/0
// Endpoint = ${endpoint || "your-server-ip:51820"}
// PersistentKeepalive = 25`;

//     if (expirySeconds) {
//       t.expiry = Date.now() + expirySeconds * 1000;
//       t.timers.expiry = setInterval(async () => {
//         if (Date.now() >= t.expiry) {
//           clearInterval(t.timers.expiry);
//           if (t.timers.datamon) clearInterval(t.timers.datamon);
//           try { await wireguard.deleteTunnel(t.ifaceName); } catch {}
//           tunnels.delete(tunnelId);
//           audit.log(`Tunnel ${tunnelId} expired`);
//         }
//       }, 1000);
//     }

//     if (dataCapBytes) {
//       t.dataCap = dataCapBytes;
//       t.timers.datamon = setInterval(async () => {
//         try {
//           const used = await wireguard.getTransferBytes(t.ifaceName);
//           t.dataUsed = used;
//           if (used >= t.dataCap) {
//             clearInterval(t.timers.datamon);
//             if (t.timers.expiry) clearInterval(t.timers.expiry);
//             try { await wireguard.deleteTunnel(t.ifaceName); } catch {}
//             tunnels.delete(tunnelId);
//             audit.log(`Tunnel ${tunnelId} hit data cap and was deleted`);
//           }
//         } catch (e) { console.warn('Data monitor error:', e.message); }
//       }, 1000);
//     }

//     audit.log(`Tunnel created: ${tunnelId}`);
//     res.json({
//       message: 'Tunnel created',
//       tunnelId,
//       serverWireGuardPublicKey: t.wgPub,
//       clientConfig: t.clientConfig
//     });

//   } catch (e) {
//     console.error('Create tunnel error:', e);
//     res.status(500).json({ error: e.message || 'Failed to create tunnel' });
//   }
// });
const os = require('os');

function getHostIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address; // first non-loopback IPv4
      }
    }
  }
  return '127.0.0.1'; // fallback
}

//CREATE TUNNEl 
// app.post('/api/tunnel/create', [
//   body('tunnelId').isString().notEmpty(),
//   body('peerPublicKey').isString().notEmpty(),   // client WireGuard public key
//   body('allowedIPs').isString().notEmpty(),
//   body('endpoint').optional().isString(),
//   body('expirySeconds').optional().isInt({ min: 5, max: 86400 }),
//   body('dataCapBytes').optional().isInt({ min: 1 })
// ], async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

//   const { tunnelId, peerPublicKey, endpoint, expirySeconds, dataCapBytes } = req.body;
//   let t = tunnels.get(tunnelId);

//   try {
//     if (!t) return res.status(404).json({ error: 'Unknown tunnelId' });

//     if (t.ifaceName) {
//       return res.json({
//         message: 'Tunnel already exists',
//         tunnelId,
//         serverWireGuardPublicKey: t.wgPub
//       });
//     }
//     //new changed for auto clenup interface 
// const { exec } = require('child_process');

// /**
//  * Cleans up all leftover OTNT WireGuard interfaces.
//  * Removes interfaces starting with "wg" or "client" directly from the kernel.
//  */
// async function cleanupOTNTInterfaces() {
//   return new Promise((resolve, reject) => {
//     // 1️⃣ List all WireGuard interfaces
//     exec('wg show interfaces', (err, stdout) => {
//       if (err) {
//         console.warn('[WG CLEANUP] Failed to list interfaces:', err.message);
//         return resolve(); // resolve anyway, don't block
//       }

//       const interfaces = stdout.split(/\s+/).filter(Boolean);

//       if (interfaces.length === 0) {
//         console.log('[WG CLEANUP] No leftover interfaces found.');
//         return resolve();
//       }

//       let pending = interfaces.length;

//       interfaces.forEach((iface) => {
//         // Only remove interfaces used by OTNT (optional: adjust prefixes)
//         if (iface.startsWith('wg') || iface.startsWith('client')) {
//           exec(`sudo ip link delete ${iface}`, (err2) => {
//             if (err2) {
//               console.warn(`[WG CLEANUP] Failed to delete ${iface}:`, err2.message);
//             } else {
//               console.log(`[WG CLEANUP] Removed interface ${iface}`);
//             }

//             if (--pending === 0) resolve(); // resolve after last interface
//           });
//         } else {
//           if (--pending === 0) resolve();
//         }
//       });

//       // If no OTNT interfaces matched
//       if (pending === interfaces.length) resolve();
//     });
//   });
// }

// // Example usage: call at startup
// cleanupOTNTInterfaces().then(() => {
//   console.log('[WG CLEANUP] Done cleaning OTNT interfaces.');
// });

//     const ifaceName = `wg${tunnelId}`;
//     await wireguard.cleanupIface(ifaceName);

//     // Determine the correct endpoint dynamically
//     const serverIP = getHostIP();
//     const finalEndpoint = endpoint || `${serverIP}:51820`;

//     const result = await wireguard.createTunnel({
//       privateKey: t.wgPriv,
//       address: t.serverIP,
//       peerPublicKey,
//       allowedIPs: t.clientIP,
//       endpoint: finalEndpoint
//     });

//     t.ifaceName = result.ifaceName;

//     // Build client WireGuard config with correct Endpoint
// const hostIP = endpoint || getHostIP();
// t.clientConfig = `[Interface]
// PrivateKey = ${t.clientPriv}
// Address = ${t.clientIP}
// DNS = 1.1.1.1

// [Peer]
// PublicKey = ${t.wgPub}
// AllowedIPs = 0.0.0.0/0
// Endpoint = ${hostIP}:51820
// PersistentKeepalive = 25`;


//     // --- Handle expiry timer ---
//     if (expirySeconds) {
//       t.expiry = Date.now() + expirySeconds * 1000;
//       t.timers.expiry = setInterval(async () => {
//         if (Date.now() >= t.expiry) {
//           clearInterval(t.timers.expiry);
//           if (t.timers.datamon) clearInterval(t.timers.datamon);
//           try { await wireguard.deleteTunnel(t.ifaceName); } catch {}
//           tunnels.delete(tunnelId);
//           audit.log(`Tunnel ${tunnelId} expired`);
//         }
//       }, 1000);
//     }

//     // --- Handle data cap ---
//     if (dataCapBytes) {
//       t.dataCap = dataCapBytes;
//       t.timers.datamon = setInterval(async () => {
//         try {
//           const used = await wireguard.getTransferBytes(t.ifaceName);
//           t.dataUsed = used;
//           if (used >= t.dataCap) {
//             clearInterval(t.timers.datamon);
//             if (t.timers.expiry) clearInterval(t.timers.expiry);
//             try { await wireguard.deleteTunnel(t.ifaceName); } catch {}
//             tunnels.delete(tunnelId);
//             audit.log(`Tunnel ${tunnelId} hit data cap and was deleted`);
//           }
//         } catch (e) { console.warn('Data monitor error:', e.message); }
//       }, 1000);
//     }

//     audit.log(`Tunnel created: ${tunnelId}`);
//     res.json({
//       message: 'Tunnel created',
//       tunnelId,
//       serverWireGuardPublicKey: t.wgPub,
//       clientConfig: t.clientConfig
//     });

//   } catch (e) {
//     console.error('Create tunnel error:', e);
//     res.status(500).json({ error: e.message || 'Failed to create tunnel' });
//   }
// });

const { exec } = require('child_process');

// --- Pick next free WireGuard interface dynamically ---
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

// --- Cleanup all leftover OTNT interfaces ---
async function cleanupOTNTInterfaces() {
  return new Promise(resolve => {
    exec('wg show interfaces', (err, stdout) => {
      if (err) return resolve();
      const interfaces = stdout.split(/\s+/).filter(Boolean)
        .filter(iface => iface.startsWith('wg') || iface.startsWith('client'));
      if (!interfaces.length) return resolve();

      let pending = interfaces.length;
      interfaces.forEach(iface => {
        exec(`sudo ip link delete ${iface}`, (err2) => {
          if (!err2) {
            console.log(`[WG CLEANUP] Removed ${iface}`);
          } else {
            console.warn(`[WG CLEANUP] Failed to remove ${iface}: ${err2.message}`);
          }
          if (--pending === 0) resolve();
        });
      });
    });
  });
}


// --- Tunnel create endpoint ---
app.post('/api/tunnel/create', [
  body('tunnelId').isString().notEmpty(),
  body('peerPublicKey').isString().notEmpty(),
  body('allowedIPs').isString().notEmpty(),
  body('endpoint').optional().isString(),
  body('expirySeconds').optional().isInt({ min: 5, max: 86400 }),
  body('dataCapBytes').optional().isInt({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { tunnelId, peerPublicKey, endpoint, expirySeconds, dataCapBytes } = req.body;
  let t = tunnels.get(tunnelId);
  if (!t) return res.status(404).json({ error: 'Unknown tunnelId' });

  try {
    // --- If tunnel already exists, return ---
    if (t.ifaceName) {
      return res.json({
        message: 'Tunnel already exists',
        tunnelId,
        serverWireGuardPublicKey: t.wgPub
      });
    }

    // --- 1. Cleanup any leftover OTNT interfaces ---
    await cleanupOTNTInterfaces();

    // --- 2. Pick next free interface ---
    const ifaceName = await getNextFreeWGInterface();

    // --- 3. Determine endpoint dynamically ---
    const serverIP = endpoint || getHostIP();
    const finalEndpoint = `${serverIP}:51820`;

    // --- 4. Create WireGuard tunnel ---
    const result = await wireguard.createTunnel({
      privateKey: t.wgPriv,
      address: t.serverIP,
      peerPublicKey,
      allowedIPs: t.clientIP,
      endpoint: finalEndpoint,
      ifaceName
    });

    t.ifaceName = result.ifaceName;

    // --- 5. Build client config ---
//     t.clientConfig = `[Interface]
// PrivateKey = ${t.clientPriv}
// Address = ${t.clientIP}
// DNS = 1.1.1.1

// [Peer]
// PublicKey = ${t.wgPub}
// AllowedIPs = 0.0.0.0/0
// Endpoint = ${finalEndpoint}
// PersistentKeepalive = 25`;
const dynamicIface = `wg${tunnelId.slice(0, 8)}`; // unique short id
t.clientConfig = `[Interface]
PrivateKey = ${t.clientPriv}
Address = ${t.clientIP}
DNS = 1.1.1.1
# Interface name dynamically set to avoid conflicts
[Peer]
PublicKey = ${t.wgPub}
AllowedIPs = 0.0.0.0/0
Endpoint = ${finalEndpoint}
PersistentKeepalive = 25`;
t.clientIfaceName = dynamicIface;

    // --- 6. Expiry timer ---
    if (expirySeconds) {
      t.expiry = Date.now() + expirySeconds * 1000;
      t.timers.expiry = setInterval(async () => {
        if (Date.now() >= t.expiry) {
          clearInterval(t.timers.expiry);
          if (t.timers.datamon) clearInterval(t.timers.datamon);
          try { await wireguard.deleteTunnel(t.ifaceName); } catch {}
          tunnels.delete(tunnelId);
          audit.log(`Tunnel ${tunnelId} expired`);
        }
      }, 1000);
    }

    // --- 7. Data cap monitor ---
    if (dataCapBytes) {
      t.dataCap = dataCapBytes;
      t.timers.datamon = setInterval(async () => {
        try {
          const used = await wireguard.getTransferBytes(t.ifaceName);
          t.dataUsed = used;
          if (used >= t.dataCap) {
            clearInterval(t.timers.datamon);
            if (t.timers.expiry) clearInterval(t.timers.expiry);
            try { await wireguard.deleteTunnel(t.ifaceName); } catch {}
            tunnels.delete(tunnelId);
            audit.log(`Tunnel ${tunnelId} hit data cap and was deleted`);
          }
        } catch (e) { console.warn('Data monitor error:', e.message); }
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

// --- Client config download ---
app.post('/api/tunnel/:id/client-config', async (req, res) => {
  const t = tunnels.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!t.clientConfig) return res.status(400).json({ error: 'Tunnel not fully created' });

  try {
    const clientPubB64 = req.body.clientECDHPublicKey;
    if (!clientPubB64) return res.status(400).json({ error: 'Missing clientECDHPublicKey' });

    const clientPub = b64ToU8(clientPubB64);
    const serverPriv = b64ToU8(t.serverECDHPrivateKey);

    // derive shared secret again
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
      ifaceName: t.clientIfaceName //changed
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

// --- Delete Tunnel ---
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
  res.json(Array.from(tunnels.values()).map(t => ({
    tunnelId: t.id,
    iface: t.ifaceName,
    serverIP: t.serverIP,
    clientIP: t.clientIP,
    expiresAt: t.expiry,
    dataCapBytes: t.dataCap
  })));
});

// --- Cleanup stale tunnels on startup ---
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
