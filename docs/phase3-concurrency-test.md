# Phase 3 — Two-Tunnel Concurrent Acceptance Test

**Date:** 2026-09-08
**Status:** PASSED — all 7 assertions
**Fixes verified:** removal of the blanket `cleanupOTNTInterfaces()` wipe on every `/api/tunnel/create` call, the ownership-registry gate (`otnt*` prefix AND Redis `otnt:ifaces` membership) on every destructive WireGuard operation, and per-tunnel `ListenPort` allocation (pool 51820–51869) replacing the old hardcoded `51820` in `config/base.conf`.

## Why this test exists

Before this fix, OTNT could only ever run one tunnel at a time: creating a second tunnel called `cleanupOTNTInterfaces()`, which deleted **every** interface whose name started with `wg` or `client` — silently destroying the first tunnel's kernel interface (while its Redis record, in-memory entry, and timers all survived), and would have deleted a user's own unrelated `wg0` as collateral. All tunnels also shared the same hardcoded `ListenPort = 51820`, so even without the wipe, a second `wg-quick up` would have failed to bind the port.

A clean startup log was never sufficient evidence this was fixed — the only real proof is two tunnels genuinely coexisting under load. This document records that test.

## Methodology

- **Tunnel A:** 2 MB data cap, no expiry.
- **Tunnel B:** 90 s expiry, no data cap — created *while A was live and mid-transfer*.
- **Traffic for A was not simulated.** A second, real WireGuard peer was brought up in an isolated Linux network namespace, connected to the host via a veth pair, with its own genuine X25519/WireGuard keypair. A throttled (~100 KB/s) HTTP download was pulled through that peer, across the real encrypted tunnel, from a local HTTP server — so the server-side `otnt0` interface's transfer counters reflect genuine WireGuard-encrypted traffic, not a fabricated counter.
- An unrelated `wg0` interface was deliberately created before the test (`ip link add wg0 type wireguard`) and left alone throughout, to prove the ownership gate leaves non-OTNT interfaces untouched.
- All assertions were checked directly against live `wg show`, the Redis registries, and the backend's own audit log — not inferred.

## Results

| # | Assertion | Result |
|---|---|---|
| 1 | `otnt0`/`otnt1` live simultaneously, with distinct listening ports and IPs | ✅ ports 51820 / 51821, peer addresses 10.77.0.3/32 / 10.77.0.5/32 |
| 2 | A's transfer counters keep climbing across B's creation (the core regression test) | ✅ 1.36 MB → 1.59 MB (pre-B) → 1.91 MB (post-B, after B existed) |
| 3 | A tears down on its data cap; `otnt1` is still present immediately after | ✅ A torn down 6 s after B was created; `otnt1` confirmed still up at that moment |
| 4 | B expires independently, on time | ✅ torn down 91 s after creation (90 s target) |
| 5 | Exactly one audit termination line per tunnel — never two | ✅ one `hit data cap and was deleted`, one `expired`; no duplicates |
| 6 | Redis tunnel keys and the `otnt:ifaces`/`otnt:ips`/`otnt:ports` registries drain back to empty | ✅ all `SCARD` 0, zero `otnt:*` keys remaining |
| 7 | A pre-existing, unrelated `wg0` survives startup, both creates, and both teardowns untouched | ✅ present throughout; only removed afterward by the test's own manual cleanup, never by OTNT |

## Evidence

### Backend log — clean concurrent run, both interfaces starting and stopping independently

```
[REDIS] Connecting...
[REDIS] Connected and ready ✅
[REDIS] No records found
🚀 OTNT Backend listening at http://0.0.0.0:3001
[AUDIT] 2026-09-07T20:38:12.658Z Handshake init for 37421acf-9c11-4ac1-b468-176f716e2af7
[WG STDERR] [#] ip link add dev otnt0 type wireguard
[#] wg addconf otnt0 /dev/fd/63
[#] ip -4 address add 10.77.0.2/32 dev otnt0
[#] ip link set mtu 65456 up dev otnt0
[#] ip -4 route add 10.77.0.3/32 dev otnt0
[WG] Tunnel otnt0 started on port 51820
[AUDIT] 2026-09-07T20:38:12.866Z Tunnel created: 37421acf-9c11-4ac1-b468-176f716e2af7
[AUDIT] 2026-09-07T20:38:19.171Z Handshake init for eadb138a-75eb-4a4b-a6cf-cd59756bfa7a
[WG STDERR] [#] ip link add dev otnt1 type wireguard
[#] wg addconf otnt1 /dev/fd/63
[#] ip -4 address add 10.77.0.4/32 dev otnt1
[#] ip link set mtu 65456 up dev otnt1
[#] ip -4 route add 10.77.0.5/32 dev otnt1
[WG] Tunnel otnt1 started on port 51821
[AUDIT] 2026-09-07T20:38:19.468Z Tunnel created: eadb138a-75eb-4a4b-a6cf-cd59756bfa7a
[WG] Tunnel otnt0 deleted
[AUDIT] 2026-09-07T20:38:24.006Z Tunnel 37421acf-9c11-4ac1-b468-176f716e2af7 hit data cap and was deleted
[WG] Tunnel otnt1 deleted
[AUDIT] 2026-09-07T20:39:50.162Z Tunnel eadb138a-75eb-4a4b-a6cf-cd59756bfa7a expired
```

