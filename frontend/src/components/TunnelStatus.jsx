// frontend/src/components/TunnelStatus.jsx
import React, { useEffect, useState } from "react";
import { Box, Paper, Typography, Button, CircularProgress, Alert, LinearProgress, Chip, Grid } from "@mui/material";
import { Timer, Wifi, Database, Network, Shield, Radio } from "lucide-react";
import { getTunnelStatus, deleteTunnel } from "../api/axios";
import { tokens } from "../theme";

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatHandshake(ageSeconds) {
  if (ageSeconds === null || ageSeconds === undefined) return "No handshake yet";
  if (ageSeconds < 2) return "just now";
  return `${ageSeconds}s ago`;
}

function Fact({ icon: Icon, label, value }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
      <Icon size={13} color={tokens.textSecondary} />
      <Typography variant="body2" sx={{ fontSize: "0.72rem", color: tokens.textSecondary }}>{label}</Typography>
      <Typography sx={{ fontFamily: "monospace", fontSize: "0.75rem", fontWeight: 700, color: tokens.text }}>{value}</Typography>
    </Box>
  );
}

export default function TunnelStatus({ tunnelId, onTunnelDeleted, onTunnelDestroyed, onStatusUpdate }) {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [tombstone, setTombstone] = useState(null);

  useEffect(() => {
    let intv;
    let isMounted = true;
    async function pull() {
      try {
        const res = await getTunnelStatus(tunnelId);
        if (!isMounted) return;
        setStatus(res.data);
        setErr(null);
        onStatusUpdate?.(res.data);
      } catch (e) {
        if (!isMounted) return;
        if (e.response?.status === 410) {
          clearInterval(intv);
          setTombstone(e.response.data);
          onTunnelDestroyed?.(e.response.data);
        } else if (e.response?.status === 404) {
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
  }, [tunnelId, onTunnelDeleted, onTunnelDestroyed, onStatusUpdate]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await deleteTunnel(tunnelId);
      setTombstone(res.data);
      onTunnelDestroyed?.(res.data);
    } catch {
      setErr("Couldn't destroy the tunnel — check your connection and try again.");
      setDeleting(false);
    }
  }

  const isLoading = !status && !err && !tombstone;

  const capMB = status?.dataCapBytes ? status.dataCapBytes / (1024 * 1024) : null;
  const usedMB = (status?.bytesTransferred || 0) / (1024 * 1024);
  const usagePct = capMB ? Math.min(100, (usedMB / capMB) * 100) : 0;

  const heroSx = {
    p: 3,
    borderRadius: "24px",
    bgcolor: "rgba(255, 255, 255, 0.45)",
    backdropFilter: "blur(16px)",
    border: `1.5px solid rgba(217, 119, 6, 0.35)`,
    boxShadow: `0 0 0 1px rgba(217, 119, 6, 0.05), ${tokens.softShadow}`,
  };

  if (tombstone) {
    const usedMBFinal = ((tombstone.dataUsedBytes || 0) / (1024 * 1024)).toFixed(2);
    const capMBFinal = tombstone.dataCapBytes ? (tombstone.dataCapBytes / (1024 * 1024)).toFixed(2) : null;
    return (
      <Grid item xs={12}>
        <Paper elevation={0} className="animate-fade-in-up" sx={{ ...heroSx, borderColor: "rgba(239, 68, 68, 0.35)", boxShadow: `0 0 0 1px rgba(239, 68, 68, 0.06), ${tokens.softShadow}` }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: tokens.danger }} />
            <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
              Tunnel Destroyed — {tombstone.reason || "terminated"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 2 }}>
            <Fact icon={Database} label="Final data used" value={`${usedMBFinal} MB${capMBFinal ? ` / ${capMBFinal} MB` : ""}`} />
            <Fact icon={Network} label="Interface" value={tombstone.ifaceName || "—"} />
          </Box>
          <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.78rem", mb: 2 }}>
            Kernel interface removed, IP/port released, teardown logged.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => onTunnelDeleted?.()}
            sx={{ py: 1.2, fontWeight: 700 }}
          >
            Create another tunnel
          </Button>
        </Paper>
      </Grid>
    );
  }

  return (
    <Grid item xs={12}>
      <Paper elevation={0} className="animate-fade-in-up" sx={heroSx}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box className={status ? "status-pulse-green" : ""} sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: status ? tokens.success : tokens.primary }} />
            <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
              {status ? "Tunnel Active" : "Establishing Tunnel..."}
            </Typography>
          </Box>
          <Button
            onClick={handleDelete}
            variant="outlined"
            color="error"
            disabled={deleting || isLoading}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <Shield size={14} />}
            sx={{ py: 1, fontSize: "0.8rem", fontWeight: 700 }}
          >
            {deleting ? "Tearing Down..." : "Destroy Tunnel"}
          </Button>
        </Box>

        {err && <Alert severity="warning" sx={{ mb: 2, borderRadius: "12px", py: 0.5, fontSize: "0.75rem" }}>{err}</Alert>}

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
            <CircularProgress size={20} color="primary" />
          </Box>
        ) : (
          <>
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 2 }}>
              <Box sx={{ flex: "1 1 260px" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mb: 0.8 }}>
                  <Timer size={13} color={tokens.textSecondary} />
                  <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.72rem", fontWeight: 600 }}>Time remaining</Typography>
                </Box>
                <Typography variant="h4" sx={{ fontFamily: "monospace", fontWeight: 800, color: tokens.accentDark, mb: 0.8 }}>
                  {formatTime(status?.timeLeftSeconds)}
                </Typography>
                {status?.timeLeftSeconds !== null && status?.timeLeftSeconds !== undefined && (
                  <LinearProgress
                    variant="determinate"
                    value={status.timeLeftSeconds <= 60 ? Math.min(100, (status.timeLeftSeconds / 60) * 100) : 100}
                    sx={{ height: 6, borderRadius: 4, "& .MuiLinearProgress-bar": { bgcolor: status.timeLeftSeconds < 15 ? tokens.danger : tokens.primary, borderRadius: 4 } }}
                  />
                )}
              </Box>

              <Box sx={{ flex: "1 1 260px" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.8 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                    <Database size={13} color={tokens.textSecondary} />
                    <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.72rem", fontWeight: 600 }}>Data used</Typography>
                  </Box>
                  <Typography sx={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700 }}>
                    {usedMB.toFixed(2)} MB / {capMB ? `${capMB.toFixed(0)} MB` : "∞"}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={capMB ? usagePct : 0}
                  sx={{ height: 6, borderRadius: 4, "& .MuiLinearProgress-bar": { bgcolor: usagePct > 80 ? tokens.danger : tokens.success, borderRadius: 4 } }}
                />
                {usagePct > 80 && <Typography variant="body2" sx={{ fontSize: "0.68rem", color: tokens.danger, mt: 0.5 }}>⚠ closer to firing</Typography>}
              </Box>
            </Box>

            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", pt: 2, borderTop: `1px solid ${tokens.border}` }}>
              <Fact icon={Wifi} label="Endpoint" value={status?.endpoint || "—"} />
              <Fact icon={Network} label="Interface" value={status?.iface || "—"} />
              <Fact icon={Shield} label="Local IP" value={status?.clientIP || "—"} />
              <Fact icon={Radio} label="Handshake" value={formatHandshake(status?.handshakeAgeSeconds)} />
            </Box>
          </>
        )}
      </Paper>
    </Grid>
  );
}
