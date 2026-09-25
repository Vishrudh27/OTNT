# OTNT — Development Status

Single source of truth for "what has been done so far" on this project. Written for handoff into a fresh Claude Code session — read this first, before touching anything.

Last updated: 2026-09-08.

---

## 0. What OTNT is

OTNT (One-Time Network Tunnel) is a final-year cybersecurity project: a self-destructing WireGuard VPN tunnel system. Every tunnel is created with a **dual-condition expiry** — it tears itself down when it hits **whichever comes first**: a time limit (`expirySeconds`) or a data cap (`dataCapBytes`). Either, both, or neither can be set per tunnel (if neither is set, the tunnel just runs with no automatic timers).

Stack: Node.js/Express backend (`backend/`) that shells out to real `wg`/`wg-quick`, a React frontend (`frontend/`), Redis/Valkey for tunnel-state persistence, real Linux WireGuard kernel interfaces (not a simulation) for every test done in this project.

Core flow: client does an ECDH handshake (`/api/handshake/init`) → gets a `tunnelId` + allocated client IP → calls `/api/tunnel/create` with its WireGuard public key → backend allocates a server-side interface (`otntN` naming, dynamic IP/port), brings up a real kernel WireGuard interface, and returns its public key + connection info → client connects. Timers (`scheduleTimers()` in `backend/index.js`) watch expiry (1s poll) and/or data cap (250ms poll) and call `terminateTunnel()` — which tears down the kernel interface, releases IP/port allocations, deletes the Redis record, and writes an audit log line — the moment either condition trips.

---

## 1. Absolute rules for working on this repo (read before doing anything)

**Never run `git push`, `git push --force`, or `git push --force-with-lease` for this repo, under any circumstances.** This was set as a permanent rule by the user after a git incident (details in `CLAUDE_SESSION_HANDBOOK.md`). It holds even if the user says "do it yourself" mid-conversation — that phrasing was tried once, honored once, and explicitly revoked. Any future push must be done by the user themselves in their own terminal.

- Read-only/local git commands are fine: `git status`, `git diff`, `git log`, `git show`, `git fetch` (never `git pull` without explicit reconciliation — see below), `git add`, `git commit` (local only).
- Never add a `Co-Authored-By: Claude` or `Claude-Session:` trailer to commit messages in this repo — the user does not want Claude showing as a GitHub collaborator.
- Never commit anything unless explicitly asked. Draft commit messages when asked, but the user runs `git commit` themselves.

**Sudo model on this machine:**
- General `sudo` (`(ALL) ALL`) requires a password + real tty — cannot be self-served by Claude. Backend restarts, killing the root backend process, and installing system packages (`sudo pacman -S ...`) all require relaying exact commands to the user and waiting for confirmation.
- A **scoped NOPASSWD rule** exists for `/usr/sbin/ip`, `/usr/bin/wg`, `/usr/bin/wg-quick` — these work via `sudo -n` with no tty needed. This is what makes it possible to self-serve real WireGuard network-namespace testing (creating netns/veth pairs, bringing up real tunnels, polling `wg show`/`ip link show`) without the user's help.
- Never background an unauthenticated `sudo` command (`sudo node index.js &` before `sudo -v`) — it hangs in a stopped state waiting for a tty. Always `sudo -v` (foreground) first, then background the actual command.
- Never use `pkill`, and be cautious with `kill` on arbitrary PIDs — this harness's sandbox intercepts process-management commands and can SIGTERM the invoking script itself. Prefer self-terminating process modes (e.g. `iperf3 -s -1 -D`, a one-shot self-daemonizing server) over anything requiring a manual kill.

---

## 2. Architecture reference

