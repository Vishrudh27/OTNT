// frontend/src/components/DownloadEncryptedConfig.jsx
import React, { useState } from "react";
import nacl from "tweetnacl";
import { Button, Box, Typography, Alert, CircularProgress, Paper, Fade, Chip, Grid } from "@mui/material";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Lock, Shield, Wifi } from "lucide-react";

import api from "../api/axios";
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

export default function DownloadEncryptedConfig({ tunnelId, clientPrivateKey, onConfigReady, md = 4 }) {
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

      const resp = await api.post(`/tunnel/${tunnelId}/client-config`, { clientECDHPublicKey: ephemeralPublicKeyB64 });
      const { iv, tag, ciphertext, serverECDHPublicKey } = resp.data;

      const serverPubU8 = decodeBase64(serverECDHPublicKey);
      const sharedU8 = nacl.scalarMult(ephemeralKeyPair.secretKey, serverPubU8);
      const aesKey = await deriveAESKeyFromShared(sharedU8.buffer || sharedU8);

      const template = await decryptAESGCM({ ivB64: iv, tagB64: tag, ciphertextB64: ciphertext, aesCryptoKey: aesKey });
      if (!template.includes(CLIENT_PRIVATE_KEY_PLACEHOLDER)) throw new Error("Unexpected config format from server — placeholder not found.");

      const plaintext = template.replace(CLIENT_PRIVATE_KEY_PLACEHOLDER, clientPrivateKey);
      setConfigText(plaintext);
      onConfigReady?.(plaintext);

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
    <>
      {/* Card 1: Configuration Downloader */}
      <Grid item xs={12} md={md}>
        <Paper
          elevation={0}
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
            <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, mb: 1, color: tokens.text }}>
              Configuration Package
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 3, fontSize: "0.82rem" }}>
              Request and decrypt the ephemeral WireGuard configuration profile.
            </Typography>

            {error && (
              <Alert 
                severity="error" 
                sx={{ 
                  mb: 3, 
                  borderRadius: "14px", 
                  bgcolor: "rgba(239, 68, 68, 0.1)", 
                  border: `1px solid rgba(239, 68, 68, 0.2)`, 
                  color: tokens.danger,
                  fontSize: "0.78rem" 
                }}
              >
                {error}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Chip size="small" icon={<Lock size={12} />} label="Encrypted Channel" sx={{ fontSize: "0.68rem", bgcolor: "rgba(139, 92, 246, 0.1)", color: tokens.purple, borderColor: "rgba(139, 92, 246, 0.15)" }} />
                <Chip size="small" icon={<Shield size={12} />} label="AES-256-GCM" sx={{ fontSize: "0.68rem", bgcolor: "rgba(16, 185, 129, 0.1)", color: tokens.success, borderColor: "rgba(16, 185, 129, 0.15)" }} />
              </Box>
              <Typography variant="body2" sx={{ fontSize: "0.75rem", color: tokens.textSecondary }}>
                The server generates a config template with a client-private-key placeholder. Your client decodes it using WebCrypto APIs.
              </Typography>
            </Box>
          </Box>

          <Button
            variant="contained"
            color="primary"
            onClick={handleClick}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <Download size={16} />}
            sx={{ py: 1.5, fontWeight: 700 }}
          >
            {busy ? "Decrypting Package..." : "Decrypt & Download"}
          </Button>
        </Paper>
      </Grid>

      {/* Card 2: QR Setup Panel */}
      <Grid item xs={12} md={md}>
        <Paper
          elevation={0}
          className="animate-fade-in-up"
          sx={{
            p: 4,
            borderRadius: "24px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(255, 255, 255, 0.45)",
            backdropFilter: "blur(16px)",
            border: `1px solid ${tokens.border}`,
            textAlign: "center",
          }}
        >
          {configText ? (
            <Fade in={true}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box sx={{
                  p: 2,
                  bgcolor: "#FFFFFF",
                  borderRadius: "20px",
                  display: "inline-block",
                  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.15)",
                  border: `1px solid ${tokens.border}`
                }}>
                  <QRCodeCanvas value={configText} size={150} level="H" includeMargin />
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2.5 }}>
                  <Wifi size={14} color={tokens.success} />
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem", color: tokens.text }}>
                    Scan QR Setup
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.72rem", mt: 0.5 }}>
                  Aim your mobile WireGuard camera here to import.
                </Typography>
              </Box>
            </Fade>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2 }}>
              <Box sx={{
                width: 70,
                height: 70,
                borderRadius: "50%",
                border: `1.5px dashed ${tokens.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2.5,
                bgcolor: "rgba(0, 0, 0, 0.02)"
              }}>
                <Lock size={26} color={tokens.textSecondary} className="pulse-indicator" />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.text, fontSize: "0.85rem" }}>
                Setup QR Locked
              </Typography>
              <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.75rem", mt: 0.8, px: 2 }}>
                Decrypt and download configuration package first to unlock target QR sync.
              </Typography>
            </Box>
          )}
        </Paper>
      </Grid>
    </>
  );
}
