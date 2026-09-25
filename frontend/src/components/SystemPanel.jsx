// frontend/src/components/SystemPanel.jsx
// Makes two backend properties that are otherwise invisible from the tunnel
// UI visible: the concurrent-tunnel ownership registry, and Redis-backed
// persistence/crash-recovery. Both sections poll real backend state — no
// simulated numbers.
import React, { useEffect, useState } from "react";
import { Box, Paper, Typography, Grid } from "@mui/material";
import { Layers, Database, Network, Wifi, Radio, Clock } from "lucide-react";
import { listTunnels, getSystemStatus } from "../api/axios";
import { tokens } from "../theme";

function formatUptime(sec) {
  if (sec === null || sec === undefined) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function cardSx() {
  return {
    p: 3.5,
    borderRadius: "24px",
    height: "100%",
    bgcolor: "rgba(255, 255, 255, 0.45)",
    backdropFilter: "blur(16px)",
    border: `1px solid ${tokens.border}`,
  };
}

function Divider() {
  return <Box sx={{ height: "1px", bgcolor: tokens.border, my: 2.5 }} />;
}

function SectionLabel({ children }) {
  return (
    <Typography variant="body2" sx={{ fontSize: "0.68rem", color: tokens.textSecondary, fontWeight: 700, mb: 1.5, letterSpacing: "0.02em" }}>
      {children}
    </Typography>
  );
}

function StatChip({ icon: Icon, label, value, color }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, px: 2, py: 1.3, borderRadius: "14px", bgcolor: "rgba(0, 0, 0, 0.02)", border: `1px solid ${tokens.border}`, flex: "1 1 140px" }}>
      <Icon size={15} color={color || tokens.textSecondary} />
      <Box>
        <Typography variant="body2" sx={{ fontSize: "0.66rem", color: tokens.textSecondary, fontWeight: 600, lineHeight: 1.3 }}>{label}</Typography>
        <Typography sx={{ fontFamily: "monospace", fontSize: "0.9rem", fontWeight: 700, color: tokens.text }}>{value}</Typography>
      </Box>
    </Box>
  );
}

export default function SystemPanel() {
  const [tunnels, setTunnels] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function pull() {
      try {
        const [listRes, statusRes] = await Promise.all([listTunnels(), getSystemStatus()]);
        if (!isMounted) return;
        setTunnels(listRes.data);
        setSystemStatus(statusRes.data);
        setErr(null);
      } catch {
        if (isMounted) setErr("Couldn't reach the backend for system status.");
      }
    }
    pull();
    const intv = setInterval(pull, 2000);
    return () => { isMounted = false; clearInterval(intv); };
  }, []);

  const registry = systemStatus?.registry;

  return (
    <Grid container spacing={2.5} alignItems="stretch">
      {/* Concurrent tunnel safety */}
      <Grid item xs={12} md={6}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
            <Layers size={20} color={tokens.primary} />
            <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
              Concurrent Tunnel Safety
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.8rem" }}>
            Each tunnel reserves its own interface, IP and port. A queued lock stops collisions.
          </Typography>

          <Divider />

          <SectionLabel>Registry</SectionLabel>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <StatChip icon={Network} label="Interfaces" value={registry?.ifaces.length ?? "—"} color={tokens.primary} />
            <StatChip icon={Wifi} label="IPs" value={registry?.ips.length ?? "—"} color={tokens.primary} />
            <StatChip icon={Radio} label="Ports" value={registry?.ports.length ?? "—"} color={tokens.primary} />
          </Box>

          <Divider />

          <SectionLabel>Active tunnels</SectionLabel>
          {err && <Typography variant="body2" sx={{ fontSize: "0.75rem", color: tokens.danger, mb: 1.5 }}>{err}</Typography>}

          {tunnels.length === 0 ? (
            <Box sx={{ p: 2.5, borderRadius: "14px", border: `1.5px dashed ${tokens.border}`, textAlign: "center" }}>
              <Typography variant="body2" sx={{ fontSize: "0.76rem", color: tokens.textSecondary }}>
                None active. Create one — it registers here instantly.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {tunnels.map((t) => (
                <Box key={t.tunnelId} sx={{ p: 1.8, borderRadius: "12px", bgcolor: "rgba(0, 0, 0, 0.02)", border: `1px solid ${tokens.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Typography sx={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 700, color: tokens.primary }}>{t.iface}</Typography>
                  <Typography sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: tokens.textSecondary }}>{t.serverIP} → {t.clientIP}</Typography>
                  <Typography sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: tokens.text }}>port {t.listenPort}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      </Grid>

      {/* Persistence & crash recovery */}
      <Grid item xs={12} md={6}>
        <Paper elevation={0} className="animate-fade-in-up" sx={cardSx()}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
            <Database size={20} color={tokens.primary} />
            <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
              Persistence &amp; Crash Recovery
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.8rem" }}>
            State writes through to Redis. A restart reloads live tunnels, drops dead ones.
          </Typography>

          <Divider />

          <SectionLabel>Live state</SectionLabel>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, px: 2, py: 1.3, borderRadius: "14px", bgcolor: "rgba(0, 0, 0, 0.02)", border: `1px solid ${tokens.border}`, flex: "1 1 140px" }}>
              <Box className={systemStatus?.redisConnected ? "status-pulse-green" : ""} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: systemStatus?.redisConnected ? tokens.success : tokens.danger }} />
              <Typography variant="body2" sx={{ fontSize: "0.8rem", fontWeight: 700, color: systemStatus?.redisConnected ? tokens.success : tokens.danger }}>
                {systemStatus ? (systemStatus.redisConnected ? "Redis connected" : "Redis disconnected") : "Checking..."}
              </Typography>
            </Box>
            <StatChip icon={Clock} label="Backend uptime" value={formatUptime(systemStatus?.backendUptimeSeconds)} color={tokens.primary} />
          </Box>

          <Divider />

          <SectionLabel>Try it</SectionLabel>
          <Typography variant="body2" sx={{ fontSize: "0.78rem", color: tokens.textSecondary, lineHeight: 1.6 }}>
            Restart the backend mid-demo — uptime resets, active tunnels don't.
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}
