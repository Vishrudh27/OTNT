// frontend/src/components/TunnelForm.jsx
import React, { useState } from "react";
import { handshakeInit, createTunnel } from "../api/axios";
import { generateWireGuardKeys, generateECDHKeys, computeSharedSecret } from "../utils/wireguardKeys";
import { TextField, Button, Box, Typography, Alert, Paper, CircularProgress } from "@mui/material";
import { ShieldPlus } from "lucide-react";
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
      sx={{ p: 3, borderRadius: "20px", height: "100%", animation: "fadeInUp 350ms ease both",
        "@keyframes fadeInUp": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
        <ShieldPlus size={19} color={tokens.primary} />
        <Typography variant="h6">Create Tunnel</Typography>
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: "12px" }}>{error}</Alert>}
      <TextField label="Endpoint" name="endpoint" value={form.endpoint} onChange={handleChange} placeholder="Auto-detected if left blank" fullWidth margin="dense" size="small" />
      <TextField label="Expiry (seconds)" name="expirySeconds" type="number" value={form.expirySeconds} onChange={handleChange} fullWidth margin="dense" size="small" />
      <TextField label="Data Cap (MB)" name="dataCapMB" type="number" value={form.dataCapMB} onChange={handleChange} placeholder="No limit" fullWidth margin="dense" size="small" />
      <Button type="submit" variant="contained" color="primary" fullWidth disabled={busy} sx={{ mt: 2.5, py: 1.2 }} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ShieldPlus size={16} />}>
        {busy ? "Creating…" : "Create Tunnel"}
      </Button>
    </Paper>
  );
}
