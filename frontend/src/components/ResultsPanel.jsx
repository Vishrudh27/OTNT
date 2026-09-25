// frontend/src/components/ResultsPanel.jsx
// Real experiment figures from docs/experiments/batch{1,2,3}-*/writeup.md —
// every number traces to a raw.csv from real WireGuard kernel interfaces
// (network-namespace + veth-pair harness), not simulated. Axis-style bar
// chart (gridlines + value labels), no charting library — CSS only.
import React from "react";
import { Box, Paper, Typography, Grid, Chip } from "@mui/material";
import { TrendingDown, Gauge, Timer, Activity } from "lucide-react";
import { tokens } from "../theme";

const CHART = {
  good: "#2E8B57",    // rich forest green — OTNT / best result
  neutral: "#CA8A04", // rich amber/gold — baseline, not good or bad
  neutral2: "#9C8563", // muted taupe — a second "neutral" bar alongside CHART.neutral, same family, distinguishable
  bad: "#C2410C",     // rich terracotta — risk / worst result
  paper: "#FAF8F3",
  goldShades: ["#E3B23C", "#CA8A04", "#A87104", "#8C5E03"], // same-hue gradient for same-finding multi-bar sets
};
const SERIF = 'Georgia, "Times New Roman", serif';

function cardSx() {
  return {
    p: 3,
    borderRadius: "16px",
    height: "100%",
    bgcolor: CHART.paper,
    border: `1px solid ${tokens.border}`,
    boxShadow: "none",
  };
}

function ChartTitle({ icon: Icon, title, meta }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Icon size={16} color={tokens.textSecondary} />
        <Typography sx={{ fontFamily: SERIF, fontSize: "1.05rem", fontWeight: 700, color: tokens.text }}>{title}</Typography>
      </Box>
      <Typography sx={{ fontFamily: "monospace", fontSize: "0.66rem", color: tokens.textSecondary }}>{meta}</Typography>
    </Box>
  );
}

