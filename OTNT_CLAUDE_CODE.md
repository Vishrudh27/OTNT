# OTNT — Project Handoff for Claude Code

**Read this whole file before touching any code.** This is the complete, current state of the project, handed off from a planning/design conversation (Claude Sonnet in Claude.ai) to you (Claude Code) for continued implementation, verification, and completion. It consolidates six rounds of memory blocks plus one engineering-review session into a single source of truth.

---

## 1. What OTNT Is

**Full name:** OTNT — One-Time Network Tunnel

**One-line description:** A self-destructing WireGuard VPN tunnel system that automatically destroys its own tunnel infrastructure (kernel interface, IP allocation, keys, config) when EITHER a configured time limit OR a configured data-transfer cap is reached — whichever comes first ("dual-condition expiry").

**Why it matters (the research angle):** No 2022–2026 peer-reviewed paper was found (cross-verified via Consensus and Elicit, two independent AI academic search tools) implementing protocol-native, policy-driven WireGuard tunnel expiration by idle time, data volume, or both combined. Existing work either does WireGuard-level cryptographic rekeying (session-key freshness, not tunnel termination) or Zero-Trust-level access revocation (above the VPN protocol, not inside it). OTNT's claimed contribution sits in that gap.

**This is a final-year cybersecurity project (FYP)** at Sri Krishna College of Engineering and Technology, Dept. of Cyber Security, Batch No. 14, Supervisor Ms. S. Soniya. Team: Lokesh J, Samuvel A, Santhosh M, Vishrudh N. Zeroth Review was delivered 23/06/2026. There have been subsequent review milestones (Review 1 engineering-completion deadline already passed as of this handoff — see Section 8 for what's actually verified).

**⚠️ Important presentation rule, not a code rule — but don't violate it if generating any jury-facing artifacts (slides, diagrams, docs):** the user does not want reviewers to know Objective 1 (the core system) was substantially pre-built before the semester's official "build" timeline. Internally we track true completion status honestly; anything shown to juries should frame objectives as forward-looking targets ("to be built"), not as already-done. This has no bearing on how you should write or comment code — write code and commit messages normally and honestly. It only matters if asked to produce a slide deck, doc, or diagram intended for reviewers.

---

## 2. Tech Stack

- **Frontend:** React + Vite, Material-UI (MUI), `qrcode.react`, `tweetnacl` (client-side crypto), `lucide-react` (icons, added during UI redesign)
- **Backend:** Node.js + Express, `tweetnacl`, Node's built-in `crypto`, `child_process`/`os`/`fs`/`path`, `express-rate-limit`, `express-validator`, `uuid`, `redis` (npm package, added for Objective 2)
- **VPN layer:** WireGuard, driven via shelling out to `wg`, `wg-quick`, `ip` (all via `sudo`)
- **Persistence:** Redis (in progress — see Section 5)
- **Comms:** REST via Axios
- **Dev environment:** Linux (zsh), backend run via `sudo node index.js` (root, one password prompt at startup — deliberate tradeoff, see Section 4), frontend via `npm run dev` (Vite, port 5173), backend listens on port 3001, WireGuard IP range `10.77.0.x`, port `51820`.

---

## 3. Repo Structure & Per-File Status

```
OTNT/
  backend/
    index.js              — JUST REWRITTEN this session (Redis-integrated). NOT YET RE-VERIFIED running. See Section 5.
    redisClient.js         — NEW. Verified working standalone (connect + save + read-back test passed).
    wireguard.js            — Fixed (ifaceName bug), NOT YET migrated to Redis for IP tracking (reservedIPs still a plain in-memory Set — see Section 6, next task).
    auditLogger.js           — Still a 4-line console.log wrapper. NOT tamper-evident. Known limitation, deferred to a later objective.
    config/base.conf          — Static WG interface stub, untouched, fine as-is.
    package.json                — Has redis dependency now (confirm it's actually listed — verify during first Claude Code session).
  frontend/
    src/
      App.jsx                          — Rewritten during UI redesign (2 rounds). Round 2 NOT YET CONFIRMED tested by user.
      api.js                           — DEAD, duplicate API client. Flagged for deletion, NOT YET deleted.
      api/axios.js                     — The real, live API client. Untouched, correct.
      theme.js                          — NEW (UI redesign). Round 2 palette in place.
      components/
        TunnelForm.jsx                 — Correct WireGuard keypair generation (never touched by the peer-identity fix — it was already right). Has the Math.round() data-cap-bytes fix and the dead allowedIPs field removed. Spacing-only tweak in UI round 2.
        TunnelStatus.jsx                — Restyled (2×2 stat grid in round 2 via StatCard sub-components).
        DownloadEncryptedConfig.jsx    — Rewritten for the peer-identity fix (splices real client private key into a placeholder token client-side). Also restyled with chips in round 2.
        ConfigQRCode.jsx                — DEAD, unused (QR rendering happens inline in DownloadEncryptedConfig.jsx). Flagged for deletion, NOT YET deleted.
        SecureSessionCard.jsx           — NEW (UI redesign round 1, refined round 2). Must have .jsx extension (a .js-extension bug was hit and fixed once already — watch for this on any new JSX file).
        TunnelLifecycle.jsx             — NEW (UI redesign), horizontal lifecycle timeline.
        HowItWorksPanel.jsx             — NEW (UI redesign round 2), fills the empty-state screen before a tunnel exists.
      utils/cryptoClient.js            — Untouched, clean, correct (base64 helpers, AES-GCM decrypt).
      utils/wireguardKeys.js            — Untouched, clean, correct (X25519 keypair generation via TweetNaCl).
    index.html                         — Has Google Fonts Inter <link> tags added (UI redesign).
    package.json                        — Needs lucide-react added (was not in original deps).
```

---

## 4. What Is Fully Done and Empirically Verified (do not re-litigate these)

1. **X25519 ECDH handshake** (client ↔ server) — real, correct, both sides.
2. **AES-256-GCM encrypted config delivery** — real, correct crypto round-trip.
3. **Dynamic, collision-checked IP allocation** (`getNextFreeIP()`) — works.
4. **Dual-condition (time OR data) expiry engine** — both triggers correctly tear down.
5. **Crash-recovery cleanup on boot** (`cleanupStartup()` → `wireguard.cleanupStaleTunnels()`).
6. **The peer-identity bug is fixed and empirically verified.** Original bug: the backend generated a second, throwaway "client" WireGuard keypair server-side and put its private key into the downloadable config — but the kernel interface actually trusted a *different* public key the browser had generated. Fix: backend no longer generates/stores any client private key at all; the downloadable config template contains a placeholder (`__OTNT_CLIENT_PRIVATE_KEY__`) that the browser splices its own already-generated private key into, client-side, after decrypting. **Verified via clean single-tunnel test:** `wg pubkey` on the downloaded config's `PrivateKey` matched `sudo wg show <iface>`'s `peer:` line character-for-character.
7. **`ifaceName` bug fixed.** `wireguard.js`'s `createTunnel()` used to silently ignore the `ifaceName` parameter passed from `index.js` and generate its own random `wg${0-9999}` name instead — meaning the "collision-checked" interface allocation the PPT claimed was actually discarded. Fixed: `ifaceName` is now destructured and used, with a regex guard (`/^[a-zA-Z0-9_-]{1,15}$/`) added since it's interpolated into shell `exec()` calls.
8. **Input validation added.** `peerPublicKey` / `clientECDHPublicKey` are now validated as well-formed base64 decoding to exactly 32 raw bytes (`isValidX25519KeyB64()`), wired into all three relevant endpoints. Previously only checked for "non-empty string."
9. **Passwordless sudo configured but not used.** A scoped `NOPASSWD` sudoers rule exists for `ip`/`wg`/`wg-quick` at `/etc/sudoers.d/otnt-wireguard`, confirmed working via exit-code checks. Deliberate decision was made to keep running the whole backend via `sudo node index.js` anyway (root process, one password prompt at startup) rather than switch — accepted as a reasonable tradeoff vs. a mid-demo hang risk if a sudo session times out. The scoped rule is inert but harmless; don't remove it, don't feel obligated to switch the run mode.
10. **Real second-device WireGuard handshake confirmed.** A phone (WireGuard app) scanned the QR code, connected, and `sudo wg show wg1` showed a real, live handshake with nonzero transfer bytes in both directions. This is the single strongest proof point in the whole project — the crypto chain, the peer-identity fix, and the actual kernel-level tunnel all genuinely work end-to-end on real hardware.
11. **Dual-condition race condition found and fixed.** The expiry timer and data-cap monitor were independent `setInterval`s that could both fire in the same tick and both try to tear down the same tunnel, undermining the "whichever comes first" claim. Fixed with a `t.terminating` flag checked and set *synchronously* (before any `await`) in every teardown path — timer callbacks, and the manual delete route, all funnel through one shared `terminateTunnel()` function now.
12. **Data-cap monitor polling interval reduced 1000ms → 250ms**, shrinking (not eliminating — inherent to polling) worst-case overshoot 4x. This is a documented, honest limitation, not something to "fix away" — state it explicitly if writing evaluation/methodology text.
13. **`getTransferBytes()` failure handling fixed.** It used to swallow errors and return `0`, which could momentarily stomp a tunnel's real `dataUsed` with a misleading zero mid-teardown. Now it throws, and callers (`index.js`) catch it and explicitly keep the last known good value instead of resetting to zero. **`index.js` and `wireguard.js` are a matched pair on this — don't mix an old version of one with a new version of the other.**
14. **Data-cap MB→bytes rounding bug found (by the user, independently) and fixed.** Entering `0.1` MB produced a fractional byte count (`104857.6`), rejected by the backend's `isInt({ min: 1 })` validator. Fixed in `TunnelForm.jsx` by wrapping in `Math.round(...)`.
15. **Dead `allowedIPs` form field removed from the UI.** It was rendered but had zero functional effect — the value the backend actually uses for peer registration is the server-generated `clientIP`, not anything from that form field. Removed from the rendered UI; `form.allowedIPs` kept in component state with its original default so the payload shape sent to the backend is unchanged.
16. **Live file-transfer demo run over the tunnel** (5MB file via `python3 -m http.server`, downloaded from phone through the tunnel). Revealed a genuine finding, not a bug: `AllowedIPs = 0.0.0.0/0` means the kernel byte counter sums *all* phone traffic (background sync, DNS, etc.), not just the intentional transfer — meaning a leaked config can't be "selectively" abused by an attacker; any traffic at all counts against the same shared cap. This is arguably a stronger security property and can be framed as a finding in the paper, not hidden as a flaw.

---

## 5. In Progress — Redis Persistence (Objective 2, Step 1) — START HERE

**This is the most recent work and is NOT yet verified running.** Timeline of what happened:

1. `backend/redisClient.js` was written and **verified working standalone** (a manual `node -e` script did `connectRedis()` → `saveTunnel()` → `getTunnel()` → correct read-back → `client.quit()`, and it worked).
2. A Redis-integrated rewrite of `backend/index.js` was supposedly delivered in an earlier session, but **the file the user actually had running was still the old, pre-Redis version** — confirmed by a `grep -n "connectRedis\|rehydrateTunnels" backend/index.js` that found nothing, and by a startup log that jumped straight to `🚀 OTNT Backend listening` with no `[REDIS]` lines at all. So the previous "delivery" never actually landed in the working file.
3. **This session, a corrected `backend/index.js` was rewritten from scratch**, layering Redis persistence onto the current (already race-condition-fixed) logic. It has NOT yet been pasted in and tested by the user. **This is the immediate next task for Claude Code: get this file in place and run the verification protocol below.**

### What the new `index.js` does differently

- `tunnels` (the `Map`) is now a **cache**, not the source of truth. Redis is.
- `persistTunnel(tunnelId)` — write-throughs a tunnel's serializable state to Redis (strips the non-serializable `timers` field) after every meaningful mutation (handshake init, tunnel create). TTL = `expiry + 300s` buffer once a real expiry exists, or a `86400s` (24h) default fallback for handshake-only records that don't have an expiry yet.
- `scheduleTimers(tunnelId)` — factored out of the `/api/tunnel/create` handler so the startup rehydration path can reuse identical timer-start logic instead of duplicating it.
- `terminateTunnel()` now also calls `redisClient.deleteTunnel(tunnelId)`, and the manual `/api/tunnel/delete` route was refactored to call `terminateTunnel()` too instead of duplicating teardown logic.
- `ifaceExists(ifaceName)` — new helper, checks `wg show interfaces` output for a given interface name.
- `rehydrateTunnels()` — runs once at startup. Reads every record out of Redis. For each: if `terminating === true`, OR its `expiry` has already passed, OR its kernel interface no longer exists (`ifaceExists()` returns false) → treat as orphaned, delete both the (possibly already-gone) interface and the Redis record via `cleanupOrphan()`. Otherwise → reload it into the `tunnels` Map and call `scheduleTimers()` to restart its monitors.
- **Critical startup order, do not reorder:** `connectRedis()` → `rehydrateTunnels()` → `cleanupStartup()` (which calls `wireguard.cleanupStaleTunnels(tunnels)`) → `app.listen()`. Rehydration MUST happen before `cleanupStaleTunnels()`, because that function deletes any kernel interface not present in the `tunnels` Map — if the Map were still empty when it ran, it would nuke every live tunnel's interface on every single restart.
- If `connectRedis()` itself fails, the app now exits with `process.exit(1)` rather than silently degrading to a no-persistence mode — persistence is core to Objective 2, so a Redis outage should be loud, not silent.

### Verification protocol — run this cleanly, step by step

1. **Confirm Redis is running:** `redis-cli PING` → expect `PONG`.
2. **Replace `backend/index.js`** with the new version. Confirm `redis` is in `backend/package.json` dependencies; if not, `npm install redis` inside `backend/`.
3. **Start the backend:** `sudo node index.js`. Expected log order, in this exact sequence:
   ```
   [REDIS] Connecting...
   [REDIS] Connected and ready ✅
   [REDIS] No records found
   🚀 OTNT Backend listening at http://0.0.0.0:3001
   ```
   (If there are leftover records from earlier testing, you'll see `[REDIS] Found N tunnel record(s)...` and possibly `Rehydrated tunnel <id> (iface wgN)` or `[REHYDRATE] Cleaned up orphaned tunnel <id>` lines instead of "No records found" — that's fine, just make sure SOME `[REDIS]` lines appear before the listening line.)
4. **Create exactly one tunnel** through the frontend (or via curl/Postman against `/api/handshake/init` then `/api/tunnel/create`) with a long expiry (e.g. 120s) and no data cap, to keep this test simple.
5. **Check Redis directly** (note the wildcard — a previous check missed this and gave a false negative):
   ```
   redis-cli KEYS 'otnt:tunnel:*'
   ```
   Expected: at least one key like `otnt:tunnel:<uuid>`. Then:
   ```
   redis-cli GET 'otnt:tunnel:<that-uuid>'
   ```
   Expected: a JSON blob containing `ifaceName`, `wgPriv`, `wgPub`, `serverIP`, `clientIP`, `expiry`, etc. — NOT a `timers` field (it must be stripped).
6. **Kill the backend with Ctrl+C** (do NOT manually tear down the kernel interface). Confirm the interface is still alive: `sudo wg show` should still list it.
7. **Restart the backend:** `sudo node index.js`. Expected log lines this time:
   ```
   [REDIS] Connecting...
   [REDIS] Connected and ready ✅
   [REDIS] Found 1 tunnel record(s)...
   Rehydrated tunnel <uuid> (iface wgN)
   🚀 OTNT Backend listening at http://0.0.0.0:3001
   ```
8. **Confirm the frontend's status poll still works** on that same tunnel ID (no 404) — i.e., hit `GET /api/tunnel/status/<uuid>` and confirm it returns real data, not "Not found."
9. **Let the tunnel's expiry actually fire** (wait out the 120s) and confirm: the audit log shows exactly one `expired` line, `sudo wg show` no longer lists the interface, and `redis-cli GET 'otnt:tunnel:<uuid>'` now returns `(nil)`.

If any step doesn't match, stop and report exactly what you saw (paste the actual terminal output) rather than guessing at a fix — this project has already had one silent-regression incident (Section 5, point 2 above) from assuming a described fix was actually in place without checking.

---

## 6. Not Yet Started / Explicitly Queued Next

In priority order:

1. **Finish verifying the Redis integration above.**
2. **Migrate `wireguard.js`'s `getNextFreeIP()` / `reservedIPs` to Redis.** Right now `reservedIPs` is a plain in-memory `Set` — meaning even though tunnel *records* now survive a restart, IP collisions become possible again after a restart, because the allocator's own bookkeeping doesn't persist. This is the next one-file-at-a-time deliverable once Section 5 is confirmed clean. Need the current, full contents of `wireguard.js` before editing it (paste it fresh — don't assume its state, it hasn't been touched since the `ifaceName` fix).
3. **Jest test suite** — unit tests for the crypto round-trip (ECDH derivation, AES round-trip), the IP allocator (no collisions under concurrency), and expiry-timer accuracy. Not started at all — zero test files exist in the repo.
4. **GitHub Actions CI** — not started, no `.github` directory exists.
5. **Cosmetic cleanup** (low priority, do only once the above is stable):
   - Delete `frontend/src/components/ConfigQRCode.jsx` (dead — confirm nothing imports it first: `grep -rn ConfigQRCode frontend/src`)
   - Delete `frontend/src/api.js` (dead duplicate — confirm nothing imports it: `grep -rn "from '../api'" frontend/src` or similar, adjust the grep to the actual relative import paths used)
   - Strip the ~265 lines of commented-out legacy code from the top of `backend/wireguard.js`
6. **Objective 3 (deployment):** move CORS from hardcoded `localhost:5173` / a LAN IP to an environment variable; replace the single global 400 req/min rate limiter with endpoint-specific limits (handshake ~5/min, tunnel-create ~3/min per IP — status polling should not share this limit); deploy to a real VPS; produce basic reproducibility docs. None of this has been started.
7. **Confirm UI redesign round 2 actually runs cleanly** — specifically check `HowItWorksPanel.jsx` for the `.jsx`-extension issue that bit `SecureSessionCard.jsx` once already (Vite throws a parse error if a file contains JSX but has a `.js` extension), and confirm the 2×2 grid layout / empty-state pairing (`TunnelForm` + `HowItWorksPanel` side by side) looks right. This has not been confirmed by the user since it was delivered.
8. **Two loose ends from live testing, not blocking, worth closing if time allows:**
   - Live-test the race-condition guard specifically: set a short expiry AND a small data cap so they're likely to collide, and confirm the audit log shows only ONE termination line for that tunnel, never two.
   - An unresolved "why did a file download succeed after the tunnel had already been deleted" observation from a file-transfer test — likely browser cache or an in-flight connection finishing after teardown, not a real gap (the interface itself was independently confirmed gone via `wg show`), but never explicitly root-caused via the clean verification protocol (rename the test file, clear browser cache, check `wg show` at the exact moment of the audit log line, check final downloaded file size).

---

## 7. Known, Accepted Limitations (do not "fix" these without discussion — they're either accepted tradeoffs or explicitly deferred)

- `auditLogger.js` is plain `console.log` with a timestamp — not tamper-evident. HMAC-chained logging was the originally-envisioned improvement but is explicitly deferred to a later objective, not part of the current scope.
- Data-cap enforcement has a quantifiable polling-based overshoot window (worst case = throughput × 250ms), not a hard real-time ceiling. This is meant to be stated honestly as a limitation in any evaluation writeup, not eliminated.
- `getUsedIPs()` re-scans `ip -4 addr show` and every file in `/etc/wireguard` on every single IP allocation — fine at FYP demo scale (a handful of tunnels), won't scale past roughly 50 concurrent tunnels. Known, accepted, out of scope.
- 1-second REST polling from `TunnelStatus.jsx` for live status (60 req/min per open tab) — a real design smell at scale, deferred; SSE was the originally-discussed replacement but is out of scope for the current objectives.
- No authentication/multi-user support, no dashboard analytics, no Docker/containerization — all explicitly out of scope for this FYP's stated objectives.
- Everything runs on `localhost`/LAN only — never deployed to a real host. This is explicitly Objective 3 work, not started.

---

## 8. What Claude Code Should Actually Do, In Order

1. Open `backend/index.js`, `backend/redisClient.js`, `backend/wireguard.js`, and confirm what's actually there right now (don't trust this document's file-status table blindly for exact current byte-for-byte content — verify by reading the files first, this document describes intent and recent history, not necessarily the literal current disk state).
2. Get the Redis-integrated `index.js` from Section 5 actually running, and walk through the 9-step verification protocol there, reporting real terminal output at each step rather than assuming success.
3. Once confirmed clean, proceed to migrating IP allocation state (`wireguard.js`) to Redis, following the same "ask to see the current file first, then deliver a complete corrected version" discipline — don't guess at `wireguard.js`'s current contents.
4. After that, build the Jest test suite and GitHub Actions CI (Objective 2's remaining, entirely-unstarted pieces).
5. Only after Objective 2 is genuinely done, move to Objective 3 (deployment, CORS env var, endpoint-specific rate limits).
6. Treat Section 7's limitations as known and accepted — don't spend time "fixing" them unless explicitly asked.
7. If asked to produce anything jury-facing (slides, a methodology diagram, an "Expected Outcomes" section), remember the presentation rule in Section 1 — code and internal docs should stay honest about what's actually done; only reviewer-facing material needs the "target, not yet built" framing.

---

## 9. Working Conventions to Follow

- **One backend file at a time.** Deliver complete, full file contents (not diffs/snippets) for anything the user needs to paste in — they replace the whole file.
- **If unsure of a file's exact current contents, ask the user to paste it first** rather than guessing or assuming a prior description of it is still accurate. This project has already had one incident where an assumed-delivered fix silently wasn't actually in the running file — verify, don't assume.
- Code must be secure, well-commented, and should not break existing functionality — only touch what's being fixed at that step.
- The user is a cybersecurity student who is newer to Linux/WireGuard/networking/sudo mechanics. Verification and testing instructions should be explicit, step-by-step, with a clear "expected output" for every step and exact copy-pasteable terminal commands — not just "check that it works."
- Frontend files that are tightly interdependent (e.g. a coordinated UI redesign touching 6+ files at once) can reasonably be delivered as a batch; backend logic changes should stay one-file-at-a-time given how easy it is to silently break the WireGuard lifecycle logic.

---

## 10. Academic/Research Track (context only — separate from the engineering work above)

Briefly, for context (this is NOT Claude Code's job to continue unless explicitly asked):

- Base paper: Lekidis 2024 (ARES, ACM) — chosen for eligibility (Conference + 2023-2026 window), even though its 5G-slice-isolation topic is a weaker methodological fit than several journal papers that were disqualified by venue type.
- 11–14 paper literature corpus has been assembled and cross-verified paper-by-paper via web search (several AI-tool-suggested citations were caught as fabricated or misleading along the way — the discipline of independently verifying every citation via web search before use should continue if this track resumes).
- The single highest-leverage remaining piece of the *research* contribution (as opposed to the engineering build) is the still-unrun **Sem 7 experiment**: empirically comparing dual-condition expiry against a time-only-expiry control and a persistent (no-expiry) control, measuring data-exposure window and performance overhead. This is what would turn OTNT from "a working system" into "a system with a measured result," and hasn't been started.
- This track is otherwise self-contained in a set of memory blocks separate from this handoff and doesn't need to be re-explained to Claude Code unless the user explicitly brings the research/writing work into this same working session.

---

**End of handoff. Everything above reflects the true, current state as of this document's creation — treat it as ground truth for what's done vs. pending, but always verify actual file contents on disk before editing, per Section 9.**
