# OTNT — Reproducibility Guide

How to get OTNT running from a fresh clone. This is an operator/setup doc, not an architecture explainer — see the code's own comments (`backend/index.js`, `backend/wireguard.js`) for how the system works internally.

## Prerequisites

- **Linux** with the WireGuard kernel module and userspace tools installed:
  - Debian/Ubuntu: `sudo apt install wireguard wireguard-tools`
  - Fedora: `sudo dnf install wireguard-tools`
  - Arch/Manjaro: `sudo pacman -S wireguard-tools`
- **Node.js** — developed and tested against v26.x. `npm` comes bundled.
- **Redis or a Redis-compatible server.** This project has been run against both real Redis and **Valkey** (a Redis-compatible fork) interchangeably — the backend only needs something speaking the Redis protocol on `REDIS_URL`. Tested against Valkey 7.2.4-protocol-compatible / Valkey 9.1.1.
- **sudo privileges** for the user running the backend — WireGuard interface management (`wg`, `wg-quick`, `ip`) requires root.

## 1. Redis/Valkey setup

Install and start the server (however your distro packages it — `redis-server` or `valkey-server`, typically via systemd: `sudo systemctl enable --now redis` or `valkey`).

**Enable AOF persistence before relying on this for anything beyond local dev.** By default Redis/Valkey only snapshots periodically (RDB), which means a hard kill or machine reboot between snapshots loses everything written since — including live tunnel records. Backend restarts alone are fine without this (tunnel records are rehydrated from whatever Redis already has), but Redis itself dying or the machine rebooting is not, until AOF is on:

```
# in redis.conf / valkey.conf
appendonly yes
```

Restart the service after editing, then confirm:
```
redis-cli CONFIG GET appendonly   # should print "yes"
redis-cli PING                    # should print PONG
```

See `docs/phase5-aof-persistence-test.md` for a worked example of verifying this actually survives a real kill, not just a config check.

## 2. The sudoers rule (optional)

The backend needs root to run `wg`, `wg-quick`, and `ip`. Two ways to satisfy that:

- **Simple (default, no extra setup):** run the whole backend as root — `sudo node index.js`. You'll be prompted for a password once at startup; the process then holds root for its lifetime.
- **Scoped passwordless (optional):** if you'd rather run `node index.js` as a normal user and only escalate for the three binaries OTNT actually needs, add a scoped `NOPASSWD` rule via `sudo visudo -f /etc/sudoers.d/otnt-wireguard`:
  ```
  <your-username> ALL=(root) NOPASSWD: /usr/bin/wg, /usr/bin/wg-quick, /usr/bin/ip
  ```
  (adjust the binary paths to `which wg` / `which wg-quick` / `which ip` on your system). This is optional — the codebase doesn't assume it exists, and running the whole process as root works identically either way.

## 3. Backend

```
cd backend
npm install
cp .env.example .env      # adjust PORT / REDIS_URL / CORS_ORIGINS as needed
sudo node index.js
```

Expected startup log order — **do not skip steps or reorder services**, this order is load-bearing (see the big comment block at the top of `index.js`):
```
[REDIS] Connecting...
[REDIS] Connected and ready ✅
[REDIS] No records found          <- or "Found N tunnel record(s)..." on a warm restart
🚀 OTNT Backend listening at http://0.0.0.0:3001
```
Redis must be reachable and rehydration must complete *before* the kernel-interface cleanup sweep runs, or a live tunnel's interface could be destroyed on restart — this is why `connectRedis()` → `rehydrateTunnels()` → `cleanupStartup()` → `app.listen()` is a fixed order, not an implementation detail.

## 4. Frontend

```
cd frontend
npm install
cp .env.example .env      # adjust VITE_API_BASE if the backend isn't on localhost:3001
npm run dev
```
Opens on `http://localhost:5173` by default (Vite).

## 5. Networking

- Each concurrent tunnel gets its own WireGuard `ListenPort`, allocated from the pool **UDP 51820–51869** (50 concurrent tunnels max at this port-range size — see `PORT_RANGE_START`/`PORT_RANGE_END` in `backend/wireguard.js`). If deploying beyond `localhost`/LAN, this whole UDP range must be reachable from wherever clients connect.
- The backend's own HTTP API (handshake, tunnel create/status/delete) listens on `PORT` (default `3001`, TCP) — this is separate from the WireGuard UDP ports above and needs to be reachable by the frontend, per `CORS_ORIGINS`/`VITE_API_BASE`.
- Tunnel client/server addresses are allocated from `10.77.0.0/24`, one `/32` host route per side per tunnel (see `getNextFreeIP()` in `backend/wireguard.js`).

## 6. Operator maintenance

- `npm run reap` (from `backend/`) — lists any `otnt*` kernel interface that exists but isn't in the Redis ownership registry (the "registry loss" failure mode: e.g. a Redis flush while tunnels were live). These are never touched automatically by design — this is the manual, confirmation-gated cleanup path. Run with `-- --yes` to actually delete after a typed confirmation.

## Known constraints, not bugs

- Everything above assumes `localhost`/LAN. Deploying to a real internet-facing host is out of scope for this doc (Objective 3's later, not-yet-done work).
- `npm run reap` requires the same `sudo` access as the backend itself for the actual teardown (`wg-quick down`, `ip link delete`) — listing orphans does not.
