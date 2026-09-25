# Batch 2 — Base-Paper-Aligned Evaluation

## Domain-difference caveat (stated up front, not a footnote)

This batch mirrors Haga et al. 2020's *measurement categories* — provisioning/instantiation latency and throughput — for structural comparability with a paper cited in this project's literature review. It does **not** claim domain equivalence. Haga et al. measure 5G-slice instantiation via OSM (NFV/network-slice orchestration, multi-VNF, multi-layer); OTNT is a standalone point-to-point WireGuard tunnel with a single Node.js orchestration process. These are different systems solving different problems at different layers. Every number below is reported as **OTNT's own measurement**, with its own full methodology stated; none of it is placed head-to-head against Haga's 4min26s/2min44s figures, which belong to a different domain and are not repeated or benchmarked against here. No OpenVPN comparison is included in this batch — that comparison already exists in the cited literature (Anyam 2025, Kjorveziroski 2024) and is not being redone.

## Experiment 1 — Provisioning/Instantiation Latency (OTNT's own number)

**Method:** 20 real trials. Each trial: a real `/api/tunnel/create` request against the production backend, immediately followed by bringing up a real WireGuard client peer in an isolated network namespace (veth-pair technique, same as Batch 1/Phase 3), polling until that client interface shows a confirmed handshake. Latency = time from the create request to the first confirmed handshake — i.e., truly end-to-end to an operational tunnel, not just the HTTP response.

**Result:** mean **666.1ms**, median 617.5ms, stdev 141.1ms, 95% CI [600.1, 732.1] (n=20). Full data: `exp1_provisioning_raw.csv`; stats: `exp1_provisioning_summary.csv`.

## Experiment 2 — Throughput Overhead

**Method:** 10 trials per condition, 60s sustained `iperf3` TCP throughput each, same host/namespace/veth topology for both: (A) an OTNT-provisioned tunnel (real API, real timers running — 1TB cap so it never trips mid-test) vs (B) a vanilla WireGuard tunnel set up directly via `wg-quick`, no OTNT backend/API/timers involved at all.

**Result (received throughput):** OTNT mean **1249.5 Mbps** (95% CI [1238.0, 1260.9], n=10) vs vanilla mean **1230.6 Mbps** (95% CI [1207.6, 1253.6], n=10). Full data: `exp2_throughput_raw.csv`; stats: `exp2_throughput_summary.csv`.

## Interpretation

Experiment 1 gives OTNT's own provisioning-latency number (mean 666ms, end-to-end to a confirmed handshake) with its full methodology stated; it is reported standalone and is not compared against Haga et al.'s figures, which measure an unrelated system (5G-slice/OSM orchestration) at a different layer of abstraction — any apparent numeric proximity or distance to those figures would be meaningless and is not discussed.

Experiment 2's headline finding is that OTNT-provisioned and vanilla WireGuard tunnels are statistically indistinguishable in sustained throughput: OTNT's mean (1249.5 Mbps) was in fact nominally *higher* than vanilla's (1230.6 Mbps, a nominal −1.53% "overhead" — i.e., none), and their 95% confidence intervals overlap substantially. This is the expected and architecturally correct result: WireGuard's packet encryption and forwarding happen entirely in the kernel regardless of which userspace process provisioned the interface, so OTNT's Node.js orchestration layer and its monitoring timers sit entirely outside the data path. The honest conclusion is that this experiment found no measurable data-plane throughput cost from OTNT's orchestration, within the precision of 10 trials on this hardware.

**Caveats:** both experiments run on a single machine via network-namespace/veth emulation, not a real multi-hop network path; throughput figures (~1.2Gbps) reflect this loopback-equivalent link's ceiling, not any real-world WAN throughput; and Experiment 1's 666ms figure includes real `wg-quick up` kernel-level interface setup time (nft rules, routing), which dominates it — this is a genuine cost of dynamic per-tunnel provisioning, not a measurement artifact.
