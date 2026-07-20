// frontend/src/components/SecureSessionCard.jsx
import React, { useState } from "react";
import { Box, Paper, Typography, Slide, IconButton, Tooltip } from "@mui/material";
import { ShieldCheck, KeyRound, Copy, Check, Lock } from "lucide-react";
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
    } catch {
      /* clipboard unavailable — silently ignore, not critical */
    }
  }
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2">{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.5 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: "0.82rem", color: tokens.text }}>
          {truncateKey(value)}
        </Typography>
        <Tooltip title={copied ? "Copied" : "Copy"}>
          <IconButton size="small" onClick={handleCopy}>
            {copied ? <Check size={15} color={tokens.success} /> : <Copy size={15} color={tokens.textSecondary} />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

function StatusRow({ icon, label }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
      {icon}
      <Typography variant="body2" sx={{ color: tokens.text, fontWeight: 500 }}>{label}</Typography>
    </Box>
  );
}

/**
 * Floating "Secure Session" panel. Slides in from the left once a tunnel
 * (and therefore a completed handshake) exists, stays visible for the
 * tunnel's lifetime. Displays only PUBLIC keys — never the client's
 * WireGuard private key, which never leaves App's in-memory state.
 */
export default function SecureSessionCard({ visible, clientPublicKey, serverPublicKey }) {
  return (
    <Slide direction="right" in={visible} mountOnEnter unmountOnExit>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: "18px",
          width: 280,
          position: { md: "sticky" },
          top: { md: 24 },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
          <Lock size={18} color={tokens.primary} />
          <Typography variant="h6" sx={{ fontSize: "1rem" }}>Secure Session</Typography>
        </Box>

        <CopyableRow label="Client WireGuard Key" value={clientPublicKey} />
        <CopyableRow label="Server ECDH Key" value={serverPublicKey} />

        <Box sx={{ height: 1, bgcolor: tokens.border, my: 2 }} />

        <StatusRow icon={<KeyRound size={16} color={tokens.success} />} label="Handshake complete" />
        <StatusRow icon={<ShieldCheck size={16} color={tokens.success} />} label="AES-256 session ready" />
      </Paper>
    </Slide>
  );
}
