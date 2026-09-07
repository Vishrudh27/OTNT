// wireguard.js - Cross-platform WireGuard helper (concurrent-tunnel + ownership registry)
//
// OWNERSHIP MODEL (added to support running more than one tunnel at once):
//   Every interface OTNT creates is named `otnt<N>` (never `wg*`), and its
//   name is written to the Redis set `otnt:ifaces` BEFORE `wg-quick up`
//   ever runs. Every destructive operation in this file (cleanupStaleTunnels,
//   cleanupIface, deleteTunnel) requires BOTH the `otnt` name prefix AND
//   registry membership before it will touch a real kernel interface or
//   config file — isOTNTOwned() below is the single choke point for that
//   check. A name that matches the prefix but isn't registered, or a
//   registry entry that doesn't match the prefix, is treated as NOT OURS
//   and is left alone, never cleaned up on a guess. This is what stops
//   OTNT from ever touching a user's own wg0/wg1/etc., and is also why a
//   Redis flush while tunnels are live means OTNT will refuse to reclaim
//   its own interfaces (fail-safe, not fail-destructive) — accepted
//   tradeoff, see OTNT_CLAUDE_CODE.md.
//
// Previously (single-tunnel era) index.js called cleanupOTNTInterfaces()
// on every /api/tunnel/create, which deleted every wg*/client* interface
// unconditionally — meaning creating tunnel #2 destroyed tunnel #1, and a
// user's own wg0 was collateral damage. That call is removed in index.js;
// this file's job is to make sure removing it is actually safe, i.e. that
// nothing here can ever mistake an unrelated interface for its own.
const util = require('util');
const cp = require('child_process');
const exec = util.promisify(cp.exec);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { client: redis } = require('./redisClient');

const baseConfigPath = path.join(__dirname, 'config', 'base.conf');

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

// --- Ownership registry (Redis-backed, authoritative) ---
const OTNT_IFACE_PREFIX = 'otnt';
const IFACE_REGISTRY_KEY = 'otnt:ifaces';
const IP_REGISTRY_KEY = 'otnt:ips';
const PORT_REGISTRY_KEY = 'otnt:ports';
const PORT_RANGE_START = 51820;
const PORT_RANGE_END = 51869; // inclusive — 50 concurrent tunnels max, matches FYP demo scale

function hasOTNTPrefix(name) {
  return typeof name === 'string' && name.startsWith(OTNT_IFACE_PREFIX);
}

// --- Validate an interface name is safe to interpolate into shell commands ---
// Linux interface names are capped at 15 chars; we also restrict to
// alphanumeric/underscore/hyphen to rule out any shell-injection surface,
// since ifaceName gets interpolated directly into `exec()` calls throughout
// this file. Applied at every boundary that takes an ifaceName from outside
// (including ones sourced from Redis via rehydration — see index.js
// cleanupOrphan() — since a poisoned record must never reach a raw exec()).
function isValidIfaceName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]{1,15}$/.test(name);
}

/**
 * Authoritative ownership check: an interface is "ours" only if its name
 * has the otnt prefix AND it is currently registered in Redis. Strict AND —
 * a mismatch in either direction is treated as "not ours, leave it alone."
 * Checked fresh against live Redis every time (never cached), so a
 * deregistration is immediately respected by every caller.
 */
async function isOTNTOwned(ifaceName) {
  if (!hasOTNTPrefix(ifaceName)) return false;
  try {
    return Boolean(await redis.sIsMember(IFACE_REGISTRY_KEY, ifaceName));
  } catch (e) {
    // Fail closed: if Redis can't be reached to confirm ownership, we must
    // NOT treat the interface as ours. The whole point of this check is to
    // avoid destructive action under uncertain state.
    console.warn(`[WG WARN] Registry check failed for ${ifaceName}, treating as NOT owned:`, e.message);
    return false;
  }
}

async function registerIface(ifaceName) {
  await redis.sAdd(IFACE_REGISTRY_KEY, ifaceName);
}

async function deregisterIface(ifaceName) {
  try {
    await redis.sRem(IFACE_REGISTRY_KEY, ifaceName);
  } catch (e) {
    console.warn(`[WG WARN] Failed to deregister iface ${ifaceName}:`, e.message);
  }
}