- `backend/index.js` — Express server, all API routes, tunnel lifecycle (`scheduleTimers()`, `terminateTunnel()`, `cleanupOrphan()`), CORS, rate limiting, Redis rehydration on startup.
- `backend/wireguard.js` — all `wg`/`wg-quick` shelling out, interface allocation (`getNextFreeOTNTInterface()`), ownership checks (`isOTNTOwned()` — strict AND of `otnt`-prefix + Redis registry membership), IP/port allocation, `getTransferBytes()` (parses `wg show <iface> transfer`).
- `backend/redisClient.js` — Redis/Valkey connection, tunnel record CRUD, AOF persistence.
- `backend/cryptoUtils.js` — ECDH handshake crypto helpers.
- `backend/auditLogger.js` — writes `[AUDIT] <ISO-timestamp> <message>` lines. **Recently extended** (uncommitted, see §6) to also append to a file (`backend/audit.log`, gitignored via `*.log`) in addition to stdout, so experiment scripts can read event timestamps without capturing process stdout. Env var `AUDIT_LOG_FILE` overrides the path.
- `backend/scripts/reap.js` — operator escape-hatch CLI (`npm run reap`) for orphaned `otnt*` kernel interfaces that exist but aren't in the Redis registry (e.g. after a registry loss). Lists by default; `--yes` prompts for a typed "delete" confirmation before tearing down. Verified end-to-end against a real fake orphan interface.
- `backend/__tests__/` — Jest suite, 51 tests across 5 files (`allocators`, `cryptoUtils`, `expiryTimer`, `ownership`, `transferBytes`). All passing as of the last check this session.
- `.github/workflows/ci.yml` — GitHub Actions CI running the Jest suite on push.
- Startup order matters: `connectRedis()` → `rehydrateTunnels()` → `cleanupStartup()` → `app.listen()`.
- Key constants: `EXPIRY_MONITOR_INTERVAL_MS = 1000`, `DATA_MONITOR_INTERVAL_MS = 250` (both in `backend/index.js`). Rate limiters: handshake 5/min, tunnel-create 3/min, status polling 300/min.
- OTNT subnet: `10.77.0.0/24`. UDP port range for tunnels: 51820-51869.

---

## 3. Phases completed (chronological)

### Phase 0-3 — Core functionality + concurrency fix
Base tunnel create/expire/delete flow, then a fix for a bug where only one tunnel could exist at a time (ownership-gated cleanup + per-tunnel dynamic ports/IPs instead of shared/reserved state). Commits `46894c1`, `4663bc9`. Verified with a real concurrent-tunnel acceptance test (`docs/phase3-concurrency-test.md`) using the network-namespace + veth-pair technique that all later experiments reused.

### Phase 4 — Testing + CI
Added the 51-test Jest suite (`backend/__tests__/`), extracted `backend/cryptoUtils.js`, added `.github/workflows/ci.yml`. Committed and pushed by the user under their own authorship (commit `2dcee3b`, no Claude co-author trailer). This is where the git incident happened (see §1 / `CLAUDE_SESSION_HANDBOOK.md`) — resolved, permanent no-push rule established afterward.

### Phase 5 — Deployment hardening (scoped)
- CORS via `CORS_ORIGINS` env var (`backend/.env.example` documents it) instead of hardcoded origins.
- Three per-endpoint rate limiters: handshake init (5/min), tunnel-create (3/min), status polling (300/min, separate higher budget).
- Redis AOF persistence enabled (`appendonly yes`) and verified with a real `SHUTDOWN NOSAVE` kill test — tunnel records survived a hard Redis kill + restart, not just a backend restart. Full evidence in `docs/phase5-aof-persistence-test.md`.
- Three items deferred at the time, completed in a follow-up pass: frontend API base URL unified via `VITE_API_BASE` env var (`frontend/src/api/axios.js`, `frontend/.env.example`); `npm run reap` operator tool (`backend/scripts/reap.js`, verified end-to-end against a real orphan interface); reproducibility docs (`docs/reproducibility.md`).

### Phase 6 — Cleanup
Deleted confirmed-dead files with zero inbound imports (`frontend/src/api.js`, `ConfigQRCode.jsx`, `App.css`, `TunnelForm.css`, `assets/react.svg`). Fixed named bugs: invalid MUI `justifyBetween` prop → `justifyContent` (`TunnelStatus.jsx`, 2 locations), wrong "250ms" copy → "1000ms", discarded `computeSharedSecret()` return value removed along with its dead import (`TunnelForm.jsx`), dead `allowedIPs` field removed end-to-end (frontend form + backend validator — final call was to remove it entirely, not just document it).