// Horizontal axis bar chart: category label | gridded track w/ bar | value.
// Gridlines drawn as a repeating CSS background on the track — no extra DOM.
function AxisBarChart({ data, max, axisLabels }) {
  const segments = axisLabels.length - 1;
  return (
    <Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.1 }}>
        {data.map((d) => {
          const pct = Math.max(1, Math.min(100, (d.value / max) * 100));
          const ciLowPct = d.ci ? Math.max(0, (d.ci[0] / max) * 100) : null;
          const ciHighPct = d.ci ? Math.min(100, (d.ci[1] / max) * 100) : null;
          return (
            <Box key={d.label} sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
              <Box sx={{ width: 112, flexShrink: 0, textAlign: "right", fontSize: "0.72rem", color: tokens.textSecondary }}>
                {d.label}
              </Box>
              <Box sx={{
                flexGrow: 1,
                position: "relative",
                height: 20,
                borderRadius: "3px",
                backgroundImage: `linear-gradient(to right, ${tokens.border} 1px, transparent 1px)`,
                backgroundSize: `${100 / segments}% 100%`,
                backgroundRepeat: "repeat-x",
              }}>
                <Box sx={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, bgcolor: d.color, borderRadius: "3px" }} />
                {d.ci && (
                  <Box sx={{ position: "absolute", top: 0, height: "100%", left: `${ciLowPct}%`, width: `${ciHighPct - ciLowPct}%` }}>
                    <Box sx={{ position: "absolute", left: 0, top: "15%", bottom: "15%", width: "2px", bgcolor: tokens.text }} />
                    <Box sx={{ position: "absolute", right: 0, top: "15%", bottom: "15%", width: "2px", bgcolor: tokens.text }} />
                    <Box sx={{ position: "absolute", left: 0, right: 0, top: "50%", height: "2px", bgcolor: tokens.text }} />
                  </Box>
                )}
              </Box>
              <Box sx={{ width: 66, flexShrink: 0, fontFamily: "monospace", fontSize: "0.74rem", fontWeight: 700, color: tokens.text }}>
                {d.valueLabel}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", pl: "124.8px", pr: "66px", justifyContent: "space-between", mt: 0.8 }}>
        {axisLabels.map((a) => (
          <Typography key={a} sx={{ fontSize: "0.62rem", color: tokens.textSecondary }}>{a}</Typography>
        ))}
      </Box>
    </Box>
  );
}

function Headline({ children }) {
  return (
    <Typography sx={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.9rem", fontWeight: 700, color: tokens.text, mt: 2, mb: 1 }}>
      {children}
    </Typography>
  );
}

function Tags({ items }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
      {items.map((t) => (
        <Chip key={t} size="small" label={t} sx={{ fontSize: "0.65rem", fontWeight: 600, bgcolor: "rgba(0, 0, 0, 0.03)", color: tokens.textSecondary, border: `1px solid ${tokens.border}` }} />
      ))}
    </Box>
  );
}

function StatCallout({ icon: Icon, label, value, sub }) {
  return (
    <Box sx={{
      display: "flex",
      alignItems: "center",
      gap: 1.5,
      p: 2,
      borderRadius: "12px",
      bgcolor: "rgba(0, 0, 0, 0.035)",
      border: `1.5px solid ${tokens.border}`,
      boxShadow: tokens.softShadow,
    }}>
      <Box sx={{ width: 38, height: 38, minWidth: 38, borderRadius: "10px", bgcolor: "rgba(0, 0, 0, 0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={17} color={tokens.text} />
      </Box>
      <Box>
        <Typography variant="body2" sx={{ fontSize: "0.68rem", color: tokens.textSecondary, fontWeight: 700, letterSpacing: "0.02em" }}>{label}</Typography>
        <Typography sx={{ fontFamily: "monospace", fontSize: "1.15rem", fontWeight: 800, color: tokens.text, lineHeight: 1.2 }}>{value}</Typography>
        {sub && <Typography variant="body2" sx={{ fontSize: "0.68rem", color: tokens.textSecondary }}>{sub}</Typography>}
      </Box>
    </Box>
  );
}

export default function ResultsPanel() {
  return (
    <Grid container spacing={2.5} alignItems="stretch">
      {/* Batch 1 — core novelty */}
      <Grid item xs={12} md={6}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <ChartTitle icon={TrendingDown} title="Data-Exposure Window" meta="n=60" />
          <AxisBarChart
            axisLabels={["0s", "1.5s", "3s", "4.5s", "6s"]}
            max={6}
            data={[
              { label: "Dual-condition (OTNT)", value: 0.014, valueLabel: "0.014s", color: CHART.good },
              { label: "Time-only expiry", value: 5.373, valueLabel: "5.373s", color: CHART.neutral },
              { label: "Persistent", value: 5.795, valueLabel: "5.795s", color: CHART.bad },
            ]}
          />
          <Headline>≈380× smaller exposure window</Headline>
          <Tags items={["1MB payload", "300KB cap", "persistent = censored"]} />
        </Paper>
      </Grid>

      {/* Batch 3 sub-exp 2 — overshoot vs throughput */}
      <Grid item xs={12} md={6}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <ChartTitle icon={Activity} title="Data-Cap Overshoot" meta="n=20" />
          <AxisBarChart
            axisLabels={["0%", "70%", "140%", "210%", "280%"]}
            max={280}
            data={[
              { label: "LOW ~1.9 Mbps", value: 14.5, valueLabel: "+14.5%", color: CHART.good },
              { label: "MEDIUM ~6.5 Mbps", value: 68.7, valueLabel: "+68.7%", color: CHART.neutral },
              { label: "HIGH ~38.3 Mbps", value: 275.8, valueLabel: "+275.8%", color: CHART.bad },
            ]}
          />
          <Headline>r = 0.957 correlation</Headline>
          <Tags items={["250ms poll", "scales with throughput", "HIGH = payload-bound"]} />
        </Paper>
      </Grid>

      {/* Batch 3 sub-exp 1 — firing precision */}
      <Grid item xs={12} md={6}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <ChartTitle icon={Timer} title="Expiry Firing Precision" meta="n=30" />
          <AxisBarChart
            axisLabels={["0ms", "200ms", "400ms", "600ms", "800ms"]}
            max={800}
            data={[
              { label: "5s target", value: 554.9, valueLabel: "555ms", color: CHART.goldShades[0] },
              { label: "10s target", value: 679.8, valueLabel: "680ms", color: CHART.goldShades[1] },
              { label: "15s target", value: 653.1, valueLabel: "653ms", color: CHART.goldShades[2] },
              { label: "20s target", value: 625.1, valueLabel: "625ms", color: CHART.goldShades[3] },
            ]}
          />
          <Headline>~550–680ms, flat band</Headline>
          <Tags items={["1000ms poll interval", "r=0.187", "not duration-dependent"]} />
        </Paper>
      </Grid>

      {/* Batch 2 — throughput overhead */}
      <Grid item xs={12} md={6}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <ChartTitle icon={Gauge} title="Throughput vs. Vanilla WireGuard" meta="n=10/condition" />
          <AxisBarChart
            axisLabels={["0", "350", "700", "1050", "1400"]}
            max={1400}
            data={[
              { label: "OTNT-provisioned", value: 1249.5, valueLabel: "1249.5", color: CHART.neutral, ci: [1238.0, 1260.9] },
              { label: "Vanilla WireGuard", value: 1230.6, valueLabel: "1230.6", color: CHART.neutral2, ci: [1207.6, 1253.6] },
            ]}
          />
          <Headline>Statistically indistinguishable — CIs overlap</Headline>
          <Tags items={["60s iperf3", "Mbps, 95% CI shown", "kernel does the work"]} />
        </Paper>
      </Grid>

      {/* Standalone stats */}
      <Grid item xs={12}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <ChartTitle icon={Activity} title="Standalone Timings" meta="" />
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={6}>
              <StatCallout icon={Timer} label="Provisioning (n=20)" value="666.1ms" sub="Create → confirmed handshake" />
            </Grid>
            <Grid item xs={12} md={6}>
              <StatCallout icon={Activity} label="Teardown → audit log (n=50)" value="232.1ms" sub="After kernel interface is gone" />
            </Grid>
          </Grid>
        </Paper>
      </Grid>
    </Grid>
  );
}
