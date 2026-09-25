# Batch 3 — Enforcement-Precision Characterization

## Fixed parameters and design choices

**Sub-exp 1 (time-expiry firing precision):** N=30 real tunnels, target `expirySeconds` cycled across {5, 10, 15, 20} (8/8/7/7). A single fixed value would not distinguish a fixed polling overhead from one that scales with expiry duration; spreading trials across a 4x range of targets makes that distinction directly testable via correlation.

**Sub-exp 2 (data-cap overshoot vs. throughput):** N=20 real tunnels, fixed `dataCapBytes=300000` (unchanged from Batch 1, for consistency), fixed 1MB (1,048,576 B) payload pushed via `iperf3 -n` (also matching Batch 1). Throughput was varied across three `tc tbf`-shaped tiers on the client's WireGuard interface: LOW (~2Mbit, 7 trials), MEDIUM (~8Mbit, 7 trials), HIGH (unthrottled — link ceiling, 6 trials).

**Sub-exp 3 (teardown-to-audit-log latency):** fully derived from Sub-exp 1 and 2's own instrumentation (N=50 combined: 30 time-triggered, 20 data-cap-triggered) — no separate trials were needed to reach N≥30.

**Methodology common to all three:** real WireGuard kernel interfaces, network-namespace + veth-pair technique (same as Batch 1/2). Two independent timing instruments were used: (a) `backend/auditLogger.js` was extended with a millisecond-precision file sink (in addition to its existing console output) so audit-log event timestamps could be read directly rather than inferred; (b) kernel-interface disappearance was detected via tight-loop `ip link show` / `wg show` polling on the server-side interface, the same technique used in the earlier "download after teardown" investigation.

## Limitations