/**
 * Returns the lowest-numbered `otnt<N>` name that is free in BOTH the
 * Redis registry and the live kernel — checking the kernel too matters if
 * the registry and reality have ever diverged (e.g. a crash between
 * registerIface() and wg-quick up, or a manual Redis flush), so a name
 * collision on `wg-quick up` can't happen even in that edge case.
 */
async function getNextFreeOTNTInterface() {
  const registered = await redis.sMembers(IFACE_REGISTRY_KEY);
  const taken = new Set(registered);

  if (!isWindows) {
    try {
      const { stdout } = await exec('wg show interfaces');
      stdout.split(/\s+/).filter(Boolean).forEach(n => taken.add(n));
    } catch (e) {
      // `wg show interfaces` errors when none exist at all — not a real failure.
    }
  }

  for (let i = 0; i < 9999; i++) {
    const name = `${OTNT_IFACE_PREFIX}${i}`;
    if (!taken.has(name)) return name;
  }
  throw new Error('No free OTNT interface name available');
}

function getConfigDir() {
  return isWindows
    ? path.join(process.env['ProgramFiles'], 'WireGuard', 'Data', 'Configurations')
    : '/etc/wireguard';
}

// --- Get all used 10.77.0.x IPs from the Redis registry, live interfaces, and configs ---
// The Redis registry is authoritative for what OTNT itself has allocated
// (and is what survives a restart); the kernel/`.conf` scan is a defensive
// backstop. Only OTNT-owned config files are scanned (`otnt*.conf`) — this
// narrowing is also what makes it safe to run this alongside a directory
// that might hold a user's own unrelated WireGuard configs.
async function getUsedIPs() {
  const used = new Set();

  try {
    const registered = await redis.sMembers(IP_REGISTRY_KEY);
    registered.forEach(v => {
      const n = parseInt(v, 10);
      if (!isNaN(n)) used.add(n);
    });
  } catch (e) {
    console.warn('[WG WARN] IP registry read failed:', e.message);
  }

  if (!isWindows) {
    try {
      const { stdout } = await exec("ip -4 addr show");
      const matches = stdout.match(/10\.77\.0\.\d+/g) || [];
      matches.forEach(m => {
        const last = parseInt(m.split('.').pop(), 10);
        if (!isNaN(last)) used.add(last);
      });
    } catch (e) {
      console.warn("[WG WARN] IP scan failed:", e.message);
    }

    const confDir = getConfigDir();
    if (fs.existsSync(confDir)) {
      const files = fs.readdirSync(confDir).filter(f => f.startsWith(OTNT_IFACE_PREFIX) && f.endsWith('.conf'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(confDir, f), 'utf8');
        const matches = content.match(/10\.77\.0\.\d+/g) || [];
        matches.forEach(m => {
          const last = parseInt(m.split('.').pop(), 10);
          if (!isNaN(last)) used.add(last);
        });
      }
    }
  }

  return used;
}

// --- Pick next free IP dynamically ---
async function getNextFreeIP(tunnelsMap = null) {
  const base = "10.77.0.";
  const used = await getUsedIPs();

  if (tunnelsMap) {
    for (let t of tunnelsMap.values()) {
      if (t.serverIP) used.add(parseInt(t.serverIP.split('.').pop(), 10));
      if (t.clientIP) used.add(parseInt(t.clientIP.split('.').pop(), 10));
    }
  }

  for (let i = 2; i < 255; i++) {
    if (!used.has(i)) {
      try {
        await redis.sAdd(IP_REGISTRY_KEY, String(i));
      } catch (e) {
        console.warn('[WG WARN] Failed to persist IP reservation:', e.message);
      }
      return `${base}${i}/32`;
    }
  }
  throw new Error("No free 10.77.0.x IPs available!");
}

/**
 * Releases a previously-allocated `10.77.0.x/32` (or bare `x`) back to the
 * pool. This is the piece the original in-memory `reservedIPs` Set never
 * had — nothing ever called `.delete()` on it, so IPs leaked for the
 * process lifetime. Moving allocation to Redis makes this the natural
 * place to fix that too.
 */
async function releaseIP(ipOrCidr) {
  if (!ipOrCidr) return;
  const last = ipOrCidr.split('/')[0].split('.').pop();
  try {
    await redis.sRem(IP_REGISTRY_KEY, String(parseInt(last, 10)));
  } catch (e) {
    console.warn('[WG WARN] Failed to release IP:', e.message);
  }
}

