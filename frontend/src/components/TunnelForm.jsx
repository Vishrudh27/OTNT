// frontend/src/components/TunnelForm.jsx
import React, { useState } from "react";
import { handshakeInit, createTunnel } from "../api/axios";
import { generateWireGuardKeys, generateECDHKeys, computeSharedSecret } from "../utils/wireguardKeys";
import { TextField, Button, Box, Typography, Alert, Paper, CircularProgress, InputAdornment } from "@mui/material";
import { Shield, Network, Timer, Database } from "lucide-react";
import { tokens } from "../theme";

export default function TunnelForm({ onTunnelCreated }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    allowedIPs: "10.77.0.2/32",
    endpoint: "",
    expirySeconds: 120,
    dataCapMB: ""
  });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const wg = generateWireGuardKeys();
      const ecdh = generateECDHKeys();
      const res = await handshakeInit(ecdh.publicKeyB64);
      const tunnelId = res.data.tunnelId;
      computeSharedSecret(ecdh.privateKey, res.data.serverECDHPublicKey);

      const payload = {
        tunnelId,
        peerPublicKey: wg.publicKey,
        allowedIPs: form.allowedIPs,
        endpoint: form.endpoint || undefined,
        expirySeconds: form.expirySeconds ? Number(form.expirySeconds) : undefined,
        dataCapBytes: form.dataCapMB ? Math.round(Number(form.dataCapMB) * 1024 * 1024) : undefined
      };
      const createRes = await createTunnel(payload);
      onTunnelCreated({ tunnelId, serverECDHPublicKey: res.data.serverECDHPublicKey, clientWG: wg, ...createRes.data });
    } catch (e) {
      console.error("Tunnel creation failed:", e);
      setError(e.response?.data?.error || "Failed to create tunnel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper
      elevation={0}
      component="form"
      onSubmit={onSubmit}
      className="animate-fade-in-up"
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
          <Shield size={20} color={tokens.primary} />
          <Typography variant="h6" sx={{ color: tokens.text, fontWeight: 700 }}>
            Create Secure Tunnel
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 3, fontSize: "0.82rem" }}>
          Spin up a dynamic, self-destructing WireGuard connection.
        </Typography>

        {error && (
          <Alert 
            severity="error" 
            sx={{ 
              mb: 3, 
              borderRadius: "14px", 
              bgcolor: "rgba(239, 68, 68, 0.1)", 
              border: `1px solid rgba(239, 68, 68, 0.2)`, 
              color: tokens.danger 
            }}
          >
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Gateway Endpoint"
            name="endpoint"
            value={form.endpoint}
            onChange={handleChange}
            placeholder="Auto-detected gateway IP"
            fullWidth
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Network size={16} color={tokens.textSecondary} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Tunnel Expiry Limit (seconds)"
            name="expirySeconds"
            type="number"
            value={form.expirySeconds}
            onChange={handleChange}
            fullWidth
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Timer size={16} color={tokens.textSecondary} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Bandwidth Data Cap (MB)"
            name="dataCapMB"
            type="number"
            value={form.dataCapMB}
            onChange={handleChange}
            placeholder="Unlimited data"
            fullWidth
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Database size={16} color={tokens.textSecondary} />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Box>

      <Button
        type="submit"
        variant="contained"
        color="primary"
        fullWidth
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Shield size={16} />}
        sx={{ mt: 4, py: 1.5, fontSize: "0.9rem", fontWeight: 700 }}
      >
        {busy ? "Establishing Connection..." : "Initialize Tunnel"}
      </Button>
    </Paper>
  );
}
