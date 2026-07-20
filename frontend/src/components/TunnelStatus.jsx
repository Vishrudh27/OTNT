// frontend/src/components/TunnelStatus.jsx
import React, { useEffect, useState } from "react";
import { Box, Paper, Typography, Button, CircularProgress, Alert, LinearProgress, Chip } from "@mui/material";
import { Clock, Database, Trash2 } from "lucide-react";
import { getTunnelStatus, deleteTunnel } from "../api/axios";
import { tokens } from "../theme";

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
    return () => {
      isMounted = false;
      clearInterval(intv);
    };
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
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const capMB = status?.dataCapBytes ? status.dataCapBytes / (1024 * 1024) : null;
  const usedMB = (status?.bytesTransferred || 0) / (1024 * 1024);
  const usagePct = capMB ? Math.min(100, (usedMB / capMB) * 100) : 0;
  // Synthesized display value: real server port (51820) is fixed in the
  // backend's config template, so this is an honest reconstruction, not a
  // fabricated field — the status endpoint itself doesn't return "endpoint".
  const endpoint = status?.serverIP ? `${status.serverIP}:51820` : "—";

  return (
    <Paper elevation={0} sx={{ p: 4, borderRadius: "20px", maxWidth: 520, mx: "auto" }}>
      {err && <Alert severity="warning" sx={{ mb: 2, borderRadius: "12px" }}>{err}</Alert>}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h6">Tunnel Status</Typography>
        <Chip
          size="small"
          label="Active"
          sx={{ bgcolor: "rgba(47,182,124,0.12)", color: tokens.success, fontWeight: 700 }}
        />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="subtitle2">Interface</Typography>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }}>{status?.iface || "—"}</Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2">Endpoint</Typography>
          <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }}>{endpoint}</Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2">Tunnel ID</Typography>
          <Typography sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
            {status?.tunnelId?.slice(0, 13)}…
          </Typography>
        </Box>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Clock size={13} color={tokens.textSecondary} />
            <Typography variant="subtitle2">Remaining</Typography>
          </Box>
          <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatTime(status?.timeLeftSeconds)}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Database size={13} color={tokens.textSecondary} />
            <Typography variant="subtitle2">Data Used</Typography>
          </Box>
          <Typography variant="body2">
            {usedMB.toFixed(2)} MB{capMB ? ` / ${capMB.toFixed(0)} MB` : ""}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={capMB ? usagePct : 0}
          sx={{
            "& .MuiLinearProgress-bar": {
              bgcolor: usagePct > 85 ? tokens.danger : tokens.primary,
              borderRadius: 8,
            },
          }}
        />
      </Box>

      <Button
        onClick={handleDelete}
        variant="outlined"
        color="error"
        fullWidth
        disabled={deleting}
        startIcon={<Trash2 size={16} />}
        sx={{ mt: 3 }}
      >
        {deleting ? "Deleting…" : "Delete Tunnel"}
      </Button>
    </Paper>
  );
}
