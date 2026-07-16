// frontend/src/components/DownloadEncryptedConfig.jsx
import React, { useState } from "react";
import axios from "axios";
import nacl from "tweetnacl";
import {
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from "@mui/material";
import { QRCodeCanvas } from "qrcode.react";

import {
  deriveAESKeyFromShared,
  decryptAESGCM,
  downloadAsFile,
} from "../utils/cryptoClient";

/**
 * Must match the exact placeholder string used server-side in
 * backend/index.js (CLIENT_PRIVATE_KEY_PLACEHOLDER). The server never
 * generates or sees a client WireGuard private key — it ships this
 * placeholder inside the encrypted config template, and this component
 * splices in the real private key locally, after decryption.
 */
const CLIENT_PRIVATE_KEY_PLACEHOLDER = "__OTNT_CLIENT_PRIVATE_KEY__";

// --- Base64 helpers ---
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
 * @param {string} tunnelId - Active tunnel identifier.
 * @param {string} clientPrivateKey - Base64-encoded WireGuard private key
 *   generated locally in TunnelForm.jsx. Never sent to the server. Required
 *   to produce a config that actually matches the registered peer.
 */
export default function DownloadEncryptedConfig({ tunnelId, clientPrivateKey }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configText, setConfigText] = useState(null);

  async function handleClick() {
    if (!tunnelId) {
      setError("Tunnel ID missing! Please create a tunnel first.");
      return;
    }
    if (!clientPrivateKey) {
      // Fail loudly rather than silently shipping a broken/placeholder
      // config — this should only happen if this component is ever used
      // without going through the normal TunnelForm -> App flow.
      setError(
        "Client private key is missing. This config cannot be completed safely."
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // 1) Generate an ephemeral X25519 keypair for this download request
      //    (this is the ECDH exchange used only to encrypt the config in
      //    transit — separate from the WireGuard identity keypair).
      const ephemeralKeyPair = nacl.box.keyPair();
      const ephemeralPublicKeyB64 = encodeBase64(ephemeralKeyPair.publicKey);

      // 2) Ask backend for the encrypted config template.
      const resp = await axios.post(
        `${API_BASE}/tunnel/${tunnelId}/client-config`,
        { clientECDHPublicKey: ephemeralPublicKeyB64 }
      );

      const { iv, tag, ciphertext, serverECDHPublicKey } = resp.data;

      // 3) Derive the shared secret for THIS delivery.
      const serverPubU8 = decodeBase64(serverECDHPublicKey);
      const sharedU8 = nacl.scalarMult(ephemeralKeyPair.secretKey, serverPubU8);

      // 4) Derive the AES-GCM key from the shared secret.
      const aesKey = await deriveAESKeyFromShared(sharedU8.buffer || sharedU8);

      // 5) Decrypt the template (still contains the placeholder, not a
      //    real private key — the server never had one to embed).
      const template = await decryptAESGCM({
        ivB64: iv,
        tagB64: tag,
        ciphertextB64: ciphertext,
        aesCryptoKey: aesKey,
      });

      // 6) Complete the config LOCALLY by substituting in the private key
      //    that was generated in this browser and never transmitted. This
      //    is the step that guarantees the file matches the peer that was
      //    actually registered on the server's WireGuard interface.
      if (!template.includes(CLIENT_PRIVATE_KEY_PLACEHOLDER)) {
        throw new Error(
          "Unexpected config format from server — placeholder not found."
        );
      }
      const plaintext = template.replace(
        CLIENT_PRIVATE_KEY_PLACEHOLDER,
        clientPrivateKey
      );

      // 7) Save the completed config in state (for the on-screen QR code).
      setConfigText(plaintext);

      // 8) Auto-download the completed .conf file.
      const fileName = resp.data.ifaceName
        ? `${resp.data.ifaceName}.conf`
        : `wg${tunnelId}.conf`;
      downloadAsFile(plaintext, fileName);
    } catch (err) {
      console.error("Error fetching/decrypting config:", err);
      setError(err?.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ textAlign: "center", mt: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        color="primary"
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? <CircularProgress size={24} /> : "Get Config"}
      </Button>

      {configText && (
        <Box sx={{ mt: 4, p: 3, border: "1px solid #ddd", borderRadius: "12px" }}>
          <Typography variant="h6" gutterBottom>
            📲 Scan on Mobile (WireGuard)
          </Typography>
          {/*
            NOTE: configText now contains the real private key (substituted
            in step 6 above), so this QR code is sensitive — it's rendered
            only in this browser tab's memory and is never sent anywhere.
          */}
          <QRCodeCanvas value={configText} size={220} level="H" includeMargin />
          <Typography variant="body2" sx={{ mt: 2, color: "gray" }}>
            Open the WireGuard app → Add Tunnel → <b>Create from QR Code</b>
          </Typography>
        </Box>
      )}
    </Box>
  );
}