// --- Listen port allocation ---
// Each concurrent tunnel needs its own UDP port — base.conf no longer
// hardcodes 51820, so every createTunnel() call allocates one from this
// pool. Checked against the Redis registry (authoritative, survives
// restarts), live wg interfaces, AND a raw socket scan (`ss -lun`), since
// a non-WireGuard process could in principle already be bound to a port
// in this range.
async function getUsedPorts() {
  const used = new Set();

  try {
    const registered = await redis.sMembers(PORT_REGISTRY_KEY);
    registered.forEach(v => {
      const n = parseInt(v, 10);
      if (!isNaN(n)) used.add(n);
    });
  } catch (e) {
    console.warn('[WG WARN] Port registry read failed:', e.message);
  }

  if (!isWindows) {
    try {
      const { stdout } = await exec('sudo wg show all listen-port');
      stdout.trim().split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        const port = parseInt(parts[1], 10);
        if (!isNaN(port)) used.add(port);
      });
    } catch (e) {
      // No interfaces up yet — not a real failure.
    }

    try {
      const { stdout } = await exec('ss -lun');
      stdout.split('\n').forEach(line => {
        const m = line.match(/:(\d+)\s+/);
        if (m) {
          const port = parseInt(m[1], 10);
          if (port >= PORT_RANGE_START && port <= PORT_RANGE_END) used.add(port);
        }
      });
    } catch (e) {
      console.warn('[WG WARN] ss port scan failed:', e.message);
    }
  }

  return used;
}

