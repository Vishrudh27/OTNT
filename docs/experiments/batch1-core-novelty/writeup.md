# Batch 1 — Core Novelty Experiment: Dual-Condition vs Time-Only vs Persistent Expiry

## Method

Three conditions, 20 real trials each (60 total), every trial a genuine WireGuard tunnel created through the production backend and connected from a real client peer in an isolated network namespace (veth-pair test harness, same technique as the Phase 3 concurrency test — no simulation of the tunnel lifecycle itself).

- **A — Dual-condition** (current default): 10s expiry OR 300KB data cap, whichever first.
- **B — Time-only**: 10s expiry, data-cap monitor not started (no `dataCapBytes` set).
- **C — Persistent baseline**: neither expiry nor cap set; observed for a fixed 10s ceiling, then manually deleted.

Every trial pushed the same fixed 1MB payload through the tunnel immediately after connecting, standardized across all three conditions. A leak time was drawn uniformly at random from [0, 10s) per trial; the exposure window is the tunnel's actual measured lifetime minus that leak time (floored at 0).

## Results

| Metric | A (dual) | B (time-only) | C (persistent) |
|---|---|---|---|
| Exposure window, mean (95% CI) | 0.014s (−0.005, 0.033) | 5.373s (4.160, 6.585) | 5.795s (4.349, 7.240) |
| Creation latency, mean (95% CI) | 344.5ms (327.2, 361.8) | 341.5ms (324.1, 358.8) | 348.0ms (322.2, 373.8) |
| CPU delta, mean (95% CI) | 35.5ms (32.3, 38.7) | 34.0ms (28.0, 40.0) | 33.5ms (30.0, 37.0) |

Full per-trial data in `raw.csv`; complete stats (mean, median, stdev, 95% CI) for all four metrics in `summary.csv`.

## Interpretation

Dual-condition expiry reduced the mean data-exposure window to 0.014s (median 0s) versus 5.37s for time-only and 5.80s for the persistent baseline — roughly a 380-fold reduction. This is mechanistic, not incidental: the fixed 1MB payload always exceeded the 300KB cap within under a second, so condition A's real governing limit was almost always the data cap, not the 10s timer, while B and C have no usage-linked early exit and must wait out their full window regardless of actual activity. This is the core claim OTNT makes, and it holds directly.

Creation latency (~340–348ms across all three) and CPU delta (~34–36ms) showed no statistically distinguishable difference between conditions — any monitoring-timer overhead was not separable from measurement noise at this scale and trial duration; memory delta (not tabled above) was dominated by GC jitter in every condition and is inconclusive.

**Caveats:** results come from a namespace-based test harness, not a live multi-hop network; the 10s window, 300KB cap, and 1MB payload were fixed for tractability and cross-condition comparability, not tuned for production; and condition C's exposure is right-censored at the 10s observation ceiling — its true real-world exposure is unbounded until manual revocation, so 5.80s is a lower bound, not its actual value.
