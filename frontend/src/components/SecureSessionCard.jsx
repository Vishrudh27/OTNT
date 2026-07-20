// frontend/src/components/SecureSessionCard.jsx
import React, { useState } from "react";
import { Box, Paper, Typography, Fade, IconButton, Tooltip, Chip } from "@mui/material";
import { Key, Copy, Check, Shield, Fingerprint } from "lucide-react";
import { tokens } from "../theme";

function truncateKey(key) {
  if (!key) return "—";
  return `${key.slice(0, 10)}…${key.slice(-8)}`;
}

function CopyableRow({ label, value }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <Box sx={{ py: 2, borderBottom: `1px solid ${tokens.border}` }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Fingerprint size={14} color={tokens.textSecondary} />
        <Typography variant="subtitle2" sx={{ fontSize: "0.68rem" }}>{label}</Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: "0.8rem", color: tokens.text, letterSpacing: "0.03em" }}>
          {truncateKey(value)}
        </Typography>
        <Tooltip title={copied ? "Copied Signature" : "Copy Signature"}>
          <IconButton size="small" onClick={handleCopy} sx={{ color: tokens.textSecondary, "&:hover": { color: tokens.primary } }}>
            {copied ? <Check size={14} color={tokens.success} /> : <Copy size={14} />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default function SecureSessionCard({ visible, clientPublicKey, serverPublicKey }) {
  return (
    <Fade in={visible} unmountOnExit>
      <Paper
        elevation={0}
        className="animate-slide-left"
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
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, color: tokens.text }}>
                Secure Key Exchange
              </Typography>
            </Box>
            <Chip
              size="small"
              icon={<Key size={12} />}
              label="Active Session"
              sx={{
                bgcolor: "rgba(16, 185, 129, 0.1)",
                color: tokens.success,
                borderColor: "rgba(16, 185, 129, 0.2)",
                fontWeight: 700,
                fontSize: "0.68rem"
              }}
            />
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <CopyableRow label="Client WG Public Key" value={clientPublicKey} />
            <CopyableRow label="Server ECDH Public Key" value={serverPublicKey} />
          </Box>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, pt: 3 }}>
          <Box sx={{ 
            width: 32, 
            height: 32, 
            borderRadius: "50%", 
            bgcolor: "rgba(16, 185, 129, 0.1)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center" 
          }}>
            <Shield size={16} color={tokens.success} />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: tokens.text, fontSize: "0.82rem" }}>
              AES-256-GCM Channel
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.72rem" }}>
              Configuration encrypted end-to-end
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Fade>
  );
}