### Goal 1 — Full verification pass (pre-academic-work gate)
Before any experiments were run, a full clean-verification pass was required and completed:
- Full Jest regression: clean pass.
- Real WireGuard lifecycle test: both expiry paths (time, data-cap), crash-recovery, concurrent non-interference — all verified with real kernel interfaces.
- **Definitively root-caused** the historical "file downloaded after teardown" mystery (previously just a suspicion, now confirmed by direct reproduction): it's the data-cap monitor's 250ms polling interval creating an unavoidable window where a sufficiently fast transfer completes entirely before the next poll tick can react. Confirmed NOT a caching artifact, NOT corruption (SHA-256 identical), and timeline-correlated against the audit log at millisecond precision. This is a structural property of polling-based enforcement, not a bug — it's exactly what Batch 3's sub-experiment 2 later quantified properly.
- `allowedIPs` dead field: final decision made and executed (removed, not documented) — see Phase 6.
- Stale-code/TODO grep sweep: clean.
- The `ifaceName: null` graceful-handling case in `terminateTunnel()` was investigated and confirmed **intentional** (a tunnel deleted right after a handshake, before `/api/tunnel/create`, never gets a real kernel interface — this is a normal case, not an error). The guard was made explicit with a comment rather than relying on a catch block to paper over it, matching the pattern `cleanupOrphan()` already used.

---

## 4. Academic experiments (Sem 7)

All three batches used **real WireGuard kernel interfaces** via Linux network namespaces + veth pairs (never simulated), real API calls against the running backend, and respected the backend's own tunnel-create rate limiter (3/min, paced at ~20.5s spacing) rather than bypassing it. Each batch: raw CSV(s) + summary CSV(s) (mean/median/stdev/95% CI via t-distribution) + a writeup.md. Nothing was committed by Claude in any of this — all present as uncommitted files for the user to review/commit.

### Batch 1 — Core novelty experiment
`docs/experiments/batch1-core-novelty/` — 60 trials (20×3 conditions): dual-condition expiry vs. time-only vs. persistent (no expiry). Primary metric: data-exposure window. Secondary: creation latency, CPU/memory delta.
- Exposure window: Condition A (dual-condition) mean **0.014s**, B (time-only) mean **5.373s**, C (persistent) mean **5.795s** (censored — tunnel never expires on its own).
- Creation latency ~340-348ms across all conditions (not distinguishable between conditions).
- CPU/memory deltas: too noisy to be conclusive at this trial count — reported honestly as inconclusive, not overclaimed.

### Batch 2 — Base-paper-aligned evaluation
`docs/experiments/batch2-base-paper-aligned/` — mirrors Haga et al. 2020's measurement *categories* (provisioning latency, throughput) **without claiming domain equivalence** (Haga: 5G-slice/OSM orchestration; OTNT: point-to-point tunnel — explicitly different domains, stated up front in the writeup, not a footnote).
- Exp 1 — Provisioning latency (OTNT's own number, n=20, end-to-end to a confirmed handshake): mean **666.1ms**, median 617.5ms, 95% CI [600.1, 732.1]. Reported standalone, never compared numerically against Haga's 4min26s/2min44s.
- Exp 2 — Throughput overhead (n=10/condition, 60s iperf3): OTNT-provisioned mean **1249.5 Mbps** vs. vanilla WireGuard mean **1230.6 Mbps** — statistically indistinguishable (CIs overlap), OTNT nominally *higher*. Conclusion: no measurable data-plane throughput cost from OTNT's orchestration layer (expected — WireGuard's crypto/forwarding is entirely in-kernel regardless of what provisioned the interface).
- No OpenVPN comparison (already covered by cited literature, per explicit instruction).

### Batch 3 — Enforcement-precision characterization
`docs/experiments/batch3-enforcement-precision/` — three sub-experiments, all real trials:
- **Sub-exp 1** (n=30, time-expiry firing precision, targets 5/10/15/20s): mean firing delta **627.5ms**, essentially flat across target durations (Pearson r=0.187 vs. target duration) — confirms the delta is a **fixed** overhead from the 1000ms expiry-poll interval, not something that scales with expiry length.
- **Sub-exp 2** (n=20, data-cap overshoot vs. throughput, 300KB cap, LOW/MEDIUM/HIGH tc-shaped tiers): overshoot scales strongly with throughput (Pearson r=0.957). LOW ~14.5% over cap, MEDIUM ~68.7%, HIGH ~275.8% (bounded by full-payload-size in one poll window, not by rate, once throughput is high enough). Observed overshoot tracked the `throughput × 0.25s` theoretical worst-case reasonably well outside that payload-bounded regime.
- **Sub-exp 3** (n=50 combined, teardown-to-audit-log latency): mean **232.1ms** (time-triggered 240.1ms, data-cap-triggered 220.3ms — not meaningfully different). Explicitly and honestly compared against Chang & Xu 2026's sub-3ms revocation figure as an architecturally different measurement (post-kernel-teardown bookkeeping + a Redis delete round-trip, vs. an in-memory FSM transition over an already-open signaling channel) — not framed as a competing claim.
- **A real bug was found and fixed mid-batch**, kept out of the writeup per instruction (engineering notes only): a one-shot `iperf3` server doesn't exit cleanly when its client's tunnel is severed mid-transfer (the normal outcome on every cap-breach trial), so the next trial's client could collide with a stale, still-"busy" server from an earlier trial. First full run showed inflated/contaminated overshoot values from this and was **discarded**; fixed by giving every (trial, attempt) a unique port + unique client interface name, then reran clean (verified with a 3-trial smoke test showing zero retries, then the full 20-trial run also zero retries).

