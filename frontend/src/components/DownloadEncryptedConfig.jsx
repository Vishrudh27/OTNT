// frontend/src/components/DownloadEncryptedConfig.jsx
import React, { useState } from "react";
import axios from "axios";
import nacl from "tweetnacl";
import { Button, Box, Typography, Alert, CircularProgress, Paper, Fade } from "@mui/material";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Smartphone } from "lucide-react";

import {
  deriveAESKeyFromShared,
  decryptAESGCM,
  downloadAsFile,
} from "../utils/cryptoClient";
import { tokens } from "../theme";

const CLIENT_PRIVATE_KEY_PLACEHOLDER = "__OTNT_CLIENT_PRIVATE_KEY__";

function encodeBase64(uint8Array) {
  let binary = "";
  const len = uint8Array.length;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(uint8Array[i]);
  return btoa(binary);
}
function decodeBase64(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";

/**
 * @param {string} tunnelId
 * @param {string} clientPrivateKey - generated locally, never sent to server
 * @param {() => void} [onConfigReady] - optional callback, e.g. to advance
 *   TunnelLifecycle's timeline once a config has actually been delivered.
 */
export default function DownloadEncryptedConfig({ tunnelId, clientPrivateKey, onConfigReady }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configText, setConfigText] = useState(null);

  async function handleClick() {
    if (!tunnelId) {
      setError("Tunnel ID missing! Please create a tunnel first.");
      return;
    }
    if (!clientPrivateKey) {
      setError("Client private key is missing. This config cannot be completed safely.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const ephemeralKeyPair = nacl.box.keyPair();
      const ephemeralPublicKeyB64 = encodeBase64(ephemeralKeyPair.publicKey);

      const resp = await axios.post(
        `${API_BASE}/tunnel/${tunnelId}/client-config`,
        { clientECDHPublicKey: ephemeralPublicKeyB64 }
      );

      const { iv, tag, ciphertext, serverECDHPublicKey } = resp.data;

      const serverPubU8 = decodeBase64(serverECDHPublicKey);
      const sharedU8 = nacl.scalarMult(ephemeralKeyPair.secretKey, serverPubU8);
      const aesKey = await deriveAESKeyFromShared(sharedU8.buffer || sharedU8);

      const template = await decryptAESGCM({
        ivB64: iv,
        tagB64: tag,
        ciphertextB64: ciphertext,
        aesCryptoKey: aesKey,
      });

      if (!template.includes(CLIENT_PRIVATE_KEY_PLACEHOLDER)) {
        throw new Error("Unexpected config format from server — placeholder not found.");
      }
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
    <Paper elevation={0} sx={{ p: 4, borderRadius: "20px", maxWidth: 520, mx: "auto", mt: 3, textAlign: "center" }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Configuration</Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: "12px", textAlign: "left" }}>{error}</Alert>}

      <Button
        variant="contained"
        color="primary"
        onClick={handleClick}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Download size={16} />}
        sx={{ px: 4, py: 1.2 }}
      >
        {busy ? "Preparing…" : "Download Config"}
      </Button>

      <Fade in={!!configText} unmountOnExit>
        <Box sx={{ mt: 4, pt: 3, borderTop: `1px solid ${tokens.border}` }}>
          <Box sx={{ display: "inline-block", p: 2, border: `1px solid ${tokens.border}`, borderRadius: "16px" }}>
            {configText && <QRCodeCanvas value={configText} size={200} level="H" includeMargin />}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.8, mt: 2 }}>
            <Smartphone size={15} color={tokens.textSecondary} />
            <Typography variant="body2">
              Open WireGuard → Add Tunnel → <b>Create from QR Code</b>
            </Typography>
          </Box>
        </Box>
      </Fade>
    </Paper>
  );
}
