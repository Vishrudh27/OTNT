# Phase 5 — Redis/Valkey AOF Persistence Test

**Date:** 2026-09-08
**Status:** PASSED
**Change verified:** `appendonly no` → `appendonly yes` in `/etc/valkey/valkey.conf` (this host runs Valkey, a Redis-compatible fork, as the `valkey` systemd service — `redis-cli`/`REDIS_URL` talk to it identically).

## Why this test exists

Before this change, tunnel records only survived a **backend** restart (Objective 2 — the Redis rehydration path in `index.js`). They did not survive a restart of Redis/Valkey itself, or a full machine reboot, because Valkey's default RDB-only persistence only snapshots periodically (`save` rules) — a hard kill between snapshots loses everything written since the last save. Enabling AOF (`appendonly yes`) makes every write durable as it happens.

A config flag alone isn't proof — the only real evidence is a tunnel record surviving an actual hard kill with the RDB snapshot deliberately skipped, forcing any survival to come from the AOF, not from a lucky recent RDB save.

## Methodology

1. Confirmed Redis/Valkey was clean (`redis-cli KEYS 'otnt:*'` → empty) before the test.
2. Created one **real** tunnel record through the actual production code path — `POST /api/handshake/init` against the already-running backend, with a genuine X25519 public key — rather than a synthetic `redis-cli SET`. This exercises the real `persistTunnel()` → `redisClient.saveTunnel()` path.
3. Captured the record's full JSON and its registry-set memberships (`otnt:tunnel:ids`, `otnt:ips`) before the kill.
4. Killed Valkey with `redis-cli SHUTDOWN NOSAVE` — this explicitly skips writing an RDB snapshot on the way down, so nothing but the AOF can explain survival.
5. Confirmed the process was actually down (`systemctl is-active` → `inactive`, `redis-cli PING` → connection refused) before restarting.
6. Restarted the service (`sudo systemctl start valkey`) and re-read the same key.
7. Cleaned up the test record afterward (`DEL`, `SREM` from both registry sets) so no test artifact was left behind.

## Results

| # | Assertion | Result |
|---|---|---|
| 1 | `appendonly` reports `yes` after the config edit + service restart | ✅ |
| 2 | A real handshake-created tunnel record exists in Redis before the kill | ✅ `otnt:tunnel:d743e0bb-5ddc-4995-aa95-d239ede9def1` |
| 3 | Valkey is genuinely down after `SHUTDOWN NOSAVE` (not just reporting stale state) | ✅ `systemctl is-active` → `inactive`, `PING` → connection refused |
| 4 | After restart, the tunnel record is present and **byte-for-byte identical** to the pre-kill JSON | ✅ |
| 5 | The registry sets (`otnt:tunnel:ids`, `otnt:ips`) also survived | ✅ both present with the same members |
| 6 | `appendonly` is still `yes` after the restart (survives the restart itself, not just a live `CONFIG SET`) | ✅ |

## Evidence

Pre-kill record:
```json
{"id":"d743e0bb-5ddc-4995-aa95-d239ede9def1","ifaceName":null,"listenPort":null,"wgPriv":"krZW4mebuPe7fABslNBfg/89iRkyRqguqOwBev8yzbM=","wgPub":"41P1TfuB/OaR4oULup0+s8s8diuM6ZhQWdLRM74VVAI=","serverIP":"10.77.0.2/32","clientIP":"10.77.0.3/32","serverECDHPrivateKey":"bJOaotJzYWVcIjs5bZY2XfGZIt8bAG2iI+V62gzBBS0=","serverECDHPublicKey":"zJZps911ytGGZ3Eg5xtOGucDKGkXZBdHbddpNOUKlQg=","clientECDHPublicKey":"7WcNm/7jeJlbotXHz+nWQlyXVuz9POaH1OBNepbpaSM=","ecdhShared":"WGMmzY99yS+GTqy6usgoQ68GtHA3kLRQRE0eQ8/vGic=","peerPublicKey":null,"expiry":null,"dataCap":null,"dataUsed":0,"clientConfig":null,"clientIfaceName":null,"terminating":false}
```

```
$ redis-cli SHUTDOWN NOSAVE
$ systemctl is-active valkey
inactive
$ redis-cli PING
Could not connect to Valkey at 127.0.0.1:6379: Connection refused
$ sudo systemctl start valkey
$ redis-cli PING
PONG
```

Post-restart record (identical to pre-kill):
```json
{"id":"d743e0bb-5ddc-4995-aa95-d239ede9def1","ifaceName":null,"listenPort":null,"wgPriv":"krZW4mebuPe7fABslNBfg/89iRkyRqguqOwBev8yzbM=","wgPub":"41P1TfuB/OaR4oULup0+s8s8diuM6ZhQWdLRM74VVAI=","serverIP":"10.77.0.2/32","clientIP":"10.77.0.3/32","serverECDHPrivateKey":"bJOaotJzYWVcIjs5bZY2XfGZIt8bAG2iI+V62gzBBS0=","serverECDHPublicKey":"zJZps911ytGGZ3Eg5xtOGucDKGkXZBdHbddpNOUKlQg=","clientECDHPublicKey":"7WcNm/7jeJlbotXHz+nWQlyXVuz9POaH1OBNepbpaSM=","ecdhShared":"WGMmzY99yS+GTqy6usgoQ68GtHA3kLRQRE0eQ8/vGic=","peerPublicKey":null,"expiry":null,"dataCap":null,"dataUsed":0,"clientConfig":null,"clientIfaceName":null,"terminating":false}
```

## Notes for whoever deploys this (Objective 3, later pass)

- This change is host-level (`/etc/valkey/valkey.conf`), not part of this repo — a fresh deployment (VPS, another dev machine) must enable AOF the same way; it does not travel with `git clone`. Worth calling out explicitly in the reproducibility docs when that later pass happens.
- The test tunnel record and its IP allocations were removed from Redis after the test (`DEL`/`SREM`); nothing was left behind.
- Not covered by this pass (explicitly deferred): actually deploying to a live VPS, `npm run reap`, and reproducibility docs.
