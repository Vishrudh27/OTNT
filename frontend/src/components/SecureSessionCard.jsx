// frontend/src/components/SecureSessionCard.jsx
import React, { useState } from "react";
import { Box, Paper, Typography, Fade, IconButton, Tooltip, Chip } from "@mui/material";
import { KeyRound, Copy, Check, ShieldCheck } from "lucide-react";
import { tokens } from "../theme";

function truncateKey(key) {
  if (!key) return "—";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
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
    <Box sx={{ py: 1.5, borderBottom: `1px solid ${tokens.border}` }}>
      <Typography variant="subtitle2">{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.4 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: "0.82rem" }}>{truncateKey(value)}</Typography>
        <Tooltip title={copied ? "Copied" : "Copy"}>
          <IconButton size="small" onClick={handleCopy}>
            {copied ? <Check size={14} color={tokens.success} /> : <Copy size={14} color={tokens.textSecondary} />}
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
        sx={{ p: 3, borderRadius: "20px", height: "100%", animation: "fadeInUp 350ms ease both",
          "@keyframes fadeInUp": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="h6" sx={{ fontSize: "1rem" }}>🔐 Secure Session</Typography>
        </Box>
        <Chip
          size="small"
          icon={<KeyRound size={12} />}
          label="Handshake Complete"
          sx={{ bgcolor: "rgba(16,185,129,0.10)", color: tokens.success, mb: 1, fontSize: "0.72rem" }}
        />

        <CopyableRow label="Client Key" value={clientPublicKey} />
        <CopyableRow label="Server Key" value={serverPublicKey} />

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, pt: 1.5 }}>
          <ShieldCheck size={16} color={tokens.success} />
          <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.text }}>AES-256 Ready</Typography>
        </Box>
      </Paper>
    </Fade>
  );
}