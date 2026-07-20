// frontend/src/components/HowItWorksPanel.jsx
import React from "react";
import { Box, Paper, Typography, Tooltip } from "@mui/material";
import { Fingerprint, Key, Shield, Lock, Timer } from "lucide-react";
import { tokens } from "../theme";

const ARCH_STEPS = [
  { icon: Fingerprint, label: "Client Identity", description: "Browser-side WG Keypair" },
  { icon: Key, label: "ECDH Handshake", description: "Curve25519 Secret Derivation" },
  { icon: Shield, label: "WireGuard Tunnel", description: "Kernel Interface Allocation" },
  { icon: Lock, label: "AES Encryption", description: "Encrypted Config Delivery" },
  { icon: Timer, label: "Auto Destroy", description: "Dual-Condition Self-Destruct" },
];

function ConnectionFlowLine() {
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyCenter: "center", mx: -1, zIndex: 1 }}>
      <svg width="45" height="8" style={{ overflow: "visible" }}>
        <line 
          x1="0" 
          y1="4" 
          x2="45" 
          y2="4" 
          stroke={tokens.primary} 
          strokeWidth="1.5" 
          strokeDasharray="5,3"
          className="flow-connector" 
          style={{ opacity: 0.5 }}
        />
      </svg>
    </Box>
  );
}

export default function HowItWorksPanel() {
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
          Tunnel Infrastructure Schema
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSecondary, mb: 4, fontSize: "0.82rem" }}>
          Full cryptographic path from initialization to self-destruction.
        </Typography>

        {/* Horizontal Topology Map */}
        <Box sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: { xs: "wrap", md: "nowrap" },
          gap: { xs: 3, md: 0 },
          px: 1,
          mb: 4
        }}>
          {ARCH_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.label}>
                <Tooltip title={step.description} arrow placement="top">
                  <Box sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: "help",
                    zIndex: 2,
                    "&:hover .node-circle": {
                      transform: "scale(1.1)",
                      borderColor: tokens.secondary,
                      boxShadow: `0 0 15px rgba(245, 158, 11, 0.15)`
                    }
                  }}>
                    <Box 
                      className="node-circle"
                      sx={{
                        width: 50,
                        height: 50,
                        borderRadius: "50%",
                        bgcolor: "rgba(0, 0, 0, 0.02)",
                        border: `1.5px solid ${tokens.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    >
                      <Icon size={18} color={tokens.primary} />
                    </Box>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        mt: 1.5, 
                        fontWeight: 700, 
                        fontSize: "0.68rem", 
                        color: tokens.text,
                        textAlign: "center"
                      }}
                    >
                      {step.label}
                    </Typography>
                  </Box>
                </Tooltip>
                {idx < ARCH_STEPS.length - 1 && <ConnectionFlowLine />}
              </React.Fragment>
            );
          })}
        </Box>
      </Box>

      {/* Info List */}
      <Box sx={{
        borderTop: `1px solid ${tokens.border}`,
        pt: 3.5,
        display: "flex",
        flexDirection: "column",
        gap: 1.5
      }}>
        {[
          "Client generates a WireGuard + ECDH keypair locally — private keys never touch the network.",
          "Server derives a shared secret and delivers the client config encrypted with AES-256-GCM.",
          "The tunnel self-destructs dynamically when either the time limit or data limit is reached.",
        ].map((line, idx) => (
          <Box key={idx} sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
            <Typography sx={{ 
              fontFamily: "monospace", 
              fontWeight: 800, 
              color: tokens.primary, 
              fontSize: "0.85rem",
              lineHeight: 1.6
            }}>
              {`0${idx + 1}`}
            </Typography>
            <Typography variant="body2" sx={{ fontSize: "0.78rem", color: tokens.textSecondary, lineHeight: 1.6 }}>
              {line}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
