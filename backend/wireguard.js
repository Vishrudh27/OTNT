// wireguard.js - Cross-platform WireGuard helper (final updated with peer removal)
const util = require('util');
const cp = require('child_process');
const exec = util.promisify(cp.exec);
const fs = require('fs');
const path = require('path');
const os = require('os');

const baseConfigPath = path.join(__dirname, 'config', 'base.conf');

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

const reservedIPs = new Set(); // tracks IPs reserved for tunnels in memory

function getConfigDir() {
  return isWindows
    ? path.join(process.env['ProgramFiles'], 'WireGuard', 'Data', 'Configurations')
    : '/etc/wireguard';
}

// --- Get all used 10.77.0.x IPs from interfaces and configs ---
async function getUsedIPs() {
  const used = new Set(reservedIPs);

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
      const files = fs.readdirSync(confDir).filter(f => f.endsWith('.conf'));
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
      reservedIPs.add(i);
      return `${base}${i}/32`;
    }
  }
  throw new Error("No free 10.77.0.x IPs available!");
}

// --- Cleanup stale tunnels ---
async function cleanupStaleTunnels(tunnelsMap = null) {
  if (isWindows) return;

  const confDir = getConfigDir();
  try {
    const { stdout } = await exec("ip -o link show | grep wg || true");
    const ifaces = stdout.trim()
      ? stdout.trim().split("\n").map(l => l.split(":")[1]?.trim()).filter(Boolean)
      : [];

    for (const iface of ifaces) {
      if (tunnelsMap && Array.from(tunnelsMap.values()).some(t => t.ifaceName === iface)) continue;

      try { await exec(`sudo wg-quick down ${iface}`); } catch {}
      try { await exec(`sudo ip link delete ${iface}`); } catch {}
      try { await exec(`sudo ip addr flush dev ${iface}`); } catch {}
      console.log(`[WG CLEANUP] Stale tunnel ${iface} removed`);
    }

    if (fs.existsSync(confDir)) {
      const files = fs.readdirSync(confDir).filter(f => f.endsWith('.conf'));
      for (const f of files) fs.unlinkSync(path.join(confDir, f));
    }
  } catch (err) {
    console.warn("[WG WARN] Cleanup failed:", err.message);
  }
}

// --- Single-iface cleaner ---
async function cleanupIface(ifaceName) {
  if (isWindows || !ifaceName) return false;
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
async function buildConfig({ privateKey, address, peerPublicKey, allowedIPs, endpoint }) {
  let base = fs.readFileSync(baseConfigPath, 'utf8');

  if (/^\s*PrivateKey\s*=/mi.test(base)) {
    base = base.replace(/^\s*PrivateKey\s*=.*$/mi, `PrivateKey = ${privateKey}`);
  } else {
    base = base.replace(/\[Interface\]/i, `[Interface]\nPrivateKey = ${privateKey}`);
  }

  let serverIP = address;
  if (!serverIP) serverIP = await getNextFreeIP();
  base = base.replace(/Address\s*=.*$/mi, `Address = ${serverIP}`);

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

// --- Validate an interface name is safe to interpolate into shell commands ---
// Linux interface names are capped at 15 chars; we also restrict to
// alphanumeric/underscore/hyphen to rule out any shell-injection surface,
// since ifaceName gets interpolated directly into `exec()` calls below.
function isValidIfaceName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]{1,15}$/.test(name);
}

// --- Create tunnel ---
// FIX (Priority #3, engineering review): previously this function's parameter
// destructuring did not include `ifaceName` at all, so even when index.js's
// getNextFreeWGInterface() result was passed in as { ifaceName: 'wg7', ... },
// JS silently dropped it (destructuring ignores unnamed properties) and a
// fresh random name was generated every single time — meaning the collision
// checking done in index.js was completely bypassed with no error or warning.
async function createTunnel({ privateKey, address, peerPublicKey, allowedIPs, endpoint, ifaceName: requestedIfaceName }) {
  return (tunnelCreationLock = tunnelCreationLock.then(async () => {
    let ifaceName;
    if (requestedIfaceName) {
      if (!isValidIfaceName(requestedIfaceName)) {
        throw new Error(`[WG ERROR] Invalid ifaceName "${requestedIfaceName}" — must be 1-15 chars, alphanumeric/underscore/hyphen only`);
      }
      ifaceName = requestedIfaceName;
    } else {
      // Fallback preserved for backward compatibility / safety net,
      // in case createTunnel is ever called without an ifaceName.
      ifaceName = `wg${Math.floor(Math.random() * 10000)}`;
    }

    const confDir = getConfigDir();
    const finalConf = path.join(confDir, `${ifaceName}.conf`);

    let confText;
    try {
      confText = await buildConfig({ privateKey, address, peerPublicKey, allowedIPs, endpoint });
    } catch (e) {
      throw new Error(`[WG ERROR] Failed to build config: ${e.message}`);
    }

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

      console.log(`[WG] Tunnel ${ifaceName} started`);
      return { ifaceName, stdout: stdout.trim(), config: confText };
    } catch (err) {
      try { if (!isWindows) await exec(`sudo rm -f "${finalConf}"`); } catch {}
      console.error(`[WG ERROR] Tunnel ${ifaceName} creation failed: ${err.message}`);
      throw new Error(`wg-quick up failed for ${ifaceName}: ${err.message}`);
    }
  }));
}

// --- Delete tunnel ---
async function deleteTunnel(ifaceName) {
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
      cp.exec(`nmcli connection show --active | grep ${ifaceName}`, (err, stdout) => {
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

    console.log(`[WG] Tunnel ${ifaceName} deleted`);
    return true;
  } catch (err) {
    console.error(`[WG ERROR] Failed to delete tunnel ${ifaceName}: ${err.message}`);
    throw new Error(`Failed to delete tunnel ${ifaceName}: ${err.message}`);
  }
}

// --- Remove a peer from an interface ---
async function removePeer(ifaceName, peerPublicKey) {
  if (isWindows) {
    console.warn("[WG] removePeer not supported on Windows");
    return false;
  }
  if (!ifaceName || !peerPublicKey) {
    throw new Error("ifaceName and peerPublicKey are required");
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
async function getTransferBytes(ifaceName) {
  if (isWindows) return 0;

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
  buildConfig
};
