// frontend/src/components/TunnelStatus.jsx
import React, { useEffect, useState } from "react";
import { Box, Paper, Typography, Button, CircularProgress, Alert, LinearProgress, Chip, Grid } from "@mui/material";
import { Timer, Wifi, Database, Activity, Shield, Network } from "lucide-react";
import { getTunnelStatus, deleteTunnel } from "../api/axios";
import { tokens } from "../theme";

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function StatField({ icon: Icon, label, value, color }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1.5, borderBottom: `1px solid ${tokens.border}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Icon size={14} color={tokens.textSecondary} />
        <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.8rem" }}>{label}</Typography>
      </Box>
      <Typography sx={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, color: color || tokens.text, ml: "auto" }}>
        {value}
      </Typography>
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

  // Preserve loading structure but within Grid cards to prevent layout shifts
  const isLoading = !status && !err;

  const capMB = status?.dataCapBytes ? status.dataCapBytes / (1024 * 1024) : null;
  const usedMB = (status?.bytesTransferred || 0) / (1024 * 1024);
  const usagePct = capMB ? Math.min(100, (usedMB / capMB) * 100) : 0;
  const endpoint = status?.serverIP ? `${status.serverIP}:51820` : "—";

  return (
    <>
      {/* CARD 1: Tunnel Status */}
      <Grid item xs={12} md={4}>
        <Paper
          elevation={0}
          className="animate-slide-right"
          sx={{
            p: 4,
            borderRadius: "24px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            bgcolor: "rgba(255, 255, 255, 0.45)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${tokens.border}`,
          }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
                Tunnel Connection
              </Typography>
              <Chip
                size="small"
                label={status ? "Active" : "Pending"}
                sx={{
                  bgcolor: status ? "rgba(16, 185, 129, 0.1)" : "rgba(217, 119, 6, 0.1)",
                  color: status ? tokens.success : tokens.primary,
                  borderColor: status ? "rgba(16, 185, 129, 0.2)" : "rgba(217, 119, 6, 0.2)",
                  fontWeight: 700,
                  fontSize: "0.68rem"
                }}
              />
            </Box>

            {err && <Alert severity="warning" sx={{ mb: 2, borderRadius: "12px", py: 0.5, fontSize: "0.75rem" }}>{err}</Alert>}

            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
                <CircularProgress size={20} color="primary" />
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                <StatField icon={Network} label="Virtual Interface" value={status?.iface || "—"} color={tokens.primary} />
                <StatField icon={Wifi} label="Tunnel Endpoint" value={endpoint} />
                <StatField icon={Shield} label="Local IP Address" value={status?.clientIP || "—"} />
              </Box>
            )}
          </Box>

          <Button
            onClick={handleDelete}
            variant="outlined"
            color="error"
            fullWidth
            disabled={deleting || isLoading}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <Shield size={14} />}
            sx={{ mt: 3, py: 1.1, fontSize: "0.8rem", fontWeight: 700 }}
          >
            {deleting ? "Tearing Down..." : "Destroy Tunnel"}
          </Button>
        </Paper>
      </Grid>

      {/* CARD 2: Tunnel Statistics */}
      <Grid item xs={12} md={4}>
        <Paper
          elevation={0}
          className="animate-slide-right"
          sx={{
            p: 4,
            borderRadius: "24px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            bgcolor: "rgba(255, 255, 255, 0.45)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${tokens.border}`,
          }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
                Tunnel Statistics
              </Typography>
              <Activity size={16} color={tokens.secondary} className="pulse-indicator" />
            </Box>

            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
                <CircularProgress size={20} color="primary" />
              </Box>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {/* Expiry Clock */}
                <Box sx={{ p: 2, borderRadius: "14px", border: `1px solid ${tokens.border}`, bgcolor: "rgba(0, 0, 0, 0.02)", display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Timer size={18} color={tokens.secondary} />
                  <Box>
                    <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.68rem", fontWeight: 600 }}>
                      TIME REMAINING
                    </Typography>
                    <Typography variant="h5" sx={{ fontFamily: "monospace", fontWeight: 800, color: tokens.secondary }}>
                      {formatTime(status?.timeLeftSeconds)}
                    </Typography>
                  </Box>
                </Box>

                {/* Data Cap stats */}
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.8, alignItems: "baseline" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8 }}>
                      <Database size={13} color={tokens.textSecondary} />
                      <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.72rem", fontWeight: 600 }}>
                        DATA CONSUMED
                      </Typography>
                    </Box>
                    <Typography sx={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 700 }}>
                      {usedMB.toFixed(2)} MB / {capMB ? `${capMB.toFixed(0)} MB` : "∞"}
                    </Typography>
                  </Box>

                  <LinearProgress
                    variant="determinate"
                    value={capMB ? usagePct : 0}
                    sx={{
                      height: 6,
                      borderRadius: 4,
                      "& .MuiLinearProgress-bar": {
                        bgcolor: usagePct > 80 ? tokens.danger : tokens.success,
                        borderRadius: 4
                      }
                    }}
                  />
                </Box>
              </Box>
            )}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2, pt: 1.5, borderTop: `1px solid ${tokens.border}` }}>
            <Activity size={14} color={tokens.success} />
            <Typography variant="body2" sx={{ fontSize: "0.72rem", color: tokens.textSecondary }}>
              Data sync interval: 1000ms
            </Typography>
          </Box>
        </Paper>
      </Grid>
    </>
  );
}