Note `otnt0` on port 51820 and `otnt1` on port 51821 — two different ports from the pool, allocated and used simultaneously. Under the old code this second `wg-quick up` would have failed outright (port already bound) even before the interface got wiped.

### `wg show` — both interfaces live at once, right after tunnel B's creation (assertion 1)

```
interface: wg0

interface: otnt0
  public key: qYdAFFve8NeYaJSJQAM0mEgeY4zfKd1EKYUlnomgaS4=
  private key: (hidden)
  listening port: 51820

peer: 4JJtLb7RloHUr1TJXes6DUoyd36Es8VVu7UlLhJGHkc=
  endpoint: 169.254.99.2:49519
  allowed ips: 10.77.0.3/32
  latest handshake: 7 seconds ago
  transfer: 13.85 KiB received, 1.62 MiB sent
  persistent keepalive: every 25 seconds

interface: otnt1
  public key: et2FYpeXVCaJSRkgPMWaPUtKXBHCIs6M/fCOea66Vnc=
  private key: (hidden)
  listening port: 51821

peer: BZ+ocoVWSPzpRgU5XTqJ1kz8CZgyXrrH0/HK4MbdK3Q=
  endpoint: 192.168.29.154:51821
  allowed ips: 10.77.0.5/32
  transfer: 0 B received, 148 B sent
  persistent keepalive: every 25 seconds
```

`wg0` — the deliberately-created unrelated interface — sits alongside both live OTNT tunnels, untouched.

### A's transfer counters across B's creation (assertion 2 — the core regression proof)

Raw `wg show otnt0 transfer` samples (`<peer-pubkey>  <rx-bytes>  <tx-bytes>`):

```
pre-B  sample #0:  4JJtLb7R...  rx=12452   tx=1364928
pre-B  sample #1:  4JJtLb7R...  rx=13700   tx=1585792
                    --- Tunnel B created here (otnt1, port 51821) ---
post-B sample #0:  4JJtLb7R...  rx=15428   tx=1914096   <- still climbing after B exists
post-B sample #1:  ERR — otnt0 no longer exists (data cap tripped, ~1.93 MB > 2 MB threshold crossed moments later)
post-B sample #2:  ERR — otnt0 no longer exists
```

A's traffic kept growing for as long as it was alive, completely unaffected by B's creation — under the pre-fix code, `otnt0` would already have been destroyed the instant B's `/api/tunnel/create` call ran `cleanupOTNTInterfaces()`.

### Final state (assertions 4, 6, 7)

```
ASSERTION 4 — B expires independently: yes, elapsed 91s since B create (expected ~90s)
ASSERTION 7 — wg0 STILL present:
  11: wg0: <POINTOPOINT,NOARP> mtu 1420 qdisc noop state DOWN mode DEFAULT group default qlen 1000
      link/none
final wg show (only wg0 remains, no peers, no otnt*):
  interface: wg0
ASSERTION 6 — redis otnt:* keys: (none)
ASSERTION 6 — SCARD otnt:ifaces: 0
ASSERTION 6 — SCARD otnt:ips: 0
ASSERTION 6 — SCARD otnt:ports: 0
```

No warnings or errors appeared anywhere in the backend log for the duration of the run.

## Reproducing this test

The throwaway test harness (network namespace + veth pair + a real second WireGuard peer + throttled `curl` download) lived in the session's scratch directory and was not preserved, since it was a manual verification tool rather than CI-safe test infrastructure (it needs root and the `wireguard` kernel module). The automated Jest suite added in Phase 4 covers the same logic paths (ownership checks, allocator concurrency/release, expiry timing) with the `child_process.exec` layer mocked, since real tunnel creation isn't possible in CI. This document is the durable record of the one time it was proven end-to-end against real kernel WireGuard interfaces.
