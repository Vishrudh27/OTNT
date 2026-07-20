// frontend/src/components/TunnelLifecycle.jsx
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { KeyRound, Network, FileLock2, Wifi, Timer, ArrowRight } from "lucide-react";
import { tokens } from "../theme";

const STAGES = [
  { key: "handshake", label: "Handshake", icon: KeyRound },
  { key: "created", label: "Tunnel", icon: Network },
  { key: "config", label: "Encryption", icon: FileLock2 },
  { key: "connected", label: "Config", icon: Wifi },
  { key: "destroy", label: "Destroy", icon: Timer },
];

export default function TunnelLifecycle({ handshakeDone, tunnelCreated, configReady, connected }) {
  const doneMap = { handshake: handshakeDone, created: tunnelCreated, config: configReady, connected, destroy: false };

  return (
    <Paper
      elevation={0}
      sx={{ p: 3, borderRadius: "20px", height: "100%", animation: "fadeInUp 350ms ease both",
        "@keyframes fadeInUp": { from: { opacity: 0, transform: "translateY(12px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}
    >
      <Typography variant="h6" sx={{ mb: 2.5 }}>Tunnel Lifecycle</Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const done = doneMap[stage.key];
          return (
            <React.Fragment key={stage.key}>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: done ? tokens.success : tokens.background, border: `1.5px solid ${done ? tokens.success : tokens.border}`, transition: "all 300ms ease" }}>
                  <Icon size={16} color={done ? "#fff" : tokens.textSecondary} />
                </Box>
                <Typography variant="body2" sx={{ mt: 0.8, fontWeight: 600, fontSize: "0.72rem", color: done ? tokens.text : tokens.textSecondary }}>
                  {stage.label}
                </Typography>
              </Box>
              {i < STAGES.length - 1 && <ArrowRight size={14} color={tokens.border} style={{ marginTop: -18 }} />}
            </React.Fragment>
          );
        })}
      </Box>
    </Paper>
  );
}
