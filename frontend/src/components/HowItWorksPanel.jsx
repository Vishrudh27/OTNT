// frontend/src/components/HowItWorksPanel.jsx
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Fingerprint, Key, Shield, Lock, Timer } from "lucide-react";
import { tokens } from "../theme";

const ARCH_STEPS = [
  { icon: Fingerprint, label: "Client Identity", description: "Browser generates its own WireGuard keypair. The private key never leaves the device." },
  { icon: Key, label: "ECDH Handshake", description: "Client and server derive a shared secret over Curve25519, without ever transmitting it." },
  { icon: Shield, label: "WireGuard Tunnel", description: "Server allocates a real kernel interface, IP, and port — not a simulation." },
  { icon: Lock, label: "AES Encryption", description: "Config template is encrypted with AES-256-GCM before it ever leaves the server." },
  { icon: Timer, label: "Auto Destroy", description: "Tunnel tears itself down the moment the time limit or data cap is hit — whichever comes first." },
];

export default function HowItWorksPanel() {
  return (
    <Paper
      elevation={0}
      className="animate-fade-in-up"
      sx={{
        p: 3,
        borderRadius: "24px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "rgba(255, 255, 255, 0.45)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${tokens.border}`,
      }}
    >
      <Box>
        <Typography variant="h6" sx={{ fontSize: "1.1rem", fontWeight: 700, mb: 1, color: tokens.text }}>
          Tunnel Infrastructure Schema
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSecondary, fontSize: "0.82rem" }}>
          Full cryptographic path from initialization to self-destruction.
        </Typography>
      </Box>

      {/* Vertical timeline — fills available height evenly instead of one big gap */}
      <Box sx={{ position: "relative", flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly", py: 2 }}>
        <Box sx={{ position: "absolute", left: 23, top: 24, bottom: 24, width: "2px", bgcolor: tokens.border, zIndex: 0 }} />
        {ARCH_STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <Box key={step.label} sx={{ display: "flex", alignItems: "flex-start", gap: 2, position: "relative", zIndex: 1 }}>
              <Box sx={{
                width: 48,
                height: 48,
                minWidth: 48,
                borderRadius: "50%",
                bgcolor: "rgba(0, 0, 0, 0.02)",
                border: `1.5px solid ${tokens.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <Icon size={18} color={tokens.primary} />
              </Box>
              <Box sx={{ pt: 0.9 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.82rem", color: tokens.text }}>
                  {step.label}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: "0.75rem", color: tokens.textSecondary, mt: 0.3, lineHeight: 1.5 }}>
                  {step.description}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
