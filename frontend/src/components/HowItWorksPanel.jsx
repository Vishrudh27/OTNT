// frontend/src/components/HowItWorksPanel.jsx
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Fingerprint, Key, Shield, Lock, Timer } from "lucide-react";
import { tokens } from "../theme";

const ARCH_STEPS = [
  { icon: Fingerprint, label: "Client Identity", description: "Browser-side keypair" },
  { icon: Key, label: "ECDH Handshake", description: "Curve25519 shared secret" },
  { icon: Shield, label: "WireGuard Tunnel", description: "Real kernel interface" },
  { icon: Lock, label: "AES Encryption", description: "AES-256-GCM config" },
  { icon: Timer, label: "Auto Destroy", description: "Time or data cap" },
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

      {/* Horizontal step row — centered vertically so slack space splits evenly, not into one gap */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", py: 2 }}>
        <Box sx={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "nowrap" }}>
          <Box sx={{ position: "absolute", left: 28, right: 28, top: 28, height: "8px" }}>
            <svg width="100%" height="8" style={{ overflow: "visible", display: "block" }}>
              <line
                x1="0" y1="4" x2="100%" y2="4"
                stroke={tokens.primary}
                strokeWidth="2"
                className="flow-connector"
                style={{ opacity: 0.55, filter: "drop-shadow(0 0 3px rgba(217, 119, 6, 0.55))" }}
              />
            </svg>
          </Box>
          {ARCH_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Box key={step.label} sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", position: "relative", zIndex: 1, flex: "1 1 0", minWidth: 0 }}>
                <Box sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  bgcolor: "rgba(0, 0, 0, 0.02)",
                  border: `1.5px solid ${tokens.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 1.2,
                }}>
                  <Icon size={22} color={tokens.primary} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.78rem", color: tokens.text, lineHeight: 1.3 }}>
                  {step.label}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: "0.7rem", color: tokens.textSecondary, mt: 0.3, lineHeight: 1.3 }}>
                  {step.description}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
}
