// // frontend/src/components/DownloadEncryptedConfig.jsx

// import React, { useState } from 'react';
// import axios from 'axios';
// import nacl from 'tweetnacl';
// import {
//   deriveAESKeyFromShared,
//   decryptAESGCM,
//   downloadAsFile
// } from '../utils/cryptoClient';

// // ✅ Custom Base64 helpers (replace tweetnacl-util)
// function encodeBase64(uint8Array) {
//   let binary = '';
//   const len = uint8Array.length;
//   for (let i = 0; i < len; i++) {
//     binary += String.fromCharCode(uint8Array[i]);
//   }
//   return btoa(binary);
// }

// function decodeBase64(base64) {
//   const binary = atob(base64);
//   const len = binary.length;
//   const bytes = new Uint8Array(len);
//   for (let i = 0; i < len; i++) {
//     bytes[i] = binary.charCodeAt(i);
//   }
//   return bytes;
// }

// const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api';

// export default function DownloadEncryptedConfig({ tunnelId }) {
//   const [busy, setBusy] = useState(false);

//   async function handleClick() {
//     if (!tunnelId) {
//       alert('Tunnel ID missing! Please create a tunnel first.');
//       return;
//     }

//     setBusy(true);
//     try {
//       // 1) Generate ephemeral X25519 keypair (client side)
//       const clientKeyPair = nacl.box.keyPair();
//       const clientPublicKeyB64 = encodeBase64(clientKeyPair.publicKey);

//       // 2) Ask backend for encrypted config, send client public key
//       const resp = await axios.post(`${API_BASE}/tunnel/${tunnelId}/client-config`, {
//         clientECDHPublicKey: clientPublicKeyB64
//       });

//       const { iv, tag, ciphertext, serverECDHPublicKey } = resp.data;

//       // 3) Derive shared secret with X25519
//       const serverPubU8 = decodeBase64(serverECDHPublicKey);
//       const sharedU8 = nacl.scalarMult(clientKeyPair.secretKey, serverPubU8);

//       // 4) Derive AES-GCM key
//       const aesKey = await deriveAESKeyFromShared(sharedU8.buffer || sharedU8);

//       // 5) Decrypt config
//       const plaintext = await decryptAESGCM({
//         ivB64: iv,
//         tagB64: tag,
//         ciphertextB64: ciphertext,
//         aesCryptoKey: aesKey
//       });

//       // 6) Download as .conf file
//       const fileName = resp.data.ifaceName ? `${resp.data.ifaceName}.conf` : `wg${tunnelId}.conf`;
//       downloadAsFile(plaintext, fileName);

//       alert('Downloaded WireGuard config!');
//     } catch (err) {
//       console.error('Error fetching/decrypting config:', err);
//       alert('Failed: ' + (err?.response?.data?.error || err.message));
//     } finally {
//       setBusy(false);
//     }
//   }

//   return (
//     <button onClick={handleClick} disabled={busy}>
//       {busy ? 'Generating...' : 'Download Config'}
//     </button>
//   );
// }
// frontend/src/components/DownloadEncryptedConfig.jsx
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
import { QRCodeCanvas } from "qrcode.react"; // ✅ Correct import

import {
  deriveAESKeyFromShared,
  decryptAESGCM,
  downloadAsFile,
} from "../utils/cryptoClient";

// ✅ Custom Base64 helpers
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

export default function DownloadEncryptedConfig({ tunnelId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [configText, setConfigText] = useState(null);

  async function handleClick() {
    if (!tunnelId) {
      setError("Tunnel ID missing! Please create a tunnel first.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      // 1) Generate ephemeral X25519 keypair
      const clientKeyPair = nacl.box.keyPair();
      const clientPublicKeyB64 = encodeBase64(clientKeyPair.publicKey);

      // 2) Ask backend for encrypted config
      const resp = await axios.post(
        `${API_BASE}/tunnel/${tunnelId}/client-config`,
        {
          clientECDHPublicKey: clientPublicKeyB64,
        }
      );

      const { iv, tag, ciphertext, serverECDHPublicKey } = resp.data;

      // 3) Derive shared secret
      const serverPubU8 = decodeBase64(serverECDHPublicKey);
      const sharedU8 = nacl.scalarMult(clientKeyPair.secretKey, serverPubU8);

      // 4) Derive AES-GCM key
      const aesKey = await deriveAESKeyFromShared(
        sharedU8.buffer || sharedU8
      );

      // 5) Decrypt config
      const plaintext = await decryptAESGCM({
        ivB64: iv,
        tagB64: tag,
        ciphertextB64: ciphertext,
        aesCryptoKey: aesKey,
      });

      // 6) Save decrypted config in state
      setConfigText(plaintext);

      // 7) Auto download file
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
          <QRCodeCanvas value={configText} size={220} level="H" includeMargin />
          <Typography variant="body2" sx={{ mt: 2, color: "gray" }}>
            Open the WireGuard app → Add Tunnel → <b>Create from QR Code</b>
          </Typography>
        </Box>
      )}
    </Box>
  );
}

