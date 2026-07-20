// frontend/src/components/HowItWorksPanel.jsx
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { User, KeyRound, Server, FileLock2, ArrowRight } from "lucide-react";
import { tokens } from "../theme";

const STEPS = [
  { icon: User, label: "Client" },
  { icon: KeyRound, label: "ECDH Handshake" },
  { icon: Server, label: "WireGuard" },
  { icon: FileLock2, label: "Encrypted Config" },
];

/**
 * Fills the empty-state screen (no tunnel yet) with a short architecture
 * explainer instead of leaving the layout half-blank. Purely illustrative —
 * not a rendering of live data.
 */
export default function HowItWorksPanel() {
  return (
    <Paper
      elevation={0}
      sx={{ p: 4, borderRadius: "20px", animation: "fadeInUp 350ms ease both",
        "@keyframes fadeInUp": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}
    >
      <Typography variant="h6" sx={{ mb: 0.5 }}>How OTNT Works</Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        Every tunnel is created fresh, encrypted end-to-end, and destroyed automatically.
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, flexWrap: "wrap", mb: 3 }}>
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <React.Fragment key={step.label}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 44, height: 44, borderRadius: "50%", bgcolor: tokens.background, border: `1.5px solid ${tokens.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={19} color={tokens.primary} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: tokens.text, fontSize: "0.78rem" }}>
                  {step.label}
                </Typography>
              </Box>
              {i < STEPS.length - 1 && <ArrowRight size={16} color={tokens.textSecondary} />}
            </React.Fragment>
          );
        })}
      </Box>

      <Box sx={{ borderTop: `1px solid ${tokens.border}`, pt: 2.5 }}>
        {[
          "Client generates a WireGuard + ECDH keypair locally — private keys never leave the browser.",
          "Server derives a shared secret and delivers the config, encrypted with AES-256-GCM.",
          "The tunnel self-destructs when either the time limit or data cap is reached — whichever comes first.",
        ].map((line, i) => (
          <Typography key={i} variant="body2" sx={{ mb: 0.8, display: "flex", gap: 1 }}>
            <span style={{ color: tokens.primary, fontWeight: 700 }}>{i + 1}.</span> {line}
          </Typography>
        ))}
      </Box>
    </Paper>
  );
}