**None of these three batches' numbers should be presented as directly comparable to each other's baseline conditions without checking parameters match** (e.g. Batch 1's Condition A dual-condition setup vs. Batch 3's isolated expiry-only / cap-only setups use different fixed parameters — check each writeup.md before cross-referencing).

---

## 5. Known limitations (stated honestly, not hidden)

- All experimental testing is single-machine, network-namespace/veth-pair emulation — not a real multi-hop network path. Throughput figures (~1-1.2 Gbps) reflect this loopback-equivalent link's ceiling.
- Two hard measurement floors exist by design: the 1000ms expiry-poll interval and the 250ms data-cap-poll interval. No amount of measurement precision can beat these — they're properties of the system being measured, not the instrumentation.
- Batch 1's CPU/memory delta secondary metrics were inconclusive (too noisy at n=20/condition) — this was reported as-is rather than smoothed over.
- The `docs/experiments/*/writeup.md` files intentionally exclude test-harness engineering issues (timing bugs, tc quirks, the iperf3 stale-server bug) — those live only in this file / conversation history, per explicit instruction to keep the academic writeups clean.

---

## 6. Current uncommitted state (as of this document)

Everything described in this document as "uncommitted" earlier has since been committed by the user themselves (`backend/auditLogger.js` file-sink change, `CLAUDE_SESSION_HANDBOOK.md`, `docs/experiments/`, `docs/phase5-aof-persistence-test.md`, `docs/reproducibility.md`, this file — all landed in `ef11407 "Docs Required for the Project Completion"`, 2026-09-25). Tree was clean as of that commit.

Since then, a UI verification pass found and fixed two frontend bugs (`TunnelStatus.jsx` hardcoded listen port instead of using `status.listenPort`; `App.jsx` never received live `ifaceName`/`serverIP`/`clientIP` from the status poll), and a real allocator race (`getNextFreeIP`/`getNextFreePort`/`getNextFreeOTNTInterface` had no lock of their own, called ahead of `wireguard.js`'s `tunnelCreationLock`) was closed with a dedicated `allocationLock` in `wireguard.js`, with `backend/__tests__/allocators.test.js` updated to assert uniqueness under concurrency instead of just documenting the gap.

- `backend/audit.log` is a runtime-generated file, gitignored via the existing `*.log` rule — don't try to commit it, it's local experiment-run output, not source.
- Always check `git status` yourself rather than trusting this section — it's a snapshot, not live state (see §7.2).

The user reviews and commits all of this themselves, in whatever grouping they choose. Do not commit on their behalf unless explicitly asked, and even then, draft the message and let them run `git commit`.

---

## 7. How to pick this project back up in a new session

1. Read this file first, then `CLAUDE_SESSION_HANDBOOK.md` for the git-incident detail.
2. Check `git status` / `git log` yourself before assuming anything about what's committed — don't trust this document's §6 blindly, it's a snapshot.
3. If continuing experimental work: read the relevant `docs/experiments/<batch>/writeup.md` for exact fixed parameters before designing a new batch, and check `backend/index.js` for the current values of `EXPIRY_MONITOR_INTERVAL_MS` / `DATA_MONITOR_INTERVAL_MS` / rate-limit values in case they've changed.
4. If continuing feature work: `docs/reproducibility.md` has the full setup (Redis/Valkey + AOF, sudoers rule, startup order, subnet/port ranges).
5. Never push, never add Claude as a co-author, never assume sudo can be self-served without checking whether it's the scoped NOPASSWD path or the general one.
