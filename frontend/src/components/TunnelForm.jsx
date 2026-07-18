
import React, { useState } from "react";
import { handshakeInit, createTunnel } from "../api/axios";
import { generateWireGuardKeys, generateECDHKeys, computeSharedSecret } from "../utils/wireguardKeys";
import { TextField, Button, Box, Typography, Alert } from "@mui/material";
import "./TunnelForm.css";

export default function TunnelForm({ onTunnelCreated }) {
  const [clientWG, setClientWG] = useState(null);
  const [serverECDHPub, setServerECDHPub] = useState(null);
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
      // Generate client WireGuard + ECDH keys
      const wg = generateWireGuardKeys();
      setClientWG(wg);

      const ecdh = generateECDHKeys();

      // Step 1: Handshake
      const res = await handshakeInit(ecdh.publicKeyB64);
      const tunnelId = res.data.tunnelId;
      setServerECDHPub(res.data.serverECDHPublicKey);

      // (Optional debug: shared secret)
      const shared = computeSharedSecret(ecdh.privateKey, res.data.serverECDHPublicKey);
      console.log("ECDH shared (client, b64):", shared);

      // Step 2: Create tunnel
      const payload = {
        tunnelId,
        peerPublicKey: wg.publicKey,
        allowedIPs: form.allowedIPs,
        endpoint: form.endpoint || undefined,
        expirySeconds: form.expirySeconds ? Number(form.expirySeconds) : undefined,
        dataCapBytes: form.dataCapMB ? Math.round(Number(form.dataCapMB) * 1024 * 1024) : undefined
      };

      const createRes = await createTunnel(payload);

      // ✅ Pass tunnelId + server key back to parent
      onTunnelCreated({
        tunnelId,
        serverECDHPublicKey: res.data.serverECDHPublicKey,
        clientWG: wg,
        ...createRes.data
      });
    } catch (e) {
      console.error("Tunnel creation failed:", e);
      setError(e.response?.data?.error || "Failed to create tunnel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="form" onSubmit={onSubmit} className="tunnel-form-container">
      <Typography variant="h5">Create Ephemeral Tunnel</Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        label="Allowed IPs (peer)"
        name="allowedIPs"
        value={form.allowedIPs}
        onChange={handleChange}
        helperText="Peer address reachable via this tunnel (e.g., 10.77.0.2/32)"
        fullWidth margin="normal"
        required
      />
      <TextField
        label="Peer Endpoint (optional)"
        name="endpoint"
        value={form.endpoint}
        onChange={handleChange}
        helperText="host:port (if peer is public)"
        fullWidth margin="normal"
      />
      <TextField
        label="Expiry (seconds)"
        name="expirySeconds"
        type="number"
        value={form.expirySeconds}
        onChange={handleChange}
        fullWidth margin="normal"
      />
      <TextField
        label="Data cap (MB)"
        name="dataCapMB"
        type="number"
        value={form.dataCapMB}
        onChange={handleChange}
        fullWidth margin="normal"
      />

      <Box className="key-box">
        <Typography variant="subtitle2">Your (client) WireGuard Public Key</Typography>
        <Typography>{clientWG?.publicKey || "..."}</Typography>
      </Box>

      <Box className="key-box">
        <Typography variant="subtitle2">Server ECDH Public Key</Typography>
        <Typography>{serverECDHPub || "..."}</Typography>
      </Box>

      <Button type="submit" className="tunnel-submit-btn" fullWidth disabled={busy}>
        {busy ? "Creating..." : "Create Tunnel"}
      </Button>
    </Box>
  );
}