async function getNextFreePort() {
  const used = await getUsedPorts();
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    if (!used.has(p)) {
      try {
        await redis.sAdd(PORT_REGISTRY_KEY, String(p));
      } catch (e) {
        console.warn('[WG WARN] Failed to persist port reservation:', e.message);
      }
      return p;
    }
  }
  throw new Error(`No free listen port available in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

async function releasePort(port) {
  if (!port) return;
  try {
    await redis.sRem(PORT_REGISTRY_KEY, String(port));
  } catch (e) {
    console.warn('[WG WARN] Failed to release port:', e.message);
  }
}

// --- Cleanup stale tunnels (startup crash-recovery) ---
// FIX (concurrent-tunnel pass): this used to grep for `wg*` interfaces and,
// worse, unconditionally unlinkSync'd EVERY `.conf` file in /etc/wireguard
// in a second pass that had no ownership check at all — outside the loop
// that correctly skipped live/rehydrated tunnels above it. That deleted a
// just-rehydrated tunnel's own config (empirically confirmed: a restart
// left `wg1` live in the kernel but its config file gone, so the next
// teardown had to skip `wg-quick down` entirely) and would have deleted a
// user's own wg0.conf too. Now scoped to `otnt*` interfaces/configs that
// are BOTH prefix-matched AND registry members — a name that only
// satisfies one of those is left alone in both the interface loop and the
// config-file sweep below it.
async function cleanupStaleTunnels(tunnelsMap = null) {
  if (isWindows) return;

  const confDir = getConfigDir();
  try {
    const { stdout } = await exec("ip -o link show | grep otnt || true");
    const ifaces = stdout.trim()
      ? stdout.trim().split("\n").map(l => l.split(":")[1]?.trim()).filter(Boolean)
      : [];

    for (const iface of ifaces) {
      if (tunnelsMap && Array.from(tunnelsMap.values()).some(t => t.ifaceName === iface)) continue;
      if (!(await isOTNTOwned(iface))) {
        console.log(`[WG CLEANUP] Skipping ${iface} — not OTNT-owned (name/registry mismatch)`);
        continue;
      }

      try { await exec(`sudo wg-quick down ${iface}`); } catch {}
      try { await exec(`sudo ip link delete ${iface}`); } catch {}
      try { await exec(`sudo ip addr flush dev ${iface}`); } catch {}
      await deregisterIface(iface);
      console.log(`[WG CLEANUP] Stale tunnel ${iface} removed`);
    }

    if (fs.existsSync(confDir)) {
      const files = fs.readdirSync(confDir).filter(f => f.startsWith(OTNT_IFACE_PREFIX) && f.endsWith('.conf'));
      for (const f of files) {
        const ifaceName = f.replace(/\.conf$/, '');
        if (tunnelsMap && Array.from(tunnelsMap.values()).some(t => t.ifaceName === ifaceName)) continue;
        if (!(await isOTNTOwned(ifaceName))) continue;
        fs.unlinkSync(path.join(confDir, f));
      }
    }
  } catch (err) {
    console.warn("[WG WARN] Cleanup failed:", err.message);
  }
}

// --- Single-iface cleaner ---
// Gated on isOTNTOwned() — this is called from createTunnel() as a
// defensive pre-check before a fresh `wg-quick up`, so under normal
// operation it only ever sees a name that was just registered by the
// caller a moment earlier.
async function cleanupIface(ifaceName) {
  if (isWindows || !ifaceName || !isValidIfaceName(ifaceName)) return false;
  if (!(await isOTNTOwned(ifaceName))) {
    console.log(`[CLEANUP] Skipping ${ifaceName} — not OTNT-owned`);
    return false;
  }
  try {
    await exec(`ip link show ${ifaceName}`);
  } catch {
    return false;
  }

  console.log(`[CLEANUP] Found iface ${ifaceName}, deleting...`);
  try { await exec(`sudo wg-quick down ${ifaceName}`); } catch {}
  try { await exec(`sudo ip link delete ${ifaceName}`); } catch {}
  try { await exec(`sudo ip addr flush dev ${ifaceName}`); } catch {}
  return true;
}

// --- Build WireGuard config ---
// listenPort is now required (allocated by the caller — see createTunnel —
// the same pattern already used for ifaceName) and injected the same way
// PrivateKey/Address are, rather than coming from a hardcoded base.conf
// line. This is what lets concurrent interfaces each bind their own port.
async function buildConfig({ privateKey, address, peerPublicKey, allowedIPs, endpoint, listenPort }) {
  let base = fs.readFileSync(baseConfigPath, 'utf8');

  if (/^\s*PrivateKey\s*=/mi.test(base)) {
    base = base.replace(/^\s*PrivateKey\s*=.*$/mi, `PrivateKey = ${privateKey}`);
  } else {
    base = base.replace(/\[Interface\]/i, `[Interface]\nPrivateKey = ${privateKey}`);
  }

  let serverIP = address;
  if (!serverIP) serverIP = await getNextFreeIP();
  base = base.replace(/Address\s*=.*$/mi, `Address = ${serverIP}`);

  if (!listenPort) {
    throw new Error('buildConfig requires a listenPort — allocate one via getNextFreePort() before calling');
  }
  if (/^\s*ListenPort\s*=/mi.test(base)) {
    base = base.replace(/^\s*ListenPort\s*=.*$/mi, `ListenPort = ${listenPort}`);
  } else {
    base = base.replace(/\[Interface\]/i, `[Interface]\nListenPort = ${listenPort}`);
  }

  const allowedLine = Array.isArray(allowedIPs)
    ? allowedIPs.join(', ')
    : allowedIPs || await getNextFreeIP();

  let peer = [
    '[Peer]',
    `PublicKey = ${peerPublicKey}`,
    `AllowedIPs = ${allowedLine}`,
    `PersistentKeepalive = 25`
  ].join('\n');

  if (endpoint && endpoint.trim()) peer += `\nEndpoint = ${endpoint.trim()}`;

  return base.trim() + '\n\n' + peer + '\n';
}

let tunnelCreationLock = Promise.resolve();

// --- Create tunnel ---
// FIX (Priority #3, engineering review): previously this function's parameter
// destructuring did not include `ifaceName` at all, so even when index.js's
// interface-allocator result was passed in as { ifaceName: 'wg7', ... },
// JS silently dropped it (destructuring ignores unnamed properties) and a
// fresh random name was generated every single time — meaning the collision
// checking done by the caller was completely bypassed with no error or warning.
//
// FIX (concurrent-tunnel pass): interfaces are now named `otnt<N>` (never
// `wg*`), a listenPort is allocated per-tunnel instead of coming from a
// shared hardcoded base.conf value, and the interface is registered in the
// Redis ownership set BEFORE `wg-quick up` runs — not after. A stale
// registry entry for an interface that never came up is harmless (cleanup
// checks kernel existence first); a live interface missing from the
// registry would be permanently unreclaimable under the strict-AND
// ownership rule, so the risk is ordered in the harmless direction.
async function createTunnel({ privateKey, address, peerPublicKey, allowedIPs, endpoint, ifaceName: requestedIfaceName, listenPort: requestedListenPort }) {
  return (tunnelCreationLock = tunnelCreationLock.then(async () => {
    let ifaceName;
    if (requestedIfaceName) {
      if (!isValidIfaceName(requestedIfaceName)) {
        throw new Error(`[WG ERROR] Invalid ifaceName "${requestedIfaceName}" — must be 1-15 chars, alphanumeric/underscore/hyphen only`);
      }
      if (!hasOTNTPrefix(requestedIfaceName)) {
        throw new Error(`[WG ERROR] ifaceName "${requestedIfaceName}" must start with "${OTNT_IFACE_PREFIX}" — OTNT only manages interfaces it can prove ownership of`);
      }
      ifaceName = requestedIfaceName;
    } else {
      // Fallback preserved for backward compatibility / safety net, in
      // case createTunnel is ever called without an ifaceName.
      ifaceName = await getNextFreeOTNTInterface();
    }

    const listenPort = requestedListenPort || await getNextFreePort();

    const confDir = getConfigDir();
    const finalConf = path.join(confDir, `${ifaceName}.conf`);

    let confText;
    try {
      confText = await buildConfig({ privateKey, address, peerPublicKey, allowedIPs, endpoint, listenPort });
    } catch (e) {
      await releasePort(listenPort);
      throw new Error(`[WG ERROR] Failed to build config: ${e.message}`);
    }

    // Register before wg-quick up — see FIX comment above for why this
    // ordering matters.
    await registerIface(ifaceName);

    try {
      if (!isWindows) await exec(`sudo mkdir -p ${confDir} && sudo chmod 700 ${confDir}`);
      else if (!fs.existsSync(confDir)) fs.mkdirSync(confDir, { recursive: true });

      fs.writeFileSync(finalConf, confText, { mode: 0o600 });

      await cleanupIface(ifaceName);

      const cmd = isWindows
        ? `"${process.env['ProgramFiles']}\\WireGuard\\wireguard.exe" /installtunnelservice "${finalConf}"`
        : `sudo wg-quick up ${ifaceName}`;

      const { stdout, stderr } = await exec(cmd);
      if (stderr && !/already exists|WARNING/i.test(stderr)) console.warn(`[WG STDERR] ${stderr.trim()}`);

      console.log(`[WG] Tunnel ${ifaceName} started on port ${listenPort}`);
      return { ifaceName, listenPort, stdout: stdout.trim(), config: confText };
    } catch (err) {
      try { if (!isWindows) await exec(`sudo rm -f "${finalConf}"`); } catch {}
      await deregisterIface(ifaceName);
      await releasePort(listenPort);
      console.error(`[WG ERROR] Tunnel ${ifaceName} creation failed: ${err.message}`);
      throw new Error(`wg-quick up failed for ${ifaceName}: ${err.message}`);
    }
  }));
}

// --- Delete tunnel ---
// FIX (concurrent-tunnel pass): gated on isOTNTOwned() — refuses to touch
// an interface that isn't both otnt-prefixed and registered, even if a
// caller passes one in. This matters more than it used to: index.js's
// cleanupOrphan() feeds ifaceName here straight out of a Redis record, so
// without this gate a poisoned/stale record could reach a raw `sudo`
// exec(). Also deregisters and releases the port allocation on success
// (IP release is the caller's job — see index.js's terminateTunnel/
// cleanupOrphan, since a tunnel holds TWO IPs — server and client — and
// only one interface, so it doesn't fit this function's single-iface shape).
async function deleteTunnel(ifaceName, { listenPort } = {}) {
  if (!isValidIfaceName(ifaceName)) {
    throw new Error(`[WG ERROR] Refusing to delete invalid ifaceName "${ifaceName}"`);
  }
  if (!(await isOTNTOwned(ifaceName))) {
    throw new Error(`[WG ERROR] Refusing to delete "${ifaceName}" — not OTNT-owned (name/registry mismatch)`);
  }

  const confDir = getConfigDir();
  const finalConf = path.join(confDir, `${ifaceName}.conf`);

  try {
    if (!fs.existsSync(finalConf)) {
      console.warn(`[WG DELETE] Config ${finalConf} does not exist. Skipping wg-quick down.`);
    } else {
      const cmd = isWindows
        ? `"${process.env['ProgramFiles']}\\WireGuard\\wireguard.exe" /uninstalltunnelservice "${ifaceName}"`
        : `sudo wg-quick down ${ifaceName}`;
      await exec(cmd);
    }

    if (!isWindows) {
      try { await exec(`sudo ip link delete ${ifaceName}`); } catch {}
      try { await exec(`sudo ip addr flush dev ${ifaceName}`); } catch {}
    }

    if (isLinux) {
      cp.exec(`nmcli connection show --active | grep -F "${ifaceName}"`, (err, stdout) => {
        if (!err && stdout) {
          const connName = stdout.split(/\s+/)[0];
          cp.exec(`nmcli connection delete "${connName}"`, e => {
            if (e) console.warn('Failed to remove NM connection:', e.message);
            else console.log(`[WG] NM connection ${connName} removed`);
          });
        }
      });
    }

    if (fs.existsSync(finalConf)) fs.unlinkSync(finalConf);

    await deregisterIface(ifaceName);
    if (listenPort) await releasePort(listenPort);

    console.log(`[WG] Tunnel ${ifaceName} deleted`);
    return true;
  } catch (err) {
    console.error(`[WG ERROR] Failed to delete tunnel ${ifaceName}: ${err.message}`);
    throw new Error(`Failed to delete tunnel ${ifaceName}: ${err.message}`);
  }
}

// --- Remove a peer from an interface ---
// Not currently called anywhere in index.js's route handlers, but hardened
// with the same isValidIfaceName format guard as every other exec()
// boundary in this file, on the same "never interpolate an unvalidated
// name into a shell command" principle.
async function removePeer(ifaceName, peerPublicKey) {
  if (isWindows) {
    console.warn("[WG] removePeer not supported on Windows");
    return false;
  }
  if (!ifaceName || !peerPublicKey) {
    throw new Error("ifaceName and peerPublicKey are required");
  }
  if (!isValidIfaceName(ifaceName)) {
    throw new Error(`[WG ERROR] Invalid ifaceName "${ifaceName}" passed to removePeer`);
  }

  try {
    await exec(`sudo wg set ${ifaceName} peer ${peerPublicKey} remove`);
    console.log(`[WG] Peer ${peerPublicKey} removed from ${ifaceName}`);
    return true;
  } catch (err) {
    console.error(`[WG ERROR] Failed to remove peer ${peerPublicKey} from ${ifaceName}: ${err.message}`);
    throw err;
  }
}

// --- Get transfer bytes ---
// FIX (dual-condition edge-case pass): previously this function CAUGHT any
// error from `sudo wg show <iface> transfer` and silently returned 0. That
// meant a transient read failure (e.g. interface mid-teardown, a permissions
// hiccup) could momentarily stomp a tunnel's real, already-accumulated
// dataUsed with a misleading 0 — potentially resetting how close a tunnel
// looked to its data cap. This function now THROWS instead, and index.js
// (both the /api/tunnel/status/:id route and the data-cap monitor) catches
// it and explicitly keeps the last known good value rather than overwriting
// it with 0. This is a coordinated change — do not revert this file back to
// swallow-and-return-0 without also reverting the corresponding index.js logic.
//
// FIX (concurrent-tunnel pass): added the isValidIfaceName format guard —
// this is called on every status poll and every 250ms data-cap tick with
// an ifaceName that, after a rehydration, originates from a Redis record,
// so it needs the same shell-injection guard as the mutating paths even
// though this call itself is read-only.
async function getTransferBytes(ifaceName) {
  if (isWindows) return 0;
  if (!isValidIfaceName(ifaceName)) {
    throw new Error(`[WG ERROR] Invalid ifaceName "${ifaceName}" passed to getTransferBytes`);
  }

  const { stdout } = await exec(`sudo wg show ${ifaceName} transfer`);
  let total = 0;
  stdout.trim().split('\n').forEach(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) total += (parseInt(parts[1], 10) || 0) + (parseInt(parts[2], 10) || 0);
  });
  return total;
}

module.exports = {
  createTunnel,
  deleteTunnel,
  removePeer,
  getTransferBytes,
  cleanupStaleTunnels,
  cleanupIface,
  getUsedIPs,
  getNextFreeIP,
  releaseIP,
  getNextFreePort,
  releasePort,
  getNextFreeOTNTInterface,
  isOTNTOwned,
  buildConfig,
  OTNT_IFACE_PREFIX
};
