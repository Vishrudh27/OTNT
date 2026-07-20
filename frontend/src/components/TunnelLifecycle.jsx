// frontend/src/components/TunnelLifecycle.jsx
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { Key, Network, Lock, Wifi, Timer } from "lucide-react";
import { tokens } from "../theme";

const STAGES = [
  { key: "handshake", label: "Handshake", icon: Key, description: "ECDH Keys derived" },
  { key: "created", label: "Kernel Tunnel", icon: Network, description: "WG Interface live" },
  { key: "config", label: "Decryption", icon: Lock, description: "AES-256 decrypted" },
  { key: "connected", label: "Configuration", icon: Wifi, description: "WG Config loaded" },
  { key: "destroy", label: "Self-Destruct", icon: Timer, description: "Time/Cap expiry" },
];

export default function TunnelLifecycle({ handshakeDone, tunnelCreated, configReady, connected }) {
  const doneMap = { 
    handshake: handshakeDone, 
    created: tunnelCreated, 
    config: configReady, 
    connected, 
    destroy: false 
  };

  return (
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
          Tunnel Lifecycle State
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 4, fontSize: "0.82rem" }}>
          Real-time tracking of the ephemeral tunnel sequence.
        </Typography>

        {/* Pipeline Container */}
        <Box sx={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", px: 2, mb: 2 }}>
          {/* Continuous connection line */}
          <Box sx={{
            position: "absolute",
            left: 24,
            right: 24,
            top: 22,
            height: "2px",
            background: `linear-gradient(90deg, 
              ${handshakeDone ? tokens.success : tokens.border} 0%, 
              ${tunnelCreated ? tokens.success : tokens.border} 25%, 
              ${configReady ? tokens.success : tokens.border} 50%, 
              ${connected ? tokens.success : tokens.border} 75%, 
              ${tokens.border} 100%)`,
            zIndex: 1,
            opacity: 0.6
          }} />

          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const done = doneMap[stage.key];
            
            // Nodes active color styling
            let nodeBg = "rgba(42, 42, 46, 0.1)";
            let iconColor = tokens.textSecondary;
            let glowEffect = "none";

            if (done) {
              nodeBg = `rgba(16, 185, 129, 0.15)`;
              iconColor = tokens.success;
              glowEffect = `0 0 15px rgba(16, 185, 129, 0.25)`;
            } else if (idx === 0 || doneMap[STAGES[idx - 1]?.key]) {
              // Current active/pending stage
              nodeBg = "rgba(217, 119, 6, 0.15)";
              iconColor = tokens.primary;
              glowEffect = `0 0 15px rgba(217, 119, 6, 0.18)`;
            }

            return (
              <Box 
                key={stage.key} 
                sx={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  alignItems: "center", 
                  zIndex: 2, 
                  position: "relative",
                  width: 50
                }}
              >
                <Box 
                  sx={{ 
                    width: 44, 
                    height: 44, 
                    borderRadius: "50%", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    bgcolor: nodeBg, 
                    border: `1.5px solid ${done ? tokens.success : (iconColor === tokens.primary ? tokens.primary : tokens.border)}`, 
                    boxShadow: glowEffect,
                    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                    animation: iconColor === tokens.primary ? "pulseOrange 2s infinite ease-in-out" : "none"
                  }}
                >
                  <Icon size={16} color={iconColor} />
                </Box>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    mt: 1.5, 
                    fontWeight: 700, 
                    fontSize: "0.68rem", 
                    color: done ? tokens.text : (iconColor === tokens.primary ? tokens.primary : tokens.textSecondary),
                    textAlign: "center",
                    whiteSpace: "nowrap"
                  }}
                >
                  {stage.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ 
        mt: 2, 
        p: 1.8, 
        borderRadius: "12px", 
        bgcolor: "rgba(0, 0, 0, 0.02)", 
        border: `1px solid ${tokens.border}` 
      }}>
        <Typography variant="body2" sx={{ fontSize: "0.72rem", color: tokens.textSecondary }}>
          ℹ️ <b>Active State Details:</b> {
            connected ? "Config loaded client-side. System fully connected." :
            configReady ? "Decryption successful. Ready for client import." :
            tunnelCreated ? "Interface active on host. Awaiting local decryption." :
            "Initiating cryptographic session..."
          }
        </Typography>
      </Box>
    </Paper>
  );
}