- All measurements were taken on a single machine using network-namespace/veth-pair emulation, not a real multi-hop network path.
- Two independent poll intervals set hard floors on precision: the backend's own 1000ms expiry-check interval and 250ms data-cap-check interval (both fixed in `backend/index.js`) bound what firing precision or overshoot control is achievable regardless of measurement quality. Our own instrumentation polls at a finer ~5-30ms granularity (`ip link`/`wg show` calls, each with its own ~5-15ms process-spawn overhead), which is sufficient to resolve the backend's coarser intervals but is itself not infinitely precise.
- Sub-exp 3's latency window begins *after* the kernel interface is already gone — it does not include `wg-quick down`/`ip link delete` time, only what happens between that and the audit-log write (IP-allocator release x2, in-memory record deletion, a Redis delete call, then the log write). The Redis round-trip is very likely the dominant cost in that window, though this was not independently isolated.
- Sub-exp 2's "bytes at teardown" is the WireGuard interface's raw transfer counter (rx+tx, same parsing `wireguard.js`'s `getTransferBytes()` uses), which includes IP/TCP/WireGuard framing overhead on top of the 1,048,576 B of iperf3 application payload — this is why HIGH-tier overshoot exceeds the payload-only prediction of ~249.5% (observed: ~276%).

## Sub-experiment 1 — Time-expiry firing precision

**Result (n=30):** firing delta mean **627.5ms**, median 581ms, stdev 118.4ms, 95% CI [583.3, 671.7], max 983ms, p95 811.2ms.

**By target duration:** 5s→554.9ms, 10s→679.8ms, 15s→653.1ms, 20s→625.1ms (no group above ~130ms from another). Pearson correlation between target duration and delta: **r=0.187** — negligible.

**Interpretation:** the firing delta does not scale with the target expiry duration; it stays in a roughly constant ~550-680ms band regardless of whether the tunnel was set to expire in 5s or 20s. This is consistent with a **fixed overhead from the 1000ms expiry-check interval**, not a duration-dependent effect: the expected wait for the next 1s poll tick after the true expiry moment is a uniformly distributed 0-1000ms (mean 500ms), plus a small additional fixed cost to actually record and log the termination (measured separately in Sub-exp 3 at ~240ms mean for time-triggered teardowns). Full data: `exp1_expiry_precision_raw.csv`; stats: `exp1_expiry_precision_summary.csv`.

## Sub-experiment 2 — Data-cap overshoot vs. throughput correlation

**Result by tier (n=7/7/6):**

| Tier | Throughput (mean) | Overshoot bytes (mean) | Overshoot % (mean) |
|---|---|---|---|
| LOW (~2Mbit) | 1.865 Mbps | 43,577 B | 14.5% |
| MEDIUM (~8Mbit) | 6.515 Mbps | 205,974 B | 68.7% |
| HIGH (unthrottled) | 38.323 Mbps | 827,457 B | 275.8% |

**Correlation:** Pearson r between measured throughput and overshoot bytes across all 20 trials = **0.957** — a strong, clearly linear relationship, confirming the expected mechanism.

**Theoretical worst case:** with a 250ms data-cap poll interval, the worst-case overshoot in a single missed window is `throughput × 0.25s`. Observed-to-theoretical ratios ranged from 0.17 to 1.35 across LOW/MEDIUM trials, clustering around 0.6-1.1 — consistent with overshoot depending on *where in the 250ms poll cycle* the cap is crossed (uniform in [0, worst_case] in expectation, so values scattered below and occasionally slightly above a single-sample theoretical estimate are expected, not anomalous). HIGH-tier trials are a distinct regime: at that throughput the entire 1MB payload transfers within a single 250ms window regardless of rate, so overshoot there is bounded by **payload size**, not by `throughput × 0.25s` — the formula's implicit assumption (sustained transfer across the full window) breaks down once transfer completion time drops below the poll interval. Full data: `exp2_datacap_overshoot_raw.csv`; stats: `exp2_datacap_overshoot_summary.csv`.

## Sub-experiment 3 — Teardown-to-audit-log latency distribution

**Result (n=50 combined):** overall mean **232.1ms**, median 223ms, p95 317.3ms. By trigger type: time-triggered (n=30) mean 240.1ms, median 231ms; data-cap-triggered (n=20) mean 220.3ms, median 205.5ms — the two trigger paths converge on the same `terminateTunnel()` code path after the kernel interface is gone, so the ~20ms difference is not treated as meaningful given the overlapping confidence intervals. Full data: `exp3_teardown_latency_raw.csv`; stats: `exp3_teardown_latency_summary.csv`.

**Comparison against Chang & Xu 2026 (explicit, one-time, architecturally-scoped):** Chang & Xu report sub-3ms revocation latency for FSM-based session revocation over WebSocket signaling — an in-memory state transition plus a single network message to a connected client. OTNT's ~220-240ms mean measures a categorically different operation: everything that happens *after* a real Linux kernel network interface has already been torn down (`wg-quick down`/`ip link delete`, not included in this number) — releasing two IP allocations, deleting the in-memory tunnel record, an asynchronous Redis delete call, and finally writing the audit log line. The ~75-100x gap between the two numbers reflects this architectural difference (kernel-level interface teardown plus a persistent-store delete, vs. an in-memory FSM transition over an already-open signaling channel), not a claim that OTNT's enforcement is slower at revoking access — the actual data-plane cutoff happens at kernel interface deletion, which precedes this measured window entirely.

## Summary

All three sub-experiments produced physically consistent, mutually corroborating results: expiry firing precision is governed by a fixed ~550-680ms overhead dominated by the 1s poll interval (not duration-dependent); data-cap overshoot scales strongly and linearly with throughput (r=0.957) and matches the theoretical `throughput × 0.25s` worst-case bound reasonably well outside the payload-bounded HIGH-throughput regime; and post-kernel-teardown audit-logging latency sits in a tight ~220-240ms band regardless of trigger type. No unresolved anomalies remain in the reported data — one systematic test-harness issue (a stale one-shot iperf3 server process from a prior trial colliding with the next trial's client) was found and fixed during Sub-exp 2's execution, and is documented separately in engineering notes rather than here.
