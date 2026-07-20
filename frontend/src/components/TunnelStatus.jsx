// frontend/src/components/TunnelStatus.jsx
import React, { useEffect, useState } from "react";
import { Box, Paper, Typography, Button, CircularProgress, Alert, LinearProgress, Chip } from "@mui/material";
import { Clock, Network, Globe, Database, Trash2 } from "lucide-react";
import { getTunnelStatus, deleteTunnel } from "../api/axios";
import { tokens } from "../theme";

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function StatCard({ icon, label, value }) {
  return (
    <Box sx={{ p: 1.8, borderRadius: "14px", border: `1px solid ${tokens.border}`, bgcolor: tokens.background }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mb: 0.6 }}>
        {icon}
        <Typography variant="subtitle2">{label}</Typography>
      </Box>
      <Typography sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.95rem" }}>{value}</Typography>
    </Box>
  );
}

export default function TunnelStatus({ tunnelId, onTunnelDeleted }) {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let intv;
    let isMounted = true;
    async function pull() {
      try {
        const res = await getTunnelStatus(tunnelId);
        if (!isMounted) return;
        setStatus(res.data);
        setErr(null);
        if (res.data.status !== "active" || res.data.timeLeftSeconds === 0) {
          clearInterval(intv);
          onTunnelDeleted?.();
        }
      } catch (e) {
        if (!isMounted) return;
        if (e.response?.status === 404) {
          clearInterval(intv);
          onTunnelDeleted?.();
        } else {
          setErr("Temporary network error while fetching status");
        }
      }
    }
    pull();
    intv = setInterval(pull, 1000);
    return () => { isMounted = false; clearInterval(intv); };
  }, [tunnelId, onTunnelDeleted]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteTunnel(tunnelId);
      onTunnelDeleted?.();
    } catch {
      setErr("Failed to delete tunnel");
      setDeleting(false);
    }
  }

  if (!status && !err) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={26} /></Box>;
  }

  const capMB = status?.dataCapBytes ? status.dataCapBytes / (1024 * 1024) : null;
  const usedMB = (status?.bytesTransferred || 0) / (1024 * 1024);
  const usagePct = capMB ? Math.min(100, (usedMB / capMB) * 100) : 0;
  const endpoint = status?.serverIP ? `${status.serverIP}:51820` : "—";

  return (
    <Paper
      elevation={0}
      sx={{ p: 3, borderRadius: "20px", height: "100%", animation: "fadeInUp 350ms ease both",
        "@keyframes fadeInUp": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}
    >
      {err && <Alert severity="warning" sx={{ mb: 2, borderRadius: "12px" }}>{err}</Alert>}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6">Tunnel Status</Typography>
        <Chip size="small" label="Active" sx={{ bgcolor: "rgba(16,185,129,0.10)", color: tokens.success, fontWeight: 700 }} />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 2.5 }}>
        <StatCard icon={<Clock size={13} color={tokens.textSecondary} />} label="Remaining" value={formatTime(status?.timeLeftSeconds)} />
        <StatCard icon={<Network size={13} color={tokens.textSecondary} />} label="Interface" value={status?.iface || "—"} />
        <StatCard icon={<Globe size={13} color={tokens.textSecondary} />} label="Endpoint" value={endpoint} />
        <StatCard icon={<Database size={13} color={tokens.textSecondary} />} label="Data Used" value={`${usedMB.toFixed(2)} MB`} />
      </Box>

      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.8 }}>
          <Typography variant="subtitle2">Usage</Typography>
          <Typography variant="body2">{capMB ? `${capMB.toFixed(0)} MB cap` : "No cap"}</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={capMB ? usagePct : 0}
          sx={{ "& .MuiLinearProgress-bar": { bgcolor: usagePct > 85 ? tokens.danger : tokens.primary, borderRadius: 8 } }}
        />
      </Box>

      <Button
        onClick={handleDelete}
        variant="outlined"
        color="error"
        fullWidth
        disabled={deleting}
        startIcon={<Trash2 size={15} />}
        sx={{ mt: 2 }}
      >
        {deleting ? "Deleting…" : "Delete Tunnel"}
      </Button>
    </Paper>
  );
}
