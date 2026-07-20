// frontend/src/components/DownloadEncryptedConfig.jsx
import React, { useState } from "react";
import axios from "axios";
import nacl from "tweetnacl";
import { Button, Box, Typography, Alert, CircularProgress, Paper, Fade, Chip } from "@mui/material";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Smartphone, ShieldCheck, Lock } from "lucide-react";

import { deriveAESKeyFromShared, decryptAESGCM, downloadAsFile } from "../utils/cryptoClient";
import { tokens } from "../theme";

const CLIENT_PRIVATE_KEY_PLACEHOLDER = "__OTNT_CLIENT_PRIVATE_KEY__";

function encodeBase64(u8) {
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}
function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

export default function DownloadEncryptedConfig({ tunnelId, clientPrivateKey, onConfigReady }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configText, setConfigText] = useState(null);

  async function handleClick() {
    if (!tunnelId) return setError("Tunnel ID missing! Please create a tunnel first.");
    if (!clientPrivateKey) return setError("Client private key is missing. This config cannot be completed safely.");

    setBusy(true);
    setError(null);
    try {
      const ephemeralKeyPair = nacl.box.keyPair();
      const ephemeralPublicKeyB64 = encodeBase64(ephemeralKeyPair.publicKey);

      const resp = await axios.post(`${API_BASE}/tunnel/${tunnelId}/client-config`, { clientECDHPublicKey: ephemeralPublicKeyB64 });
      const { iv, tag, ciphertext, serverECDHPublicKey } = resp.data;

      const serverPubU8 = decodeBase64(serverECDHPublicKey);
      const sharedU8 = nacl.scalarMult(ephemeralKeyPair.secretKey, serverPubU8);
      const aesKey = await deriveAESKeyFromShared(sharedU8.buffer || sharedU8);

      const template = await decryptAESGCM({ ivB64: iv, tagB64: tag, ciphertextB64: ciphertext, aesCryptoKey: aesKey });
      if (!template.includes(CLIENT_PRIVATE_KEY_PLACEHOLDER)) throw new Error("Unexpected config format from server — placeholder not found.");

      const plaintext = template.replace(CLIENT_PRIVATE_KEY_PLACEHOLDER, clientPrivateKey);
      setConfigText(plaintext);
      onConfigReady?.();

      const fileName = resp.data.ifaceName ? `${resp.data.ifaceName}.conf` : `wg${tunnelId}.conf`;
      downloadAsFile(plaintext, fileName);
    } catch (err) {
      console.error("Error fetching/decrypting config:", err);
      setError(err?.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper
      elevation={0}
      sx={{ p: 3, borderRadius: "20px", height: "100%", textAlign: "center", animation: "fadeInUp 350ms ease both",
        "@keyframes fadeInUp": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}
    >
      <Typography variant="h6" sx={{ mb: 2 }}>Configuration</Typography>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: "12px", textAlign: "left" }}>{error}</Alert>}

      <Button
        variant="contained"
        color="primary"
        onClick={handleClick}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Download size={16} />}
        sx={{ px: 4, py: 1.1 }}
      >
        {busy ? "Preparing…" : "Download Config"}
      </Button>

      <Fade in={!!configText} unmountOnExit>
        <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${tokens.border}` }}>
          <Box sx={{ display: "inline-block", p: 1.6, border: `1px solid ${tokens.border}`, borderRadius: "16px" }}>
            {configText && <QRCodeCanvas value={configText} size={170} level="H" includeMargin />}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.6, mt: 1.5 }}>
            <Smartphone size={14} color={tokens.textSecondary} />
            <Typography variant="body2">Scan with WireGuard</Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mt: 1.5 }}>
            <Chip size="small" icon={<Lock size={12} />} label="Encrypted Delivery" sx={{ fontSize: "0.68rem", bgcolor: tokens.background }} />
            <Chip size="small" icon={<ShieldCheck size={12} />} label="AES-256" sx={{ fontSize: "0.68rem", bgcolor: tokens.background }} />
          </Box>
        </Box>
      </Fade>
    </Paper>
  );
}
