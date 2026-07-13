import React, { useEffect, useState } from "react";
import { Box, Typography, Button, CircularProgress, Alert } from "@mui/material";
import { getTunnelStatus, deleteTunnel } from "../api/axios";

export default function TunnelStatus({ tunnelId, onTunnelDeleted }) {
  const [status, setStatus] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let intv;
    let isMounted = true;

    async function pull() {
      try {
        const res = await getTunnelStatus(tunnelId);
        if (!isMounted) return;

        setStatus(res.data);
        setErr(null);

        // Clear interval if tunnel truly expired or deleted
        if (res.data.status !== "active" || res.data.timeLeftSeconds === 0) {
          clearInterval(intv);
          onTunnelDeleted?.();
        }
      } catch (e) {
        if (!isMounted) return;

        // Instead of immediately showing error, treat 404 as tunnel ended
        if (e.response?.status === 404) {
          clearInterval(intv);
          onTunnelDeleted?.();
        } else {
          // transient fetch errors: keep previous status, show a warning
          setErr("Temporary network error while fetching status");
        }
      }
    }

    pull(); // initial fetch
    intv = setInterval(pull, 1000);

    return () => {
      isMounted = false;
      clearInterval(intv);
    };
  }, [tunnelId, onTunnelDeleted]);

  async function handleDelete() {
    try {
      await deleteTunnel(tunnelId);
      onTunnelDeleted?.();
    } catch {
      setErr("Failed to delete tunnel");
    }
  }

  // Show loading while no status yet
  if (!status && !err) return <CircularProgress />;

  return (
    <Box sx={{ maxWidth: 520, mx: "auto", mt: 3, p: 2, border: "1px solid #ddd", borderRadius: 2 }}>
      {err && <Alert severity="warning" sx={{ mb: 2 }}>{err}</Alert>}
      <Typography variant="h6" gutterBottom>Tunnel Status</Typography>
      <Typography sx={{ fontFamily: "monospace" }}>ID: {status?.tunnelId}</Typography>
      <Typography>
        Time Left: {status?.timeLeftSeconds !== null ? `${status.timeLeftSeconds}s` : "—"}
      </Typography>
      <Typography>
        Data Used: {(status?.bytesTransferred / (1024 * 1024) || 0).toFixed(2)} MB
      </Typography>
      {status?.dataCapBytes && (
        <Typography>
          Data Cap: {(status.dataCapBytes / (1024 * 1024)).toFixed(0)} MB
        </Typography>
      )}
      <Button
        onClick={handleDelete}
        variant="contained"
        color="error"
        fullWidth
        sx={{ mt: 2 }}
      >
        Delete Tunnel
      </Button>
    </Box>
  );
}
